/**
 * Prompt 78 — Replaces preset `sdr-voice-system-layers` when a user-defined voice is selected.
 */
import type { CustomVoiceProfile } from "@/agents/types";

export type CustomVoicePhase = "research" | "outreach" | "qualification" | "nurture";

function examplesBlock(p: CustomVoiceProfile): string {
  const lines = p.examples
    .filter((x) => typeof x === "string" && x.trim().length > 0)
    .slice(0, 5)
    .map((ex, i) => `${i + 1}. ${ex.trim()}`);
  return lines.length > 0 ? lines.join("\n") : "(add examples in the dashboard)";
}

export function customVoiceSystemLayer(phase: CustomVoicePhase, p: CustomVoiceProfile): string {
  const ex = examplesBlock(p);
  const phaseLine =
    phase === "research"
      ? "Apply this voice to **every** narrative field in the research JSON — executive_summary, ICP, pains, angles, BANT, reasoning_steps — with the same diction and stance as the examples."
      : phase === "outreach"
        ? "Apply this voice to **subject**, **email_body HTML**, and **linkedin_message** — must feel like the same rep as the examples (not a generic template)."
        : phase === "qualification"
          ? "Apply this voice to **bant_summary** and **next_best_action** (objections stay buyer-voice). Scoring should reward faithful execution of this custom voice."
          : "Apply this voice to **sequence_summary** and **all three follow-up steps** — same rhythm and helpfulness as the examples.";

  return (
    `### CUSTOM SDR VOICE — ${p.name} (${phase})\n` +
    `**User-authored voice — overrides conflicting preset instructions below.**\n\n` +
    `**Description:**\n${p.description.trim()}\n\n` +
    `**Tone instructions (non-negotiable):**\n${p.tone_instructions.trim()}\n\n` +
    `**Example messages (study rhythm, diction, and pacing — never copy verbatim):**\n${ex}\n\n` +
    `${phaseLine}\n`
  );
}
