import "server-only";

import type { CampaignClientSnapshot } from "@/agents/types";
import type { LeadPriorityTier } from "@/types";
import { computeCampaignStrength } from "@/lib/campaign-strength";
import { computeForecastFromSnapshot } from "@/lib/forecast";

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export type LeadScoreDimensions = {
  /** 0–100 — ICP / research fit. */
  icp_fit: number;
  /** 0–100 — enrichment + live signals + motion hints. */
  intent_signals: number;
  /** 0–100 — likelihood of engagement / reply. */
  reply_probability: number;
  /** 0–100 — normalized deal upside (forecast heuristic). */
  deal_value_potential: number;
};

export type LeadPriorityScoreResult = {
  dimensions: LeadScoreDimensions;
  /** 0–100 weighted composite. */
  composite: number;
  tier: LeadPriorityTier;
  /** Short human-readable rationale (template + signals, not a live LLM call). */
  priority_reason: string;
};

const TIER_LABEL: Record<LeadPriorityTier, string> = {
  critical: "P1 · Critical",
  high: "P2 · High",
  medium: "P3 · Medium",
  low: "P4 · Low",
};

export function priorityTierLabel(tier: LeadPriorityTier): string {
  return TIER_LABEL[tier];
}

export function tierFromComposite(composite: number): LeadPriorityTier {
  if (composite >= 78) return "critical";
  if (composite >= 62) return "high";
  if (composite >= 44) return "medium";
  return "low";
}

function icpFitScore(snapshot: CampaignClientSnapshot, strengthComposite: number): number {
  const icp = snapshot.research_output?.icp_fit_score;
  if (typeof icp === "number" && Number.isFinite(icp)) {
    return clamp(icp, 0, 100);
  }
  return clamp(Math.round(strengthComposite * 0.92), 0, 100);
}

function intentSignalsScore(snapshot: CampaignClientSnapshot): number {
  let s = 42;
  const enrich = snapshot.lead_enrichment_preview;
  if (enrich && typeof enrich === "object") {
    const snap = enrich as unknown as Record<string, unknown>;
    for (const key of ["intent_signals", "company_snapshot", "hiring_signals", "funding_news"]) {
      const v = snap[key];
      if (typeof v === "string" && v.trim().length > 35) s += 6;
    }
  }
  const signals = snapshot.live_signals;
  if (Array.isArray(signals)) {
    s += clamp(signals.length * 4, 0, 18);
  }
  const news = snapshot.research_output?.recent_news_or_funding_summary;
  if (typeof news === "string") {
    const low = news.toLowerCase();
    if (/\b(raised|funding|series|seed|round)\b/.test(low)) s += 8;
    if (/\b(hiring|headcount|open roles|careers)\b/.test(low)) s += 6;
  }
  return clamp(Math.round(s), 0, 100);
}

function replyProbabilityScore(
  snapshot: CampaignClientSnapshot,
  strength: { composite: number; qual: number | null },
  replyInterest0to10: number | null | undefined,
): number {
  const qualN = strength.qual ?? strength.composite;
  const outreachOk = Boolean(
    snapshot.outreach_output && !nodeHasError(snapshot, "outreach_node"),
  );
  const base = strength.composite * 0.38 + qualN * 0.32 + (outreachOk ? 14 : 4);
  let replyBoost = 0;
  if (typeof replyInterest0to10 === "number" && Number.isFinite(replyInterest0to10)) {
    replyBoost = replyInterest0to10 * 7;
  } else {
    replyBoost = strength.composite * 0.22;
  }
  return clamp(Math.round(base + replyBoost), 0, 100);
}

function nodeHasError(snapshot: CampaignClientSnapshot, key: string): boolean {
  const n = snapshot.results?.[key];
  return (
    typeof n === "object" &&
    n !== null &&
    "error" in n &&
    typeof (n as { error: string }).error === "string"
  );
}

function dealValueScore(snapshot: CampaignClientSnapshot, replyInterest0to10: number | null | undefined): number {
  const fc = computeForecastFromSnapshot(snapshot, { replyInterest0to10: replyInterest0to10 ?? null });
  const win = clamp(fc.winProbability, 0, 100);
  const rev = Math.max(0, fc.predictedRevenueUsd);
  const revNorm =
    rev <= 0 ? 0 : clamp((Math.log10(rev + 1) / 6.2) * 100, 0, 100);
  const blended = win * 0.55 + revNorm * 0.45;
  if (typeof replyInterest0to10 === "number" && replyInterest0to10 >= 7) {
    return clamp(Math.round(blended + 6), 0, 100);
  }
  return clamp(Math.round(blended), 0, 100);
}

function buildPriorityReason(
  dims: LeadScoreDimensions,
  tier: LeadPriorityTier,
  leadName: string,
): string {
  const pairs: [string, number][] = [
    ["ICP fit", dims.icp_fit],
    ["Intent signals", dims.intent_signals],
    ["Reply probability", dims.reply_probability],
    ["Deal upside", dims.deal_value_potential],
  ];
  pairs.sort((a, b) => b[1] - a[1]);
  const [a, b] = pairs;
  const tierHint =
    tier === "critical"
      ? "Prioritize this week"
      : tier === "high"
        ? "Strong next in queue"
        : tier === "medium"
          ? "Schedule after hotter leads"
          : "Nurture or deprioritize unless strategic";

  return (
    `${tierHint}: **${leadName}** — strongest signals on **${a[0]}** (${Math.round(a[1])}) and **${b[0]}** (${Math.round(b[1])}). ` +
    `Composite blends ICP, intent, reply likelihood, and forecasted deal shape — use as a queue hint, not a guarantee.`
  );
}

/**
 * Multi-axis lead score for dashboard prioritization (deterministic; uses existing snapshot + optional reply interest).
 */
export function scoreLeadForPriority(
  snapshot: CampaignClientSnapshot,
  opts?: {
    replyInterest0to10?: number | null;
    /** Override display name in reason string. */
    leadDisplayName?: string;
  },
): LeadPriorityScoreResult {
  const strength = computeCampaignStrength(snapshot);
  const replyI = opts?.replyInterest0to10 ?? null;
  const icp_fit = icpFitScore(snapshot, strength.composite);
  const intent_signals = intentSignalsScore(snapshot);
  const reply_probability = replyProbabilityScore(snapshot, strength, replyI);
  const deal_value_potential = dealValueScore(snapshot, replyI);

  const composite = clamp(
    Math.round(
      icp_fit * 0.28 +
        intent_signals * 0.22 +
        reply_probability * 0.28 +
        deal_value_potential * 0.22,
    ),
    0,
    100,
  );

  const tier = tierFromComposite(composite);
  const name =
    opts?.leadDisplayName?.trim() ||
    snapshot.lead?.name?.trim() ||
    "This lead";

  return {
    dimensions: { icp_fit, intent_signals, reply_probability, deal_value_potential },
    composite,
    tier,
    priority_reason: buildPriorityReason(
      { icp_fit, intent_signals, reply_probability, deal_value_potential },
      tier,
      name,
    ),
  };
}

export function resolveReplyInterestForLead(
  threadId: string,
  email: string,
  byThread: Map<string, number>,
  byEmail: Map<string, number>,
): number | null {
  const t = threadId.trim();
  if (t) {
    const fromThread = byThread.get(t);
    if (fromThread != null) return fromThread;
  }
  const em = email.trim().toLowerCase();
  if (em) {
    const fromEmail = byEmail.get(em);
    if (fromEmail != null) return fromEmail;
  }
  return null;
}

/** Build summary line for top of dashboard (template, not LLM). */
export function buildLeadPriorityQueueSummary(
  top: { lead_name: string; composite_score: number; tier: LeadPriorityTier }[],
): string | null {
  if (!top.length) return null;
  const names = top.map((t) => t.lead_name).filter(Boolean);
  if (!names.length) return null;
  const head = names.slice(0, 3).join(" → ");
  return `Suggested contact order: **${head}** — highest composite priority scores in your workspace right now.`;
}
