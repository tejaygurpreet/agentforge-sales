import "server-only";

import type { CampaignClientSnapshot } from "@/agents/types";
import {
  aggregateObjectionsForPersistence,
  computeDisplayQualificationScore,
} from "@/lib/agents/qualification_node";
import { computeForecastFromSnapshot } from "@/lib/forecast";
import { scoreLeadForPriority } from "@/lib/scoring";

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export type DealConfidenceLevel = "low" | "medium" | "high";

export type QualificationFactorEntry = {
  key: string;
  label: string;
  /** Rough headwind / tailwind in arbitrary units (display-only). */
  impact: number;
  detail: string;
};

export type DealQualificationEngineResult = {
  /** 0–100 estimated likelihood to win this opportunity. */
  close_probability: number;
  confidence: DealConfidenceLevel;
  factors: QualificationFactorEntry[];
  suggested_actions: string[];
};

export type DealQualificationEngineOpts = {
  replyInterest0to10?: number | null;
  /** More historical completions → slightly higher confidence calibration. */
  workspaceHistoricalCompletedCount?: number;
};

function impactFromDimension(value: number, label: string, good: string, bad: string): QualificationFactorEntry {
  const centered = Math.round((value - 50) / 5);
  return {
    key: label.toLowerCase().replace(/\s+/g, "_"),
    label,
    impact: clamp(centered, -12, 12),
    detail: value >= 55 ? good : bad,
  };
}

function buildSuggestedActions(
  factors: QualificationFactorEntry[],
  objectionPenalty: number,
  confidence: DealConfidenceLevel,
): string[] {
  const actions: string[] = [];
  const lowIcp = factors.find((f) => f.key === "icp_fit" && f.impact < -2);
  if (lowIcp) {
    actions.push(
      "Schedule a focused discovery touch: confirm team size, budget band, and success criteria so ICP fit is unambiguous.",
    );
  }
  if (objectionPenalty >= 8) {
    actions.push(
      "Send a concise objection-handling note paired with one proof point (customer snippet, metric, or security FAQ).",
    );
  }
  const reply = factors.find((f) => f.key === "reply_engagement");
  if (reply && reply.impact < -2) {
    actions.push(
      "Increase reply probability: vary channel (email → LinkedIn or call) with a new angle tied to a specific pain from research.",
    );
  }
  const deal = factors.find((f) => f.key === "deal_forecast");
  if (deal && deal.impact < -2) {
    actions.push(
      "Clarify economic buyer and timeline — align forecast assumptions with a lightweight mutual evaluation plan.",
    );
  }
  if (confidence === "low") {
    actions.push(
      "Improve signal quality: log reply sentiment in the reply analyzer and enrich the lead to raise confidence on the next run.",
    );
  }
  if (actions.length === 0) {
    actions.push(
      "Maintain momentum: propose a concrete next step with time-boxed follow-up and optional calendar holds.",
    );
  }
  return actions.slice(0, 5);
}

/**
 * Prompt 93 — deterministic deal close model blending ICP, lead priority dimensions,
 * pipeline qualification, forecast win %, reply interest, and objection load.
 * Does not replace graph routing or Smart Lead Scoring — display + persistence only.
 */
export function computeDealQualificationClose(
  snapshot: CampaignClientSnapshot,
  opts?: DealQualificationEngineOpts,
): DealQualificationEngineResult {
  const replyInterest = opts?.replyInterest0to10 ?? null;
  const hist = opts?.workspaceHistoricalCompletedCount ?? 0;

  if (snapshot.final_status === "failed") {
    return {
      close_probability: 0,
      confidence: "low",
      factors: [
        {
          key: "pipeline",
          label: "Pipeline status",
          impact: -40,
          detail: "Run failed before full qualification — close probability not meaningful.",
        },
      ],
      suggested_actions: [
        "Fix pipeline errors and re-run; verify API keys and lead inputs before forecasting close.",
      ],
    };
  }

  const lead = scoreLeadForPriority(snapshot, {
    replyInterest0to10: replyInterest,
  });
  const fc = computeForecastFromSnapshot(snapshot, { replyInterest0to10: replyInterest });
  const qualDisp = computeDisplayQualificationScore(snapshot, replyInterest);
  const objections = aggregateObjectionsForPersistence(snapshot);
  const patternCount = objections.reduce((acc, o) => acc + (Array.isArray(o.patterns) ? o.patterns.length : 0), 0);
  const objectionPenalty = Math.min(26, objections.length * 5 + patternCount * 2);

  const qualScore =
    qualDisp.refined ??
    qualDisp.base ??
    (typeof snapshot.qualification_score === "number" ? snapshot.qualification_score : null) ??
    snapshot.qualification_detail?.score ??
    52;
  const qualNorm = clamp(qualScore, 0, 100);

  const bantLen = snapshot.qualification_detail?.bant_summary?.length ?? 0;
  const bantBoost = bantLen > 160 ? 5 : bantLen > 80 ? 3 : bantLen > 30 ? 1 : 0;
  const meetingBoost =
    (snapshot.qualification_detail?.meeting_time_suggestions?.length ?? 0) > 0 ? 4 : 0;

  let blended =
    0.17 * lead.dimensions.icp_fit +
    0.13 * lead.dimensions.intent_signals +
    0.17 * lead.dimensions.reply_probability +
    0.13 * lead.dimensions.deal_value_potential +
    0.14 * qualNorm +
    0.13 * fc.winProbability +
    0.13 * lead.composite;

  blended = blended - objectionPenalty + bantBoost + meetingBoost;

  if (typeof replyInterest === "number" && Number.isFinite(replyInterest)) {
    if (replyInterest <= 3) blended -= 10;
    else if (replyInterest >= 8) blended += 9;
    else if (replyInterest >= 6) blended += 4;
  }

  const close_probability = clamp(Math.round(blended), 0, 100);

  const factors: QualificationFactorEntry[] = [];
  factors.push(
    impactFromDimension(
      lead.dimensions.icp_fit,
      "ICP fit",
      "Strong alignment with research ICP signals.",
      "ICP fit is thin — tighten persona and pain hypotheses.",
    ),
  );
  const replyDim = impactFromDimension(
    lead.dimensions.reply_probability,
    "Reply engagement",
    "Healthy engagement / reply likelihood.",
    "Low projected engagement — adjust cadence and proof-led value.",
  );
  replyDim.key = "reply_engagement";
  factors.push(replyDim);
  const dealDim = impactFromDimension(
    lead.dimensions.deal_value_potential,
    "Deal forecast",
    "Forecast and upside line up with strong win probability.",
    "Deal value / forecast signals are soft — validate budget and urgency.",
  );
  dealDim.key = "deal_forecast";
  factors.push(dealDim);
  factors.push({
    key: "qualification",
    label: "Qualification depth",
    impact: clamp(Math.round((qualNorm - 58) / 4), -10, 10),
    detail:
      qualNorm >= 62
        ? "Qualification narrative and BANT coverage look solid."
        : "Qualification is early — deepen discovery before pushing close.",
  });
  factors.push({
    key: "objections",
    label: "Objection load",
    impact: clamp(-Math.round(objectionPenalty / 3), -12, 0),
    detail:
      objectionPenalty <= 4
        ? "Fewer surfaced objections — path is clearer."
        : "Multiple objections logged — address systematically before advancing.",
  });

  let confScore = 1;
  if (snapshot.qualification_detail) confScore += 2;
  if (replyInterest != null) confScore += 2;
  if (snapshot.lead_enrichment_preview) confScore += 1;
  if (hist >= 12) confScore += 1;
  if (hist >= 45) confScore += 1;
  if (snapshot.outreach_output?.email_sent) confScore += 1;

  const confidence: DealConfidenceLevel =
    confScore >= 7 ? "high" : confScore >= 4 ? "medium" : "low";

  const suggested_actions = buildSuggestedActions(factors, objectionPenalty, confidence);

  return {
    close_probability,
    confidence,
    factors: factors.slice(0, 6),
    suggested_actions,
  };
}

/** JSON payload for `campaigns.qualification_factors` (jsonb). */
export function serializeQualificationFactorsForDb(
  result: DealQualificationEngineResult,
): Record<string, unknown> {
  return {
    engine_version: "p93-v1",
    confidence: result.confidence,
    factors: result.factors,
    suggested_actions: result.suggested_actions,
  };
}
