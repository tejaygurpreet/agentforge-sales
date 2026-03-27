import {
  buildNurtureSystemPrompt,
  SALES_AGENT_TEMPERATURE,
} from "@/agents/graph-prompts";
import { buildFallbackNurtureOutput } from "@/agents/pipeline-fallbacks";
import type {
  CustomVoiceProfile,
  Lead,
  NurtureOutput,
  OutreachOutput,
  QualificationAgentResult,
  ResearchOutput,
  SdrVoiceTone,
} from "@/agents/types";
import { nurtureOutputSchema } from "@/agents/types";
import {
  invokeWithGroqRateLimitResilience,
  type GroqInvokeMeta,
} from "@/lib/agent-model";
import { DEFAULT_BRAND_DISPLAY_NAME } from "@/lib/brand-prompt";
import { getSdrVoiceNurtureInstructions, sdrVoiceLabel } from "@/lib/sdr-voice";

export type NurtureAgentResult = {
  output: NurtureOutput;
  groqInvokeMeta?: GroqInvokeMeta;
};

export async function runNurtureAgent(
  lead: Lead,
  ctx: {
    qualification_score: number;
    qualification_detail?: QualificationAgentResult;
    research_output?: ResearchOutput;
    outreach_output?: OutreachOutput;
  },
  sdrVoice: SdrVoiceTone,
  opts?: {
    customVoice?: CustomVoiceProfile | null;
    brandDisplayName?: string;
    /** Prompt 83 — real buyer phrases from transcribed calls in this workspace. */
    livingObjectionLibraryContext?: string;
  },
): Promise<NurtureAgentResult> {
  const qualBlob = ctx.qualification_detail
    ? JSON.stringify({
        score: ctx.qualification_detail.score,
        top_objections: ctx.qualification_detail.top_objections,
        bant_summary: ctx.qualification_detail.bant_summary.slice(0, 800),
        next_best_action: ctx.qualification_detail.next_best_action.slice(0, 400),
        meeting_time_suggestions: ctx.qualification_detail.meeting_time_suggestions ?? [],
        response_pattern_hint: ctx.qualification_detail.response_pattern_hint ?? null,
      })
    : "(infer from score only)";

  const voice = sdrVoice;
  const custom = opts?.customVoice ?? undefined;
  const brand = opts?.brandDisplayName?.trim() || DEFAULT_BRAND_DISPLAY_NAME;
  const nurtureVoice = getSdrVoiceNurtureInstructions(voice, custom);
  const voiceLine = custom?.name?.trim()
    ? `${sdrVoiceLabel(voice)} / ${custom.name}`
    : sdrVoiceLabel(voice);
  const objectionLib =
    opts?.livingObjectionLibraryContext?.trim() ||
    "(no prior transcribed-call objections for this workspace yet.)";
  const human = `=== ACTIVE_CAMPAIGN_VOICE (graph → nurture_node) ===
sdrVoice: ${voice} (${voiceLine})

LEAD: ${JSON.stringify(lead)}
QUAL_SCORE: ${ctx.qualification_score}
QUAL: ${qualBlob}
RESEARCH: ${JSON.stringify(ctx.research_output ?? {})}
OUTREACH: ${JSON.stringify(ctx.outreach_output ?? {})}
${objectionLib}
SDR_VOICE_PRESET: ${voice}
${nurtureVoice}

Prompt 38 + **49** + **57** + **58** + **69** + **89**: 3 steps — **value-driven + creative**; at least one **pure generosity** touch; **different opening word** each step; varied channel; realistic spacing; tie to objections; **zero** filler recycled from qual/research; **zero** system/LLM/API leakage. **Prompt 49:** no **5+ word copy** from research exec/ICP/news, qual **bant_summary**, or **messaging_angles** — paraphrase into **fresh cadence**. **Prompt 57:** **warm_relationship_builder** → nurture must **build relationship** — helpful, **unscripted** rhythm; **never** "Day N: pitch" cadence. **Prompt 58:** each **content_asset_suggestion** = **named, specific artifact** for **this** account’s motion — no generic "case study" / "resource" alone. **Prompt 69:** **Elite cadence** — **strategic arc** in sequence_summary; each step **bespoke** (named assets, **causal** timing); must feel **designed for this account**, not a rotated template. **Prompt 89:** optional **meeting_scheduling_hint** and **meeting_time_suggestions** only when a meeting follow-up fits the arc; may refine qual slots without copying **next_best_action** verbatim.

**MANDATORY:** sequence_summary + every step's summary, value_add_idea, content_asset_suggestion, and timing_rationale must **sound unmistakably like SDR_VOICE_PRESET** above. If preset is data_driven_analyst, include **concrete metric/benchmark/ROI hooks** where honest. If warm_relationship_builder, **empathetic conversational** cadence — **consultative friend**, not drip automation. If bold_challenger, **professional tension**. If consultative_enterprise, **strategic long-horizon** advisor tone. Default: effortless human Slack-to-colleague clarity.`;

  const systemPrompt = buildNurtureSystemPrompt(sdrVoice, custom, brand);
  const prompt = `${systemPrompt}\n\n---\n${human}`;

  try {
    const { value: raw, meta } = await invokeWithGroqRateLimitResilience(
      "nurture_agent",
      SALES_AGENT_TEMPERATURE,
      (m) =>
        m
          .withStructuredOutput(nurtureOutputSchema, { name: "nurture_plan" })
          .invoke(prompt),
    );
    const parsed = nurtureOutputSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn("[AgentForge] nurture_agent:parse_fallback", parsed.error.flatten());
      return {
        output: buildFallbackNurtureOutput(lead, "nurture_schema_parse_failed"),
        groqInvokeMeta: meta,
      };
    }
    return { output: parsed.data, groqInvokeMeta: meta };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[AgentForge] nurture_agent:invoke_fallback", message);
    return { output: buildFallbackNurtureOutput(lead, message) };
  }
}
