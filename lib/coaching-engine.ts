import "server-only";

import type { CampaignClientSnapshot } from "@/agents/types";
import type {
  AbTestComparisonRow,
  CoachingPreviewDTO,
  DashboardAnalyticsSummary,
  ForecastTrendPoint,
} from "@/types";
import { z } from "zod";
import { invokeWithGroqRateLimitResilience } from "@/lib/agent-model";
import { computeCampaignStrength } from "@/lib/campaign-strength";

const COACH_TEMPERATURE = 0.33;

export type VoiceCoachingStat = {
  voice: string;
  avgComposite: number;
  runs: number;
};

const coachingLlmSchema = z
  .object({
    personalized_tips: z.array(z.string()).optional(),
    focus_areas: z.array(z.string()).optional(),
    voice_tips: z
      .array(
        z.object({
          voice: z.string().optional(),
          tip: z.string().optional(),
        }),
      )
      .optional(),
    sequence_tips: z.array(z.string()).optional(),
    team_insight: z.string().optional(),
  })
  .passthrough();

function parseSnapshot(results: unknown): CampaignClientSnapshot | null {
  if (!results || typeof results !== "object" || Array.isArray(results)) return null;
  const o = results as Record<string, unknown>;
  if (typeof o.thread_id !== "string" || typeof o.final_status !== "string") return null;
  if (!o.lead || typeof o.lead !== "object") return null;
  return results as CampaignClientSnapshot;
}

/**
 * Prompt 101 — aggregate composite strength by SDR voice label from saved campaign rows.
 */
export function computeVoiceCoachingStats(
  rows: Array<{ results?: unknown }>,
): VoiceCoachingStat[] {
  const map = new Map<string, { sum: number; n: number }>();
  for (const row of rows) {
    const snap = parseSnapshot(row.results);
    if (!snap || snap.final_status === "failed") continue;
    const voiceRaw = snap.lead?.sdr_voice_tone ?? "default";
    const voice = typeof voiceRaw === "string" && voiceRaw.trim() ? voiceRaw.trim() : "default";
    const comp = computeCampaignStrength(snap).composite;
    const prev = map.get(voice) ?? { sum: 0, n: 0 };
    prev.sum += comp;
    prev.n += 1;
    map.set(voice, prev);
  }
  const out: VoiceCoachingStat[] = [];
  for (const [voice, { sum, n }] of map) {
    if (n === 0) continue;
    out.push({ voice, avgComposite: Math.round(sum / n), runs: n });
  }
  out.sort((a, b) => b.avgComposite - a.avgComposite);
  return out;
}

function forecastMomentum(trend: ForecastTrendPoint[]): CoachingPreviewDTO["momentum"] {
  if (trend.length < 2) return "unknown";
  const last = trend[trend.length - 1]?.weightedPipelineUsd ?? 0;
  const prev = trend[trend.length - 2]?.weightedPipelineUsd ?? 0;
  if (last > prev * 1.05) return "up";
  if (last < prev * 0.95) return "down";
  return "flat";
}

/**
 * Prompt 101 — deterministic strengths / gaps for dashboard (no LLM).
 */
export function buildDeterministicCoachingPreview(args: {
  voiceStats: VoiceCoachingStat[];
  abTestComparisons: AbTestComparisonRow[];
  forecastTrend: ForecastTrendPoint[];
  avgReplyInterest: number | null;
  avgCompositeScore: number | null;
  avgWarmupPlacementScore: number | null;
  replyAnalyzedCount: number;
  campaignCount: number;
}): CoachingPreviewDTO {
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  const topVoice = args.voiceStats[0];
  const lowVoice = args.voiceStats[args.voiceStats.length - 1];
  if (topVoice && topVoice.runs >= 2) {
    strengths.push(
      `Strongest recent voice: **${topVoice.voice}** (avg composite ${topVoice.avgComposite}, n=${topVoice.runs}).`,
    );
  }
  if (
    lowVoice &&
    topVoice &&
    lowVoice.voice !== topVoice.voice &&
    lowVoice.runs >= 2 &&
    topVoice.avgComposite - lowVoice.avgComposite >= 12
  ) {
    weaknesses.push(
      `Gap between **${topVoice.voice}** and **${lowVoice.voice}** — test messaging or tone on the lower lane.`,
    );
  }

  if (typeof args.avgReplyInterest === "number" && args.replyAnalyzedCount > 0) {
    if (args.avgReplyInterest >= 6.5) {
      strengths.push(`Reply interest averaging ${args.avgReplyInterest}/10 — keep tightening follow-up timing.`);
    } else if (args.avgReplyInterest < 5) {
      weaknesses.push(`Reply interest trending soft (${args.avgReplyInterest}/10) — review opener + qualification depth.`);
    }
  }

  if (typeof args.avgWarmupPlacementScore === "number") {
    if (args.avgWarmupPlacementScore >= 72) {
      strengths.push(`Warm-up placement scores look healthy (${args.avgWarmupPlacementScore} avg).`);
    } else if (args.avgWarmupPlacementScore < 60) {
      weaknesses.push(`Deliverability warm-up placement below 60 — lighten volume and check copy.`);
    }
  }

  const ab = args.abTestComparisons[0];
  if (ab?.winner_recommendation?.trim()) {
    strengths.push(`A/B signal: ${ab.winner_recommendation.slice(0, 220)}`);
  }

  if (args.campaignCount > 0 && typeof args.avgCompositeScore === "number" && args.avgCompositeScore < 52) {
    weaknesses.push(`Workspace composite ${args.avgCompositeScore}/100 — prioritize ICP fit and research depth on new runs.`);
  }

  return {
    voiceStats: args.voiceStats,
    strengths: strengths.slice(0, 6),
    weaknesses: weaknesses.slice(0, 6),
    momentum: forecastMomentum(args.forecastTrend),
  };
}

export type SalesCoachingAiBlock = {
  personalized_tips: string[];
  focus_areas: string[];
  voice_tips: { voice: string; tip: string }[];
  sequence_tips: string[];
  team_insight: string | null;
};

/**
 * Prompt 101 — Groq structured coaching from analytics + deterministic preview JSON.
 */
export async function generateSalesCoachingWithAi(args: {
  analytics: DashboardAnalyticsSummary;
  preview: CoachingPreviewDTO;
}): Promise<SalesCoachingAiBlock> {
  const system = `You are a sales enablement coach for a B2B outbound team using AgentForge. Output ONE JSON object only. No markdown.
Be specific, actionable, and kind — no blame; reference data themes only.`;

  const human = `Workspace analytics (JSON excerpt, truncated):
${JSON.stringify(
  {
    campaignCount: args.analytics.campaignCount,
    avgCompositeScore: args.analytics.avgCompositeScore,
    replyAnalyzedCount: args.analytics.replyAnalyzedCount,
    avgReplyInterest: args.analytics.avgReplyInterest,
    forecastDealCount: args.analytics.forecastDealCount,
    avgCloseProbability: args.analytics.avgCloseProbability,
    coachingPreview: args.preview,
  },
  null,
  2,
).slice(0, 14_000)}

Return JSON keys:
- personalized_tips (5-8 short bullet strings)
- focus_areas (3-5 improvement themes)
- voice_tips (array of { voice, tip } for top voices or gaps)
- sequence_tips (2-4 suggestions for multi-step plays)
- team_insight (one paragraph for managers, or empty string if solo)`;

  try {
    const { value: raw } = await invokeWithGroqRateLimitResilience(
      "sales_coaching",
      COACH_TEMPERATURE,
      (m) =>
        m.withStructuredOutput(coachingLlmSchema, { name: "sales_coaching" }).invoke(
          `${system}\n\n---\n${human}`,
        ),
    );
    const lax = coachingLlmSchema.safeParse(raw);
    if (!lax.success) {
      return {
        personalized_tips: [],
        focus_areas: [],
        voice_tips: [],
        sequence_tips: [],
        team_insight: null,
      };
    }
    const d = lax.data;
    const voice_tips = (d.voice_tips ?? [])
      .map((x) => ({
        voice: String(x.voice ?? "").trim(),
        tip: String(x.tip ?? "").trim(),
      }))
      .filter((x) => x.voice && x.tip)
      .slice(0, 8);
    return {
      personalized_tips: (d.personalized_tips ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 10),
      focus_areas: (d.focus_areas ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 8),
      voice_tips,
      sequence_tips: (d.sequence_tips ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 8),
      team_insight: d.team_insight?.trim() || null,
    };
  } catch {
    return {
      personalized_tips: [],
      focus_areas: [],
      voice_tips: [],
      sequence_tips: [],
      team_insight: null,
    };
  }
}
