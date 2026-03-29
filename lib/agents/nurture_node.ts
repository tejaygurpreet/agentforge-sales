import "server-only";

import type {
  NurtureOutput,
  QualificationAgentResult,
  ReplyFollowUpIntel,
  SmartFollowUpEngineState,
  SmartFollowUpStepPlan,
} from "@/agents/types";

export {
  loadLivingObjectionContextForWorkspace,
  buildMeetingSchedulingPromptBlock,
  inferLeadTimezoneHint,
  inferResponsePatternFromOutreach,
} from "@/lib/agents/qualification_node";

/** Prompt 89 — keep nurture slots if model omitted them but qual produced structured windows. */
export function mergeQualMeetingIntoNurtureOutput(
  nurture: NurtureOutput,
  qual: QualificationAgentResult | undefined | null,
): NurtureOutput {
  if (nurture.meeting_time_suggestions && nurture.meeting_time_suggestions.length > 0) {
    return nurture;
  }
  const fromQual = qual?.meeting_time_suggestions;
  if (!fromQual?.length) return nurture;
  return { ...nurture, meeting_time_suggestions: fromQual };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Preferred hour (UTC) for the touch, from qual response pattern. */
function preferredHourUtc(
  hint: QualificationAgentResult["response_pattern_hint"] | undefined,
): number {
  switch (hint) {
    case "morning_preferred":
      return 14;
    case "evening_ok":
      return 20;
    case "async_heavy":
      return 16;
    default:
      return 15;
  }
}

/**
 * Spacing multiplier vs model day_offset: hotter leads → slightly tighter cadence;
 * cold or skeptical → more air.
 */
function cadenceMultiplier(args: {
  qualificationScore: number;
  interest: number | null;
}): number {
  const q = clamp(args.qualificationScore / 100, 0, 1);
  let m = 1 - q * 0.12;
  if (args.interest != null) {
    if (args.interest >= 7) m *= 0.88;
    else if (args.interest <= 3) m *= 1.14;
  }
  return clamp(m, 0.72, 1.28);
}

/**
 * When interest is cold and the model stacked email, nudge mid-sequence to LinkedIn for variety.
 */
function engineRecommendedChannel(
  channel: "email" | "linkedin" | "call",
  stepIndex: number,
  channels: ("email" | "linkedin" | "call")[],
  interest: number | null,
): "email" | "linkedin" | "call" {
  const emailHeavy = channels.filter((c) => c === "email").length >= 2;
  if (
    interest != null &&
    interest <= 4 &&
    emailHeavy &&
    channel === "email" &&
    stepIndex === 1
  ) {
    return "linkedin";
  }
  return channel;
}

function atUtcDayHour(base: Date, dayOffset: number, hourUtc: number): Date {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d;
}

/**
 * Prompt 91 — builds smart send times, confidence, optional channel nudge, and pending approval rows.
 */
export function buildSmartFollowUpEngineState(
  nurture: NurtureOutput,
  args: {
    qualificationScore: number;
    qualificationDetail?: QualificationAgentResult | null;
    replyIntel?: ReplyFollowUpIntel | null;
    anchorDate: Date;
  },
): SmartFollowUpEngineState {
  const interest = args.replyIntel?.interest_0_to_10 ?? null;
  const mult = cadenceMultiplier({
    qualificationScore: args.qualificationScore,
    interest,
  });
  const hourUtc = preferredHourUtc(args.qualificationDetail?.response_pattern_hint);
  const channels = nurture.follow_up_sequences.map((s) => s.channel);

  const steps: SmartFollowUpStepPlan[] = [];
  let prevSend: Date | null = null;

  for (let i = 0; i < nurture.follow_up_sequences.length; i++) {
    const s = nurture.follow_up_sequences[i]!;
    const orig = s.day_offset;
    const adjusted = clamp(Math.round(orig * mult), 0, 120);
    const suggested = atUtcDayHour(args.anchorDate, adjusted, hourUtc);
    const delayH =
      prevSend == null
        ? null
        : Math.max(0, Math.round((suggested.getTime() - prevSend.getTime()) / 3_600_000));
    prevSend = suggested;

    const engineCh = engineRecommendedChannel(s.channel, i, channels, interest);
    const conf = clamp(
      0.42 +
        (interest != null ? interest / 10 : 0.25) * 0.22 +
        (args.qualificationScore / 100) * 0.28,
      0.35,
      0.94,
    );

    const rationale = [
      s.timing_rationale.trim(),
      interest != null
        ? `Interest signal ${interest}/10 from prior reply intel — cadence ×${mult.toFixed(2)}.`
        : `No prior reply score — cadence ×${mult.toFixed(2)} from qualification (${args.qualificationScore}).`,
      args.qualificationDetail?.response_pattern_hint
        ? `Send-time bias: ${args.qualificationDetail.response_pattern_hint.replace(/_/g, " ")} (UTC hour ${hourUtc}).`
        : "Default mid-day UTC send window.",
      engineCh !== s.channel
        ? `Engine suggests **${engineCh}** instead of model **${s.channel}** to reduce same-channel fatigue while interest is soft.`
        : "",
    ]
      .filter(Boolean)
      .join(" ");

    steps.push({
      step_index: i,
      model_channel: s.channel,
      engine_recommended_channel: engineCh,
      original_day_offset: orig,
      adjusted_day_offset: adjusted,
      suggested_send_at: suggested.toISOString(),
      delay_hours_from_previous: delayH,
      timing_rationale: rationale.slice(0, 1200),
      timing_confidence: Math.round(conf * 100) / 100,
      summary: s.summary,
      value_add_idea: s.value_add_idea,
      content_asset_suggestion: s.content_asset_suggestion,
      approval_status: "pending_review",
    });
  }

  const overall = [
    nurture.sequence_summary.slice(0, 400),
    interest != null
      ? `Prior-reply interest ${interest}/10 shapes spacing; approve each touch before sending.`
      : "Spacing derives from qualification + buyer rhythm hints; approve each touch before sending.",
  ].join(" ");

  return {
    engine_version: "p91-v1",
    generated_at: args.anchorDate.toISOString(),
    interest_signal_0_to_10: interest,
    qualification_score: args.qualificationScore,
    reply_signals_summary:
      args.replyIntel?.summary?.trim() ||
      (interest != null
        ? `Latest stored reply analysis (interest ${interest}/10).`
        : "No matching reply analysis for this lead email — timing uses qualification only."),
    overall_rationale: overall.slice(0, 2000),
    steps,
  };
}

/** Derive aggregate DB status from step approvals. */
export function deriveFollowUpApprovalStatus(
  steps: SmartFollowUpStepPlan[],
): "pending_review" | "partially_approved" | "approved" | "rejected" {
  const approved = steps.filter((s) => s.approval_status === "approved").length;
  const skipped = steps.filter((s) => s.approval_status === "skipped").length;
  const pending = steps.filter((s) => s.approval_status === "pending_review").length;
  if (pending === steps.length) return "pending_review";
  if (approved === steps.length) return "approved";
  if (skipped === steps.length) return "rejected";
  if (approved > 0 || skipped > 0) return "partially_approved";
  return "pending_review";
}

/** Next recommended send among approved steps (or first pending if none approved). */
export function nextFollowUpSendIso(steps: SmartFollowUpStepPlan[]): string | null {
  const approved = steps.filter((s) => s.approval_status === "approved");
  const pool = approved.length > 0 ? approved : steps;
  const sorted = [...pool].sort(
    (a, b) =>
      new Date(a.suggested_send_at).getTime() - new Date(b.suggested_send_at).getTime(),
  );
  return sorted[0]?.suggested_send_at ?? null;
}
