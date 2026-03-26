import {
  buildOutreachSystemPrompt,
  OUTREACH_AGENT_TEMPERATURE,
} from "@/agents/graph-prompts";
import { buildFallbackOutreachDraft } from "@/agents/pipeline-fallbacks";
import type { Lead, SdrVoiceTone } from "@/agents/types";
import {
  getSdrVoiceOutreachInstructions,
  getSdrVoiceOutreachPriorityNote,
  sdrVoiceLabel,
} from "@/lib/sdr-voice";
import { type OutreachDraft, outreachDraftSchema } from "@/agents/types";
import {
  invokeWithGroqRateLimitResilience,
  type GroqInvokeMeta,
} from "@/lib/agent-model";

export type OutreachAgentResult = {
  draft: OutreachDraft;
  groqInvokeMeta?: GroqInvokeMeta;
};

export async function runOutreachAgent(
  lead: Lead,
  priorStageContext: string | undefined,
  sdrVoice: SdrVoiceTone,
): Promise<OutreachAgentResult> {
  const voice = sdrVoice;
  const voiceBlock = getSdrVoiceOutreachInstructions(voice);
  const priority = getSdrVoiceOutreachPriorityNote(voice);

  const defaultWarmthBlock =
    voice === "default"
      ? `Prompt 39 + **48**: **Veteran SDR** — relaxed, conversational, **benefit-first** (what they get back: time, clarity, less thrash) without brochure tone. **Human-first opening** + soft landing; **one main idea per <p>**; read-aloud smooth. LinkedIn = **different** from email: shorter, more casual DM — never a trimmed email. No meta about "research" or sources.`
      : `Default baseline warmth applies **only where it does not contradict** SDR_VOICE. If tradeoff, **choose SDR_VOICE**.`;

  const human = `=== ACTIVE_CAMPAIGN_VOICE (graph → outreach_node) ===
sdrVoice: ${voice} (${sdrVoiceLabel(voice)})
=== ${priority} ===
SDR_VOICE_PRESET: ${voice}
${voiceBlock || "SDR_VOICE: default — balanced human SDR bar."}

LEAD: ${JSON.stringify(lead)}
PRIOR_RESEARCH_JSON: ${priorStageContext?.trim() ? priorStageContext : "(none — lead fields only)"}

Valid HTML email_body; linkedin_message ≤300 chars. ${defaultWarmthBlock} **0 ? in body default; max 1** (voice presets may tighten further per SDR_VOICE). **100–175 words**, 3–4 <p> unless SDR_VOICE specifies otherwise. Ban stiff/generic phrases (checking in, following up on, per my last, as discussed, utilize, streamline, robust, paradigm, holistic, unpack, etc.). **Prompt 48 + 57 + 58:** every line = **homework-done human** — benefit-first, low-pressure, **high reply potential**; **subject** = **curiosity-native** peer text (not marketing headline). **warm_relationship_builder:** email + LinkedIn must feel **genuinely warm and consultative** — **zero** corporate jargon; **tier-1 SDR** bar vs default. **Prompt 58:** **inbox read-aloud** clean; subject **anchors** on a real research detail when preset is warm. Rewrite until subject + body + LinkedIn **prove** preset **${voice}** to a skeptical AE.`;

  const systemPrompt = buildOutreachSystemPrompt(sdrVoice);
  const prompt = `${systemPrompt}\n\n---\n${human}`;

  try {
    const { value: raw, meta } = await invokeWithGroqRateLimitResilience(
      "outreach_agent",
      OUTREACH_AGENT_TEMPERATURE,
      (m) =>
        m
          .withStructuredOutput(outreachDraftSchema, { name: "outreach_draft" })
          .invoke(prompt),
    );
    const parsed = outreachDraftSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn("[AgentForge] outreach_agent:parse_fallback", parsed.error.flatten());
      return {
        draft: buildFallbackOutreachDraft(lead, "outreach_schema_parse_failed"),
        groqInvokeMeta: meta,
      };
    }
    return { draft: parsed.data, groqInvokeMeta: meta };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[AgentForge] outreach_agent:invoke_fallback", message);
    return { draft: buildFallbackOutreachDraft(lead, message) };
  }
}
