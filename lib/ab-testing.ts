import "server-only";

import type { CampaignClientSnapshot } from "@/agents/types";
import { computeCampaignStrength } from "@/lib/campaign-strength";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Parse persisted `campaigns.results` JSON into a client snapshot shape. */
export function snapshotFromCampaignResults(results: unknown): CampaignClientSnapshot | null {
  if (!isRecord(results)) return null;
  if (typeof results.thread_id !== "string") return null;
  if (!isRecord(results.lead)) return null;
  if (typeof results.final_status !== "string") return null;
  return results as unknown as CampaignClientSnapshot;
}

/** Prompt 89 — proxy for “meeting motion” when calendar booking isn’t stored per thread. */
export function meetingSchedulingSignal(snapshot: CampaignClientSnapshot): number {
  const q = snapshot.qualification_detail?.meeting_time_suggestions?.length ?? 0;
  const n = snapshot.nurture_output?.meeting_time_suggestions?.length ?? 0;
  const hint = snapshot.nurture_output?.meeting_scheduling_hint?.trim() ? 1 : 0;
  return Math.min(10, q * 2.5 + n * 2.5 + hint * 2);
}

export type AbVariantSignalInput = {
  snapshot: CampaignClientSnapshot;
  /** Max reply interest 0–10 from `reply_analyses` when linked to thread. */
  replyInterest0to10?: number | null;
};

/**
 * Weighted auto-optimization score: composite strength, qualification, reply intel, meeting signals.
 * Same formula used for batch rollups and Analytics A/B cards.
 */
export function computeAutoOptimizationScore(input: AbVariantSignalInput): number {
  const c = computeCampaignStrength(input.snapshot).composite;
  const qualRaw =
    input.snapshot.qualification_score ?? input.snapshot.qualification_detail?.score ?? null;
  const qual = typeof qualRaw === "number" && Number.isFinite(qualRaw) ? qualRaw : c * 0.85;
  const reply = input.replyInterest0to10 ?? 0;
  const meet = meetingSchedulingSignal(input.snapshot);
  return c * 0.42 + qual * 0.22 + reply * 10 * 0.21 + meet * 0.15;
}

export function pickAbWinner(scoreA: number, scoreB: number): "A" | "B" | "tie" {
  if (Math.abs(scoreA - scoreB) < 1.25) return "tie";
  return scoreA >= scoreB ? "A" : "B";
}

export function autoOptimizationRecommendation(
  winner: "A" | "B" | "tie",
  scoreA: number,
  scoreB: number,
  labelA: string,
  labelB: string,
): string {
  const d = Math.abs(scoreA - scoreB);
  if (winner === "tie") {
    return `Scores within ${d.toFixed(1)} pts — treat as inconclusive; extend sample or test a sharper message/sequence difference.`;
  }
  const win = winner === "A" ? labelA : labelB;
  const lose = winner === "A" ? labelB : labelA;
  return `Favor **${win}** over ${lose} (auto-score Δ ≈ ${d.toFixed(1)}). Roll forward with the winning variant for similar leads; log replies to refine.`;
}

export type CampaignAbRow = {
  ab_variant: string;
  thread_id: string;
  results: unknown;
};

/**
 * Aggregate optimization scores for all A/B rows sharing one `ab_test_id` (multi-lead batch).
 */
export function aggregateBatchAbOptimization(
  rows: CampaignAbRow[],
  interestByThread: Map<string, number>,
): {
  meanA: number;
  meanB: number;
  countA: number;
  countB: number;
  winner: "A" | "B" | "tie";
  reason: string;
} {
  const scoresA: number[] = [];
  const scoresB: number[] = [];
  for (const r of rows) {
    const snap = snapshotFromCampaignResults(r.results);
    if (!snap) continue;
    const tid = r.thread_id;
    const interest = interestByThread.get(tid);
    const score = computeAutoOptimizationScore({ snapshot: snap, replyInterest0to10: interest });
    const v = String(r.ab_variant || "").toUpperCase();
    if (v === "A") scoresA.push(score);
    else if (v === "B") scoresB.push(score);
  }
  const mean = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  const meanA = mean(scoresA);
  const meanB = mean(scoresB);
  const winner = pickAbWinner(meanA, meanB);
  const reason =
    scoresA.length === 0 || scoresB.length === 0
      ? "Incomplete variant data — wait for both sides to finish."
      : `Batch mean optimization: A=${meanA.toFixed(1)} (${scoresA.length} runs) vs B=${meanB.toFixed(1)} (${scoresB.length} runs).`;
  return { meanA, meanB, countA: scoresA.length, countB: scoresB.length, winner, reason };
}
