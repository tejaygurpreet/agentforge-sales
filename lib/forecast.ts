import "server-only";

import type { CampaignClientSnapshot } from "@/agents/types";
import { computeCampaignStrength } from "@/lib/campaign-strength";

export type ForecastResult = {
  /** 0–100 — blended score from composite, qualification, ICP, BANT proxy, optional reply interest. */
  winProbability: number;
  /** USD — heuristic deal size from signal strength (not CRM ACV). */
  predictedRevenueUsd: number;
  /** 0–100 — qualification / BANT proxy (qualification score). */
  bantSignal: number;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Derives a BANT-style signal from qualification + objection count (Prompt 87).
 */
export function bantSignalFromSnapshot(snapshot: CampaignClientSnapshot): number {
  const q =
    typeof snapshot.qualification_score === "number"
      ? snapshot.qualification_score
      : null;
  const qNode = isRecord(snapshot.results?.qualification_node)
    ? snapshot.results!.qualification_node
    : null;
  const qDetail =
    typeof snapshot.qualification_detail?.score === "number"
      ? snapshot.qualification_detail.score
      : null;
  const base = q ?? qDetail ?? (typeof qNode?.score === "number" ? (qNode.score as number) : null);
  if (typeof base === "number" && Number.isFinite(base)) {
    let adj = clamp(base, 0, 100);
    const obs = normalizeObjections(snapshot);
    if (obs.length >= 4) adj -= 6;
    else if (obs.length <= 1) adj += 4;
    return clamp(adj, 0, 100);
  }
  const strength = computeCampaignStrength(snapshot);
  return clamp(strength.qual ?? strength.composite * 0.85, 0, 100);
}

function normalizeObjections(snapshot: CampaignClientSnapshot): string[] {
  const q =
    snapshot.qualification_detail?.top_objections ??
    (snapshot.results?.qualification_node as { top_objections?: unknown } | undefined)
      ?.top_objections;
  if (!Array.isArray(q)) return [];
  const out: string[] = [];
  for (const item of q) {
    if (typeof item === "string") out.push(item);
    else if (isRecord(item) && typeof item.objection === "string") out.push(item.objection);
  }
  return out;
}

/**
 * Heuristic “ML-like” win probability + revenue from saved campaign snapshot + optional reply interest.
 */
export function computeForecastFromSnapshot(
  snapshot: CampaignClientSnapshot,
  options?: { replyInterest0to10?: number | null },
): ForecastResult {
  const strength = computeCampaignStrength(snapshot);
  const bantN = bantSignalFromSnapshot(snapshot);
  const composite = strength.composite / 100;
  const qual = (strength.qual ?? strength.composite) / 100;
  const icp = (strength.icp ?? strength.composite) / 100;
  const bant = bantN / 100;

  const replyRaw = options?.replyInterest0to10;
  const reply =
    typeof replyRaw === "number" && Number.isFinite(replyRaw)
      ? clamp(replyRaw, 0, 10) / 10
      : 0.55;

  let p =
    0.34 * composite +
    0.2 * qual +
    0.18 * icp +
    0.16 * bant +
    0.12 * reply;

  if (snapshot.final_status === "failed") {
    p *= 0.25;
  } else if (snapshot.final_status === "completed_with_errors") {
    p *= 0.88;
  }

  const winProbability = Math.round(clamp(p * 100, 4, 94));

  const revBase = 22_000 + strength.composite * 380 + bantN * 120;
  const predictedRevenueUsd = Math.round(clamp(revBase, 8_500, 520_000));

  return {
    winProbability,
    predictedRevenueUsd,
    bantSignal: Math.round(bantN),
  };
}
