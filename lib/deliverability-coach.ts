import "server-only";

import { z } from "zod";
import type {
  DeliverabilityCoachInsightsDTO,
  DeliverabilityWarmupLogDTO,
} from "@/types";
import { invokeWithGroqRateLimitResilience } from "@/lib/agent-model";

const COACH_TEMPERATURE = 0.35;

const coachLlmSchema = z
  .object({
    suggestions: z.array(z.string()).optional(),
    subject_line_ideas: z.array(z.string()).optional(),
    pattern_notes: z.array(z.string()).optional(),
  })
  .passthrough();

export type DeliverabilityWarmupMetricsInput = {
  warmupEnabled: boolean;
  logs14d: DeliverabilityWarmupLogDTO[];
  emailsSentLast7Days: number;
  avgPlacementLast7d: number | null;
  todayEmails: number;
  todayPlacement: number | null;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Heuristic composite 0–100 from warm-up discipline + placement trend. */
export function computeCompositeHealthScore(args: {
  emailsSentLast7Days: number;
  avgPlacementLast7d: number | null;
  todayEmails: number;
}): number {
  const volTarget = 35;
  const volScore = clamp((args.emailsSentLast7Days / volTarget) * 100, 0, 100);
  const place = args.avgPlacementLast7d ?? 72;
  const placeScore = clamp(place, 0, 100);
  const todayBoost = args.todayEmails > 0 ? 4 : 0;
  return Math.round(clamp(volScore * 0.42 + placeScore * 0.53 + todayBoost, 0, 100));
}

/** Inbox placement prediction 0–100 — blends rolling placement with volume curve. */
export function predictInboxPlacement(args: {
  avgPlacementLast7d: number | null;
  emailsSentLast7Days: number;
}): number {
  const base = args.avgPlacementLast7d ?? 68;
  const ramp = clamp(args.emailsSentLast7Days / 35, 0, 1);
  const lift = Math.round(8 * ramp);
  return clamp(base + lift - (args.emailsSentLast7Days > 42 ? 6 : 0), 0, 100);
}

/**
 * Smart scheduling hints (UTC) — informational; does not send mail.
 * Prefers Tue–Thu business hours for B2B outreach patterns.
 */
export function suggestWarmupSendWindows(): string[] {
  const d = new Date();
  const utcDow = d.getUTCDay();
  const slots: string[] = [];
  slots.push("Primary: Tue–Thu 14:00–17:00 UTC (reply-heavy window for US/EU overlap).");
  slots.push("Secondary: Mon/Wed 09:30–11:30 UTC (inbox freshness for EU-first accounts).");
  if (utcDow === 1 || utcDow === 5) {
    slots.push("Today: lighter volume — avoid bulk bursts on Mon/Fri if reputation is still warming.");
  }
  return slots;
}

/** Next weekday ~14:00 UTC for “daily warm-up window” UI (heuristic). */
export function computeNextSuggestedSendIso(): string {
  const start = new Date();
  for (let i = 1; i <= 10; i++) {
    const t = new Date(start);
    t.setUTCDate(t.getUTCDate() + i);
    const wd = t.getUTCDay();
    if (wd >= 1 && wd <= 5) {
      t.setUTCHours(14, 0, 0, 0);
      return t.toISOString();
    }
  }
  return new Date(start.getTime() + 86400000).toISOString();
}

export function buildDeterministicQuickTips(suite: DeliverabilityWarmupMetricsInput): string[] {
  const tips: string[] = [];
  if (!suite.warmupEnabled) {
    tips.push("Enable warm-up tracking to log disciplined daily volume alongside your ESP.");
  }
  if (suite.emailsSentLast7Days < 15) {
    tips.push("Increase logged warm-up touches toward ~5/day to mirror healthy domain ramp curves.");
  }
  if ((suite.avgPlacementLast7d ?? 0) < 65) {
    tips.push("Placement trending soft — shorten subjects, remove extra links, and avoid spam-trigger words.");
  }
  if (suite.todayEmails === 0 && suite.warmupEnabled) {
    tips.push("Log at least one warm-up touch today to keep streak momentum.");
  }
  tips.push("Send from a consistent From domain; keep HTML:image ratio balanced.");
  if (tips.length < 4) {
    tips.push("Stagger bulk sends — avoid back-to-back blasts in the same hour.");
  }
  return tips.slice(0, 8);
}

export function buildCoachInsightsFromSuite(
  suite: DeliverabilityWarmupMetricsInput,
): DeliverabilityCoachInsightsDTO {
  const warmupProgressPct = Math.min(
    100,
    Math.round((suite.emailsSentLast7Days / 35) * 100),
  );
  const healthScore = computeCompositeHealthScore({
    emailsSentLast7Days: suite.emailsSentLast7Days,
    avgPlacementLast7d: suite.avgPlacementLast7d,
    todayEmails: suite.todayEmails,
  });
  const placementPrediction = predictInboxPlacement({
    avgPlacementLast7d: suite.avgPlacementLast7d,
    emailsSentLast7Days: suite.emailsSentLast7Days,
  });
  let inboxPlacementLabel = "Steady";
  if (placementPrediction >= 82) inboxPlacementLabel = "Strong";
  else if (placementPrediction >= 68) inboxPlacementLabel = "Good";
  else if (placementPrediction >= 52) inboxPlacementLabel = "Fair";
  else inboxPlacementLabel = "At risk";

  return {
    healthScore,
    placementPrediction,
    warmupProgressPct,
    suggestedSendWindows: suggestWarmupSendWindows(),
    quickTips: buildDeterministicQuickTips(suite),
    inboxPlacementLabel,
  };
}

export function mergeCoachWithCache(
  base: DeliverabilityCoachInsightsDTO,
  lastCoachJson: unknown,
  lastCoachAtFromDb: string | null,
): { insights: DeliverabilityCoachInsightsDTO; cachedCoachAt: string | null } {
  if (!lastCoachJson || typeof lastCoachJson !== "object" || Array.isArray(lastCoachJson)) {
    return { insights: base, cachedCoachAt: lastCoachAtFromDb };
  }
  const o = lastCoachJson as Record<string, unknown>;
  const fromJson = typeof o.cached_at === "string" ? o.cached_at : null;
  const cachedCoachAt = lastCoachAtFromDb ?? fromJson;
  const aiTips = Array.isArray(o.suggestions)
    ? o.suggestions.filter((x): x is string => typeof x === "string").slice(0, 6)
    : [];
  if (aiTips.length === 0) return { insights: base, cachedCoachAt };
  const mergedTips = [...new Set([...aiTips, ...base.quickTips])].slice(0, 10);
  return {
    insights: { ...base, quickTips: mergedTips },
    cachedCoachAt,
  };
}

export async function generateAiCoachLayer(
  insights: DeliverabilityCoachInsightsDTO,
): Promise<{ suggestions: string[]; subject_line_ideas: string[]; pattern_notes: string[] }> {
  const system = `You are an email deliverability coach for B2B SDR teams. Output ONE JSON object only. No markdown.
Give practical, non-spammy advice — no guaranteed inbox placement claims.`;

  const human = `Metrics JSON:
${JSON.stringify(
  {
    healthScore: insights.healthScore,
    placementPrediction: insights.placementPrediction,
    warmupProgressPct: insights.warmupProgressPct,
    windows: insights.suggestedSendWindows,
  },
  null,
  2,
).slice(0, 6000)}

Return JSON keys: suggestions (4-6 short strings), subject_line_ideas (3 strings under 90 chars), pattern_notes (2-4 sending-pattern tips).`;

  try {
    const { value: raw } = await invokeWithGroqRateLimitResilience(
      "deliverability_coach",
      COACH_TEMPERATURE,
      (m) =>
        m.withStructuredOutput(coachLlmSchema, { name: "deliverability_coach" }).invoke(
          `${system}\n\n---\n${human}`,
        ),
    );
    const lax = coachLlmSchema.safeParse(raw);
    if (!lax.success) {
      return { suggestions: [], subject_line_ideas: [], pattern_notes: [] };
    }
    const d = lax.data;
    return {
      suggestions: (d.suggestions ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 8),
      subject_line_ideas: (d.subject_line_ideas ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 5),
      pattern_notes: (d.pattern_notes ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 6),
    };
  } catch {
    return { suggestions: [], subject_line_ideas: [], pattern_notes: [] };
  }
}

/** UTC bucket label for Prompt 99 `schedule_tag` on warm-up logs. */
export function scheduleTagForUtcNow(): string {
  const h = new Date().getUTCHours();
  if (h >= 9 && h < 12) return "morning_slot_utc";
  if (h >= 14 && h < 18) return "afternoon_slot_utc";
  return "off_peak_slot_utc";
}
