import {
  buildQualificationSystemPrompt,
  SALES_AGENT_TEMPERATURE,
} from "@/agents/graph-prompts";
import {
  buildFallbackQualification,
  normalizeQualificationLlmToCanonical,
} from "@/agents/qualification-normalize";
import type {
  Lead,
  OutreachDraft,
  QualificationAgentResult,
  SdrVoiceTone,
} from "@/agents/types";
import { qualificationAgentLlmSchema } from "@/agents/types";
import {
  invokeWithGroqRateLimitResilience,
  type GroqInvokeMeta,
} from "@/lib/agent-model";
import {
  getSdrVoiceQualificationHint,
  getSdrVoiceQualificationPlaybookInstructions,
  resolveSdrVoiceTone,
  sdrVoiceLabel,
} from "@/lib/sdr-voice";

export async function runQualificationAgent(
  lead: Lead,
  outreach: OutreachDraft,
  emailWasSent: boolean,
  opts?: {
    pipelineContext?: string;
    scoringAnchor?: string;
    /** Aligns recovery score with research ICP when LLM fails. */
    icpFromResearch?: number;
    /** From graph — canonical campaign voice (Prompt 42). */
    sdrVoice?: SdrVoiceTone;
  },
): Promise<{
  result: QualificationAgentResult;
  degraded: boolean;
  groqInvokeMeta?: GroqInvokeMeta;
}> {
  const pipelineContext =
    opts?.pipelineContext?.trim() ||
    "(no pipeline context — score from lead + outreach only)";
  const scoringAnchor =
    opts?.scoringAnchor?.trim() ||
    "(no ICP anchor — infer from lead + research JSON + outreach).";

  const voice = opts?.sdrVoice ?? resolveSdrVoiceTone(lead);
  const voiceHint = getSdrVoiceQualificationHint(voice);
  const playbookVoice = getSdrVoiceQualificationPlaybookInstructions(voice);

  const human = `=== ACTIVE_CAMPAIGN_VOICE (graph → qualification_node) ===
sdrVoice: ${voice} (${sdrVoiceLabel(voice)})

LEAD: ${JSON.stringify(lead)}
ANCHOR: ${scoringAnchor}
RESEARCH_JSON: ${pipelineContext}
SDR_VOICE: ${voice} — ${voiceHint}

PLAYBOOK_VOICE (apply to bant_summary + next_best_action only; objections stay buyer-voice):
${playbookVoice}

OUTREACH:
subject=${outreach.subject}
angle=${outreach.primary_angle}
cta=${outreach.cta_strategy}
hooks=${outreach.personalization_hooks.join(" | ")}
li=${outreach.linkedin_message}
html_excerpt=${outreach.email_body.slice(0, 1200)}
EMAIL_SENT=${emailWasSent ? "yes" : "no"}

Return JSON only (Prompt 38 + **48** + **57** + **58** + **67**). **Nuanced strategic** qual — **buyer beliefs**, silent blockers, budget theater, competing priorities; **not** checkbox BANT. **bant_summary** = internal deal-review quality: **tradeoffs**, **what we still don't know**, **who can kill it quietly** — **conversational AE Slack**, not memo-speak (**58**: ban "Furthermore", "It is important to", "Key considerations"). **Prompt 67:** **top_objections** = three **distinct chapters** of doubt (not three budget clones); **bant_summary** sounds like a **top rep** wrote it — **consultative**, **specific**, **zero** corporate jargon. **Zero** system/schema/model/timeout leakage. Never paste raw outreach into bant_summary. **bant_summary** must not recycle phrasing from **RESEARCH_JSON** executive_summary, icp_fit_summary, recent_news_or_funding_summary, or bant_assessment evidence — new vocabulary and deal narrative only.

Score outreach against **ANCHOR + SDR_VOICE**: reward copy that **executes the selected preset** (data voice → metrics/ROI; consultative → strategic partnership; warm → empathy+rapport+consultative ease; challenger → professional tension). Penalize **preset mismatch**. top_objections: three **different** **psychological / political** mechanisms, not three flavors of "no budget". Prefer **odd** scores when ambiguous. Track research ICP unless outreach breaks fit.`;

  const systemPrompt = buildQualificationSystemPrompt(voice);
  const prompt = `${systemPrompt}\n\n---\n${human}`;
  const icpHint = opts?.icpFromResearch;

  try {
    const { value: raw, meta } = await invokeWithGroqRateLimitResilience(
      "qualification_agent",
      SALES_AGENT_TEMPERATURE,
      (m) =>
        m
          .withStructuredOutput(qualificationAgentLlmSchema, {
            name: "qualification",
          })
          .invoke(prompt),
    );
    const lax = qualificationAgentLlmSchema.safeParse(raw);
    if (!lax.success) {
      return {
        result: buildFallbackQualification(lead, "llm_schema_mismatch", {
          icpHint,
        }),
        degraded: true,
        groqInvokeMeta: meta,
      };
    }
    const { result, usedFallback } = normalizeQualificationLlmToCanonical(lax.data, {
      lead,
      icpFromResearch: icpHint,
    });
    return {
      result,
      degraded: usedFallback,
      groqInvokeMeta: meta,
    };
  } catch {
    return {
      result: buildFallbackQualification(lead, "llm_invoke_or_parse_error", {
        icpHint,
      }),
      degraded: true,
    };
  }
}
