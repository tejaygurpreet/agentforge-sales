import "server-only";

import type { CalendarConnectionStatusDTO, DeliverabilitySuitePayload } from "@/types";
import type {
  DashboardAnalyticsSummary,
  ExecutiveMetricsDTO,
  SdrManagerHealthCheckItem,
  SystemHealthStatusDTO,
} from "@/types";
import { z } from "zod";
import { invokeWithGroqRateLimitResilience } from "@/lib/agent-model";

const EXEC_REPORT_TEMP = 0.28;

const execReportSchema = z
  .object({
    executive_summary: z.string().optional(),
    strategic_priorities: z.array(z.string()).optional(),
    risks: z.array(z.string()).optional(),
    ai_recommendations: z.array(z.string()).optional(),
  })
  .passthrough();

/**
 * Prompt 102 — deterministic KPIs from dashboard + deliverability (no LLM).
 */
export function computeExecutiveMetrics(args: {
  analytics: DashboardAnalyticsSummary;
  teamMemberCount: number;
}): ExecutiveMetricsDTO {
  const a = args.analytics;
  const vol = Math.max(0, a.campaignCount);
  const replyCov =
    vol > 0 ? Math.min(100, Math.round((a.replyAnalyzedCount / vol) * 100)) : 0;
  const prod = Math.round(
    Math.min(
      100,
      (a.avgCompositeScore ?? 55) * 0.35 +
        replyCov * 0.25 +
        Math.min(100, vol * 3) * 0.15 +
        (a.forecastAvgWinProbability ?? 50) * 0.25,
    ),
  );
  return {
    weightedPipelineUsd: a.forecastWeightedPipelineUsd,
    totalPipelineUsd: a.forecastTotalPipelineUsd,
    estimatedRoiMultiple: a.estimatedRoiMultiplier,
    productivityIndex: prod,
    campaignVolume: vol,
    replyCoveragePct: replyCov,
    teamMembers: Math.max(1, args.teamMemberCount),
    avgComposite: a.avgCompositeScore,
    forecastWinRate: a.forecastAvgWinProbability,
  };
}

/**
 * Prompt 102 — integration + deliverability health (heuristic scoring).
 */
export function buildSystemHealthStatus(args: {
  analytics: DashboardAnalyticsSummary;
  deliverabilitySuite: DeliverabilitySuitePayload | null;
  calendarStatus: CalendarConnectionStatusDTO;
  hubspotConnected: boolean;
  envWarningCount: number;
}): SystemHealthStatusDTO {
  const checks: SdrManagerHealthCheckItem[] = [];
  const a = args.analytics;

  const inbox = a.avgInboxHealthScore;
  if (inbox == null || a.deliverabilitySampleCount === 0) {
    checks.push({
      id: "deliverability",
      label: "Campaign inbox scores",
      status: "warn",
      detail: "Few or no recorded send health scores — send a few campaigns to populate.",
    });
  } else if (inbox >= 72) {
    checks.push({
      id: "deliverability",
      label: "Campaign inbox scores",
      status: "ok",
      detail: `Avg inbox health ~${inbox}/100 across ${a.deliverabilitySampleCount} sends.`,
    });
  } else {
    checks.push({
      id: "deliverability",
      label: "Campaign inbox scores",
      status: "warn",
      detail: `Avg inbox health ${inbox}/100 — tighten copy and warm-up discipline.`,
    });
  }

  const warm = args.deliverabilitySuite;
  if (!warm) {
    checks.push({
      id: "warmup",
      label: "Warm-up tracking",
      status: "warn",
      detail: "Deliverability data not loaded — open Deliverability tab after sign-in.",
    });
  } else if (!warm.warmupEnabled) {
    checks.push({
      id: "warmup",
      label: "Warm-up tracking",
      status: "warn",
      detail: "Warm-up mode is off — enable to log daily discipline alongside your ESP.",
    });
  } else if ((warm.coach?.healthScore ?? 0) >= 65) {
    checks.push({
      id: "warmup",
      label: "Warm-up & coach",
      status: "ok",
      detail: `Coach health ${warm.coach.healthScore}/100 · ${warm.emailsSentLast7Days} touches (7d).`,
    });
  } else {
    checks.push({
      id: "warmup",
      label: "Warm-up & coach",
      status: "warn",
      detail: `Coach health ${warm.coach?.healthScore ?? "—"}/100 — increase consistent volume.`,
    });
  }

  const cal = args.calendarStatus.google || args.calendarStatus.microsoft;
  checks.push({
    id: "calendar",
    label: "Calendar integrations",
    status: cal ? "ok" : "warn",
    detail: cal
      ? "Google or Microsoft calendar connected for meetings/demos."
      : "No calendar OAuth — connect for one-click meetings.",
  });

  checks.push({
    id: "hubspot",
    label: "HubSpot",
    status: args.hubspotConnected ? "ok" : "warn",
    detail: args.hubspotConnected
      ? "HubSpot token stored — sync available."
      : "HubSpot not connected — optional CRM sync disabled.",
  });

  checks.push({
    id: "config",
    label: "Environment",
    status: args.envWarningCount === 0 ? "ok" : "warn",
    detail:
      args.envWarningCount === 0
        ? "No blocking config warnings on dashboard."
        : `${args.envWarningCount} configuration hint(s) — review the banner on the home page.`,
  });

  let score = 100;
  for (const c of checks) {
    if (c.status === "warn") score -= 12;
    if (c.status === "critical") score -= 22;
  }
  score = Math.max(0, Math.min(100, score));

  const warnN = checks.filter((c) => c.status === "warn").length;
  const critN = checks.filter((c) => c.status === "critical").length;
  let overall: SystemHealthStatusDTO["overall"] = "healthy";
  if (critN > 0) overall = "attention";
  else if (warnN >= 3) overall = "degraded";
  else if (warnN > 0) overall = "degraded";

  return {
    overall,
    score,
    checks,
    updatedAt: new Date().toISOString(),
  };
}

export type ExecutiveReportAi = {
  executive_summary: string;
  strategic_priorities: string[];
  risks: string[];
  ai_recommendations: string[];
};

/**
 * Prompt 102 — Groq structured executive narrative from live metrics JSON.
 */
export async function generateExecutiveReportWithAi(args: {
  metrics: ExecutiveMetricsDTO;
  health: SystemHealthStatusDTO;
  analyticsSnippet: Record<string, unknown>;
}): Promise<ExecutiveReportAi> {
  const system = `You are a concise revenue operations advisor. Output ONE JSON object only. No markdown fences.
Tone: executive, factual, no guaranteed ROI; reference metrics themes only.`;

  const human = `Inputs:
${JSON.stringify(
  {
    metrics: args.metrics,
    health_score: args.health.score,
    health_overall: args.health.overall,
    analytics: args.analyticsSnippet,
  },
  null,
  2,
).slice(0, 12000)}

Return JSON keys:
- executive_summary (2-4 short paragraphs as one string with \\n\\n between paragraphs)
- strategic_priorities (4-6 bullets)
- risks (3-5 bullets)
- ai_recommendations (5-8 actionable bullets for the SDR org)`;

  try {
    const { value: raw } = await invokeWithGroqRateLimitResilience(
      "sdr_manager_exec_report",
      EXEC_REPORT_TEMP,
      (m) =>
        m.withStructuredOutput(execReportSchema, { name: "sdr_manager_exec_report" }).invoke(
          `${system}\n\n---\n${human}`,
        ),
    );
    const lax = execReportSchema.safeParse(raw);
    if (!lax.success) {
      return fallbackReport(args.metrics, args.health);
    }
    const d = lax.data;
    return {
      executive_summary: (d.executive_summary ?? "").slice(0, 8000),
      strategic_priorities: (d.strategic_priorities ?? [])
        .map((s) => String(s).trim())
        .filter(Boolean)
        .slice(0, 8),
      risks: (d.risks ?? []).map((s) => String(s).trim()).filter(Boolean).slice(0, 8),
      ai_recommendations: (d.ai_recommendations ?? [])
        .map((s) => String(s).trim())
        .filter(Boolean)
        .slice(0, 10),
    };
  } catch {
    return fallbackReport(args.metrics, args.health);
  }
}

function fallbackReport(
  metrics: ExecutiveMetricsDTO,
  health: SystemHealthStatusDTO,
): ExecutiveReportAi {
  return {
    executive_summary: `Pipeline (weighted) is approximately $${metrics.weightedPipelineUsd.toLocaleString()} across ${metrics.campaignVolume} campaigns in the analytics window. System health score is ${health.score}/100 (${health.overall}).\n\nUse the checklist below to prioritize coaching, deliverability, and integration work.`,
    strategic_priorities: [
      "Align outbound volume with ICP fit and qualification depth.",
      "Stabilize deliverability and warm-up before scaling sends.",
      "Connect calendar and CRM where missing to reduce manual overhead.",
    ],
    risks: [
      "Sparse reply analysis may hide engagement gaps.",
      "Low warm-up discipline can cap domain reputation gains.",
    ],
    ai_recommendations: [
      "Review the Coaching tab for voice-level coaching.",
      "Open Deliverability after material copy changes.",
      "Re-run sequences with A/B data from the Sequences tab.",
    ],
  };
}

export function formatExecutiveReportMarkdown(report: ExecutiveReportAi): string {
  const lines = [
    "# Executive summary",
    "",
    report.executive_summary,
    "",
    "## Strategic priorities",
    ...report.strategic_priorities.map((x) => `- ${x}`),
    "",
    "## Risks",
    ...report.risks.map((x) => `- ${x}`),
    "",
    "## AI recommendations",
    ...report.ai_recommendations.map((x) => `- ${x}`),
  ];
  return lines.join("\n");
}
