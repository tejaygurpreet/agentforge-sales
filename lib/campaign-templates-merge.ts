import type { LeadFormInput, SdrVoiceTone } from "@/agents/types";
import { SDR_VOICE_TONE_VALUES } from "@/agents/types";

function normTone(v: unknown): SdrVoiceTone | undefined {
  if (typeof v !== "string") return undefined;
  return SDR_VOICE_TONE_VALUES.includes(v as SdrVoiceTone) ? (v as SdrVoiceTone) : undefined;
}

/**
 * Prompt 85 — merge saved template defaults onto the current lead form (identity fields stay from `base`).
 */
export function mergeTemplatePayloadIntoLeadForm(
  base: LeadFormInput,
  payload: Record<string, unknown> | null | undefined,
): LeadFormInput {
  if (!payload || typeof payload !== "object") return base;
  const p = payload;
  const tone = normTone(p.sdr_voice_tone) ?? base.sdr_voice_tone;
  const cvId = typeof p.custom_voice_id === "string" && p.custom_voice_id.trim() ? p.custom_voice_id.trim() : undefined;
  const cvName = typeof p.custom_voice_name === "string" ? p.custom_voice_name : undefined;
  const notes = typeof p.notes === "string" ? p.notes : base.notes;
  const li = typeof p.linkedin_url === "string" ? p.linkedin_url : base.linkedin_url;
  const phone = typeof p.phone === "string" ? p.phone : base.phone;

  return {
    ...base,
    name: base.name,
    email: base.email,
    company: base.company,
    status: base.status ?? "new",
    linkedin_url: li ?? "",
    phone: phone ?? undefined,
    notes: notes ?? "",
    sdr_voice_tone: tone,
    custom_voice_id: cvId,
    custom_voice_name: cvName,
  };
}
