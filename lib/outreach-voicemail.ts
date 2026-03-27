import type { Lead, SdrVoiceTone } from "@/agents/types";

function firstNameForVoicemail(lead: Lead): string {
  const raw = (lead.name ?? "").trim().split(/\s+/)[0] ?? "";
  let s = raw.replace(/^[^a-zA-ZÀ-ÿ]+/u, "");
  const cut = s.search(/[^a-zA-ZÀ-ÿ'-]/u);
  if (cut !== -1) s = s.slice(0, cut);
  return s.length > 0 ? s : "there";
}

/**
 * Ensures a spoken voicemail script for Twilio Say + Polly (Prompt 77).
 * Prefer LLM output; otherwise a tone-aware fallback.
 */
export function voicemailScriptForLead(
  lead: Lead,
  sdrVoice: SdrVoiceTone,
  raw: string | undefined,
): string {
  const t = raw?.trim().replace(/\s+/g, " ");
  if (t && t.length > 24) return t.slice(0, 600);
  const first = firstNameForVoicemail(lead);
  const co = (lead.company || "your team").trim();
  const shortCo = co.split(/\s+/).slice(0, 4).join(" ").slice(0, 56);
  const toneHint =
    sdrVoice === "bold_challenger"
      ? "I'll be direct: "
      : sdrVoice === "data_driven_analyst"
        ? "One data point: "
        : sdrVoice === "consultative_enterprise"
          ? "Briefly: "
          : "";
  const body = `${toneHint}Hi ${first}, leaving a quick message about ${shortCo}. I sent an email with a concrete angle — if it resonates, reply or call back. If not, no worries. Thanks.`;
  return body.slice(0, 600);
}
