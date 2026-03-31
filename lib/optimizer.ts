import type {
  CampaignClientSnapshot,
  CampaignOptimizerSnapshot,
  CampaignOptimizerStatus,
  CampaignPerformanceMetrics,
  NurtureOutput,
  QualificationAgentResult,
  ReplyFollowUpIntel,
} from "@/agents/types";
import type { DashboardOptimizerRow } from "@/types";

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parsePersistedCampaignSnapshot(results: unknown): CampaignClientSnapshot | null {
  if (!isRecord(results)) return null;
  if (typeof results.thread_id !== "string") return null;
  if (!isRecord(results.lead)) return null;
  if (typeof results.final_status !== "string") return null;
  return results as unknown as CampaignClientSnapshot;
}

export type BuildCampaignOptimizerInput = {
  qualificationScore: number;
  qualificationDetail?: QualificationAgentResult | null;
  nurtureOutput?: NurtureOutput | null;
  replyIntel?: ReplyFollowUpIntel | null;
  replyInterest0to10?: number | null;
  abVariant?: "A" | "B" | null;
  hadPriorErrors: boolean;
  nurtureDegraded?: boolean;
};

/**
 * Prompt 94 — deterministic optimizer: blends qual, reply interest, meeting hooks, A/B arm, errors.
 * Does not mutate pipeline outputs; safe to call on every run.
 */
export function buildCampaignOptimizerSnapshot(
  input: BuildCampaignOptimizerInput,
): CampaignOptimizerSnapshot {
  const interest =
    input.replyIntel?.interest_0_to_10 ?? input.replyInterest0to10 ?? null;
  const qualify = clamp(input.qualificationScore, 0, 100);

  const meetingSlots =
    (input.qualificationDetail?.meeting_time_suggestions?.length ?? 0) +
    (input.nurtureOutput?.meeting_time_suggestions?.length ?? 0);
  const meetingSignal = clamp(meetingSlots / 5, 0, 1);

  let replyRateProxy: number | null = null;
  if (interest != null) {
    replyRateProxy = clamp(0.05 + (interest / 10) * 0.12, 0, 0.95);
  }

  const interestBoost =
    interest != null ? interest * 4 : 22;

  const composite = clamp(
    qualify * 0.38 +
      interestBoost * 0.01 +
      meetingSignal * 100 * 0.12 +
      (input.hadPriorErrors || input.nurtureDegraded ? -18 : 0) +
      (input.replyIntel?.summary?.trim() ? 4 : 0),
    0,
    100,
  );

  let status: CampaignOptimizerStatus = "monitoring";
  if (qualify < 32 || (interest != null && interest <= 2) || input.hadPriorErrors) {
    status = "auto_pause_suggested";
  } else if (
    input.abVariant &&
    interest != null &&
    interest <= 4 &&
    qualify < 55
  ) {
    status = "variant_switch_suggested";
  } else if (composite >= 68) {
    status = "healthy";
  } else if (composite >= 42) {
    status = "at_risk";
  }

  const recommendations: string[] = [];
  if (status === "auto_pause_suggested") {
    recommendations.push(
      "Pause or tighten this sequence — qualification or reply signals are very weak.",
    );
    recommendations.push(
      "Refresh subject lines and re-check ICP fit before the next outreach batch.",
    );
  }
  if (status === "variant_switch_suggested" && input.abVariant) {
    const alt = input.abVariant === "A" ? "B" : "A";
    recommendations.push(
      `A/B: try variant ${alt} — current arm (${input.abVariant}) is underperforming vs model signals.`,
    );
  }
  if (meetingSlots === 0 && qualify >= 55) {
    recommendations.push(
      "Add concrete meeting windows in qualification — conversion improves when slots are explicit.",
    );
  }
  if (interest != null && interest >= 7 && meetingSlots === 0) {
    recommendations.push(
      "High interest but no meeting hooks — add a calendar CTA in the next nurture touch.",
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      "Performance is within range — keep monitoring and continue subject-line experiments.",
    );
  }

  const autoPause =
    status === "auto_pause_suggested" ||
    (interest != null && interest <= 2 && qualify < 40);

  const suggestedAb: "A" | "B" | null =
    status === "variant_switch_suggested" && input.abVariant
      ? input.abVariant === "A"
        ? "B"
        : "A"
      : null;

  const metrics: CampaignPerformanceMetrics = {
    reply_rate_proxy: replyRateProxy,
    interest_score_0_to_10: interest,
    meeting_booking_signal: meetingSignal,
    qualification_score: qualify,
    composite_health: Math.round(composite),
  };

  return {
    optimizer_version: "p94-v1",
    evaluated_at: new Date().toISOString(),
    status,
    metrics,
    recommendations: recommendations.slice(0, 8),
    auto_pause_follow_ups: autoPause,
    suggested_ab_variant: suggestedAb,
    sequence_notes: [
      input.nurtureDegraded
        ? "Nurture stage used fallback copy — review before scaling."
        : "",
      input.hadPriorErrors
        ? "Upstream stages reported errors — review research/outreach before more touches."
        : "",
    ].filter(Boolean),
  };
}

export type HydrateOptimizerOptions = {
  /** When true (e.g. workspace analytics feed), ignore stored snapshot so reply maps stay fresh. */
  forceRecompute?: boolean;
};

/** Prefer stored snapshot when present; otherwise rebuild from saved campaign JSON + reply maps. */
export function hydrateCampaignOptimizerFromSnapshot(
  snap: CampaignClientSnapshot,
  opts: {
    replyInterest0to10: number | null;
    abVariant: "A" | "B" | null;
  },
  hydrateOpts?: HydrateOptimizerOptions,
): CampaignOptimizerSnapshot {
  if (
    !hydrateOpts?.forceRecompute &&
    snap.campaign_optimizer?.optimizer_version === "p94-v1"
  ) {
    return snap.campaign_optimizer;
  }
  const nurtureDegraded = !!(
    snap.results &&
    isRecord(snap.results) &&
    isRecord(snap.results.nurture_node) &&
    Boolean(snap.results.nurture_node.degraded)
  );
  const intel: ReplyFollowUpIntel | null =
    opts.replyInterest0to10 != null
      ? {
          interest_0_to_10: opts.replyInterest0to10,
          summary: "Derived from stored reply analysis for optimizer.",
        }
      : null;
  return buildCampaignOptimizerSnapshot({
    qualificationScore:
      snap.qualification_score ?? snap.qualification_detail?.score ?? 50,
    qualificationDetail: snap.qualification_detail,
    nurtureOutput: snap.nurture_output ?? undefined,
    replyIntel: intel,
    replyInterest0to10: opts.replyInterest0to10,
    abVariant: opts.abVariant,
    hadPriorErrors:
      snap.final_status === "completed_with_errors" ||
      Boolean(snap.pipeline_error?.trim()),
    nurtureDegraded,
  });
}

/** Workspace analytics — lowest health first so at-risk deals surface. */
export function buildDashboardOptimizerFeedFromRows(
  rows: Record<string, unknown>[],
  interestByThread: Map<string, number | null>,
  interestByEmail: Map<string, number | null>,
): DashboardOptimizerRow[] {
  const out: DashboardOptimizerRow[] = [];
  for (const row of rows) {
    const results = row.results;
    const snap = parsePersistedCampaignSnapshot(results);
    if (!snap || snap.final_status === "failed") continue;
    const tid = String(row.thread_id ?? snap.thread_id ?? "");
    if (!tid) continue;
    const email = String(row.email ?? snap.lead?.email ?? "");
    const leadName = String(row.lead_name ?? snap.lead?.name ?? "Lead");
    const company = String(row.company ?? snap.lead?.company ?? "");
    const replyI =
      interestByThread.get(tid) ??
      (email ? interestByEmail.get(email.toLowerCase()) : null) ??
      null;
    const abVarRaw = row.ab_variant;
    const abVar =
      abVarRaw === "A" || abVarRaw === "B"
        ? abVarRaw
        : snap.ab_variant ?? null;
    const opt = hydrateCampaignOptimizerFromSnapshot(
      snap,
      {
        replyInterest0to10: replyI,
        abVariant: abVar,
      },
      { forceRecompute: true },
    );
    out.push({
      thread_id: tid,
      lead_name: leadName,
      company,
      optimization_status: opt.status,
      composite_health: opt.metrics.composite_health,
      auto_pause_suggested: opt.auto_pause_follow_ups,
      top_recommendations: opt.recommendations.slice(0, 3),
      suggested_variant: opt.suggested_ab_variant,
      evaluated_at: opt.evaluated_at,
    });
  }
  out.sort((a, b) => {
    const ac = a.composite_health ?? 0;
    const bc = b.composite_health ?? 0;
    return ac - bc;
  });
  return out.slice(0, 24);
}
