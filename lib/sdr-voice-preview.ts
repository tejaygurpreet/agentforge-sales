/**
 * Prompt 44 — Static sample copy for "Preview voice" (illustrative only, not sent).
 * Uses a fictional account so reps see cadence + register without real PII.
 */
import type { SdrVoiceTone } from "@/agents/types";

export type VoiceEmailPreview = {
  subject: string;
  body: string;
  disclaimer: string;
};

const DISCLAIMER =
  "Illustrative sample for the selected preset — not generated from your lead. Actual campaigns use your research and notes.";

export function getVoiceSampleEmailPreview(tone: SdrVoiceTone): VoiceEmailPreview {
  switch (tone) {
    case "warm_relationship_builder":
      return {
        subject: "Northbridge — something I've seen with teams like yours",
        body: `Hi Jordan — with the Q2 push at Northbridge Labs, I've seen teams in your seat juggling delivery and pipeline hygiene at the same time.

What I hear from peers is the handoff between product marketing and outbound gets noisy right before a launch — not broken, just crowded.

If it's useful, I can send a one-page sanity check others used to keep messaging tight without adding meetings. If timing's off, totally fine to ignore.`,
        disclaimer: DISCLAIMER,
      };
    case "bold_challenger":
      return {
        subject: "Northbridge — the 15–25% pipeline pattern",
        body: `Jordan — teams in comparable seats often see 15–25% of qualified pipeline soften when CRM hygiene lags how reps actually work (pattern I've seen in similar B2B ops — not a dig at your team).

The usual blind spot is assuming "good enough" reporting matches the live motion — worth pressure-testing once a quarter.

If a 12-minute read on where that gap typically shows up would help, I'm happy to share — or tell me what would make this worth your time.`,
        disclaimer: DISCLAIMER,
      };
    case "data_driven_analyst":
      return {
        subject: "Northbridge — funnel yield + 8–12pt win-rate hypothesis",
        body: `Jordan — quick read on Northbridge Labs: typical Series B SaaS peers see stage-2→3 conversion in the high teens when SDR→AE handoffs are instrumented; when they're not, we often observe an 8–12 point drag in comparable motions.

If your current yield is closer to the lower band, a 4-week cohort on reply-to-meeting and stage velocity usually surfaces where to fix first.

Happy to share a baseline funnel sheet template — no pitch deck.`,
        disclaimer: DISCLAIMER,
      };
    case "consultative_enterprise":
      return {
        subject: "Northbridge — steering cadence for RevOps + GTM alignment",
        body: `Jordan — for an organization at Northbridge's scale, the durable question is how RevOps, sales leadership, and product marketing align on a single operating cadence — not which point tool wins.

We've seen the cleanest path start with a short steering readout: decision criteria, stakeholders, and what "good" looks like in 90 days.

If a working-session format would be useful, I can propose a tight agenda.`,
        disclaimer: DISCLAIMER,
      };
    case "default":
    default:
      return {
        subject: "Northbridge — noticed the launch cadence",
        body: `Hi Jordan — the way Northbridge is sequencing the platform launch reads intentional; the part that usually gets crunchy is keeping outbound specific without slowing the team down.

I had one angle that might save you a back-and-forth on messaging handoffs — happy to share in two bullets if you want them.

Thanks either way.`,
        disclaimer: DISCLAIMER,
      };
  }
}
