import type { CustomVoiceProfile } from "@/agents/types";

/** Human-prompt blocks when custom voice is active (complements system layer). */
export function customVoiceResearchHumanBlock(p: CustomVoiceProfile): string {
  return (
    `CUSTOM_SDR_VOICE_RESEARCH — "${p.name}": mirror **tone_instructions** across all JSON strings; ` +
      `use **examples** as style reference only. Stay grounded in LEAD + web digest.`
  );
}

export function customVoiceOutreachPriorityNote(p: CustomVoiceProfile): string {
  return (
    `VOICE_PRIORITY: **CUSTOM "${p.name}"** — user-defined tone **wins** over generic default warmth. ` +
      `Match **tone_instructions** and the **spirit** of the examples in subject, HTML body, and LinkedIn.`
  );
}

export function customVoiceOutreachInstructionsBlock(p: CustomVoiceProfile): string {
  return (
    `SDR_VOICE — **CUSTOM: ${p.name}** — Prompt 78:\n` +
      `- Subject + HTML + LinkedIn must **feel** like the same seller as **tone_instructions** and the **example messages** (rhythm, vocabulary, stance — not verbatim reuse).\n` +
      `- Keep structure rules (greeting-only first <p>, sign-off block, LinkedIn ≤300 chars) — **style** follows this custom voice.\n` +
      `- Description context: ${p.description.trim().slice(0, 400)}`
  );
}

export function customVoiceNurtureHumanTail(p: CustomVoiceProfile): string {
  return (
    `**MANDATORY (custom voice):** Every nurture field must sound like **${p.name}** — consult **tone_instructions** and match example **cadence**.`
  );
}

export function customVoiceNurtureInstructionsBlock(p: CustomVoiceProfile): string {
  return (
    `NURTURE_VOICE (Custom: ${p.name}) — Prompt 78:\n` +
      `- **sequence_summary** + all 3 steps must match **tone_instructions** and the **cadence** of the examples.\n` +
      `- Vary channels; keep Prompt 38 substance rules — **voice** is user-defined.\n` +
      `${customVoiceNurtureHumanTail(p)}`
  );
}

export function customVoiceQualificationHint(p: CustomVoiceProfile): string {
  return (
    `Score/copy test: **custom voice "${p.name}"** — reward outreach + qual copy that **executes** the user's tone_instructions; penalize preset-generic output.`
  );
}

export function customVoiceQualificationPlaybookBlock(p: CustomVoiceProfile): string {
  return (
    `Write **bant_summary** and **next_best_action** in **"${p.name}"** voice: follow **tone_instructions**; ` +
      `sound like the same rep as the example messages (fresh wording, same stance).`
  );
}

export function customVoiceQualificationScoringSupplement(p: CustomVoiceProfile): string {
  return (
    `Reward outreach and qual that **faithfully execute** the custom voice **${p.name}** (description + tone_instructions + example rhythm). ` +
      `Penalize generic SaaS voice that ignores the custom brief.`
  );
}
