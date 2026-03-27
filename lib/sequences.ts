import "server-only";

import type {
  CampaignSequencePlan,
  SequenceChannel,
  SequenceRunProgress,
  SequenceStep,
} from "@/agents/types";
import { z } from "zod";

const CHANNEL_VALUES: SequenceChannel[] = ["email", "linkedin", "call", "follow_up"];

const sequenceStepSchema = z.object({
  id: z.string().min(1).max(80),
  channel: z.enum(["email", "linkedin", "call", "follow_up"]),
  label: z.string().max(120).optional(),
});

export const campaignSequenceStepsSchema = z.array(sequenceStepSchema).min(1).max(16);

export function defaultSequenceSteps(): SequenceStep[] {
  return [
    { id: "s-email", channel: "email", label: "Email" },
    { id: "s-li", channel: "linkedin", label: "LinkedIn" },
    { id: "s-call", channel: "call", label: "Call" },
    { id: "s-fu", channel: "follow_up", label: "Follow-up" },
  ];
}

export function channelLabel(ch: SequenceChannel): string {
  switch (ch) {
    case "email":
      return "Email";
    case "linkedin":
      return "LinkedIn";
    case "call":
      return "Call";
    case "follow_up":
      return "Follow-up";
    default:
      return ch;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Parse + validate steps from DB JSON (backward-compatible). */
export function parseSequenceStepsFromJson(raw: unknown): SequenceStep[] {
  if (!Array.isArray(raw)) return defaultSequenceSteps();
  const out: SequenceStep[] = [];
  for (const row of raw) {
    if (!isRecord(row)) continue;
    const id = typeof row.id === "string" ? row.id : "";
    const ch = row.channel;
    if (!CHANNEL_VALUES.includes(ch as SequenceChannel) || !id.trim()) continue;
    const label = typeof row.label === "string" ? row.label : undefined;
    out.push({
      id: id.slice(0, 80),
      channel: ch as SequenceChannel,
      ...(label ? { label: label.slice(0, 120) } : {}),
    });
  }
  const check = campaignSequenceStepsSchema.safeParse(out);
  return check.success && check.data.length > 0 ? check.data : defaultSequenceSteps();
}

function outreachMilestoneMet(state: {
  outreach_output?: unknown;
  results?: Record<string, unknown>;
}): boolean {
  if (state.outreach_output && typeof state.outreach_output === "object") return true;
  const n = state.results?.outreach_node;
  if (isRecord(n) && typeof n.error === "string") return false;
  return isRecord(n);
}

function qualificationMilestoneMet(state: {
  qualification_detail?: unknown;
  qualification_score?: unknown;
  results?: Record<string, unknown>;
}): boolean {
  if (typeof state.qualification_score === "number") return true;
  if (state.qualification_detail && typeof state.qualification_detail === "object") return true;
  const n = state.results?.qualification_node;
  return isRecord(n) && typeof n.error !== "string";
}

function nurtureMilestoneMet(state: { nurture_output?: unknown; results?: Record<string, unknown> }): boolean {
  if (state.nurture_output && typeof state.nurture_output === "object") return true;
  const n = state.results?.nurture_node;
  return isRecord(n) && typeof n.error !== "string";
}

/**
 * Maps multi-channel steps to LangGraph milestones (default pipeline order is unchanged).
 * - email + linkedin: complete when outreach milestone is met.
 * - call: complete when qualification milestone is met.
 * - follow_up: complete when nurture milestone is met.
 */
export function computeSequenceRunProgress(
  plan: CampaignSequencePlan | undefined | null,
  state: {
    outreach_output?: unknown;
    qualification_detail?: unknown;
    qualification_score?: unknown;
    nurture_output?: unknown;
    results?: Record<string, unknown>;
  },
): SequenceRunProgress | null {
  if (!plan?.steps?.length) return null;
  const od = outreachMilestoneMet(state);
  const qd = qualificationMilestoneMet(state);
  const nd = nurtureMilestoneMet(state);

  const completed = plan.steps.map((step) => {
    switch (step.channel) {
      case "email":
      case "linkedin":
        return od;
      case "call":
        return qd;
      case "follow_up":
        return nd;
      default:
        return false;
    }
  });

  const currentIndex = completed.findIndex((c) => !c);
  return {
    steps: plan.steps,
    completed,
    currentIndex: currentIndex === -1 ? plan.steps.length : currentIndex,
  };
}
