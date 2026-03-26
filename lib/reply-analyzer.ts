import "server-only";

import { z } from "zod";
import { SDR_VOICE_TONE_VALUES } from "@/agents/types";
import {
  assertLlmConfigured,
  invokeWithGroqRateLimitResilience,
} from "@/lib/agent-model";
import { sdrVoiceLabel } from "@/lib/sdr-voice";

const replyAnalysisSchema = z.object({
  sentiment: z.enum(["positive", "neutral", "negative", "mixed"]),
  interest_level_0_to_10: z.number().int().min(0).max(10),
  objections_detected: z.array(z.string()).max(6),
  buying_signals: z.array(z.string()).max(6),
  suggested_next_nurture_step: z.string().max(720),
  suggested_voice: z.enum(SDR_VOICE_TONE_VALUES),
  rationale: z.string().max(380),
});

export type ReplyAnalysisResult = z.infer<typeof replyAnalysisSchema>;

export type ReplyAnalysisWithLabels = ReplyAnalysisResult & {
  suggested_voice_label: string;
};

/**
 * Prompt 45 — Prospect reply triage for nurture / voice tuning (server-only).
 */
export async function analyzeProspectReply(replyText: string): Promise<ReplyAnalysisResult> {
  assertLlmConfigured();
  const trimmed = replyText.trim().slice(0, 12_000);
  const system = `You are AgentForge Sales — a principal-level revenue operator. Analyze the prospect's reply only from the text provided.

Output strict JSON matching the schema. Be specific and actionable — no generic CRM fluff.

**rationale** (Prompt 49): **≤3 short sentences**, **≤380 characters total**. Professional, tight — state **why** sentiment + interest map to **suggested_voice** only. No bullet lists, no "firstly/secondly", no hedging stack, no repetition of the nurture step text.

**suggested_next_nurture_step**: One crisp paragraph, **≤720 characters** — the **very next** rep move only.

**suggested_voice** = best preset for the *next* touch if we re-run or draft follow-up:
- default: balanced human SDR
- warm_relationship_builder: trust, rapport, soft CTA if they sound cautious or relationship-led
- bold_challenger: they engaged with ideas but need a crisp reframe (still professional)
- data_driven_analyst: they asked for numbers, ROI, proof, or metrics
- consultative_enterprise: exec steering, procurement, multi-stakeholder tone

**interest_level_0_to_10**: 0 = hard no / unsubscribe tone; 5 = polite fence; 8+ = clear curiosity or meeting intent.`;

  const human = `PROSPECT_REPLY:\n---\n${trimmed}\n---\n\nReturn JSON only.`;

  const { value: raw } = await invokeWithGroqRateLimitResilience(
    "reply_analyzer",
    0.18,
    (m) =>
      m
        .withStructuredOutput(replyAnalysisSchema, { name: "reply_analysis" })
        .invoke(`${system}\n\n${human}`),
  );

  const parsed = replyAnalysisSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      sentiment: "neutral",
      interest_level_0_to_10: 5,
      objections_detected: [],
      buying_signals: [],
      suggested_next_nurture_step:
        "Mirror their last line, add one crisp question on timing or priority, and offer a 15-minute working session with a concrete agenda.",
      suggested_voice: "default",
      rationale:
        "Structured parse did not land; treat as neutral-to-warm and confirm intent with a tight follow-up question grounded in their wording.",
    };
  }
  return parsed.data;
}

export function replyAnalysisWithLabels(result: ReplyAnalysisResult): ReplyAnalysisWithLabels {
  return {
    ...result,
    suggested_voice_label: sdrVoiceLabel(result.suggested_voice),
  };
}
