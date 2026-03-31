/**
 * Prompt 80 — heuristic email deliverability helpers (no third-party API).
 * Higher `inboxHealthScore` = safer / better predicted inbox placement (0–100).
 *
 * Prompt 99 — composite warm-up health, placement prediction, and AI coach tips live in
 * `lib/deliverability-coach.ts` (used by `getDeliverabilitySuiteAction`); spam checks here stay unchanged.
 */

export type DeliverabilityStatus = "excellent" | "good" | "fair" | "poor";

const SPAM_WORDS = new Set([
  "viagra",
  "winner",
  "congratulations",
  "click here",
  "buy now",
  "limited time",
  "act now",
  "100% free",
  "no obligation",
  "risk free",
  "cash",
  "credit",
  "prize",
  "guarantee",
  "miracle",
  "weight loss",
  "work from home",
]);

function stripHtml(html: string): string {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countLinks(html: string): number {
  return (html.match(/<a\b[^>]*href=/gi) ?? []).length;
}

function countImages(html: string): number {
  return (html.match(/<img\b/gi) ?? []).length;
}

/** Rough ratio of A–Z letters that are uppercase in running text. */
function shoutingRatio(text: string): number {
  const letters = text.match(/[a-zA-Z]/g);
  if (!letters?.length) return 0;
  const up = letters.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length;
  return up / letters.length;
}

export function statusFromInboxHealth(score: number): DeliverabilityStatus {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "fair";
  return "poor";
}

export type DeliverabilityAnalysis = {
  /** 0–100, higher = better predicted placement. */
  inboxHealthScore: number;
  deliverabilityStatus: DeliverabilityStatus;
  /** Human-readable issues (max ~8). */
  flags: string[];
  /** 0–100 spam *risk* (higher = worse) — inverse framing for UI labels. */
  spamRiskScore: number;
};

/**
 * Heuristic inbox health from subject + HTML body (outbound SDR context).
 * Not a substitute for seed-list testing — safe, deterministic, offline.
 */
export function analyzeDeliverability(subject: string, html: string): DeliverabilityAnalysis {
  const sub = (subject ?? "").trim();
  const rawHtml = html ?? "";
  const text = stripHtml(rawHtml);
  const combined = `${sub}\n${text}`.toLowerCase();

  let penalty = 0;
  const flags: string[] = [];

  if (sub.length === 0) {
    penalty += 25;
    flags.push("Empty subject line");
  } else if (sub.length > 120) {
    penalty += 8;
    flags.push("Very long subject line");
  }

  if (/!!+/.test(sub)) {
    penalty += 6;
    flags.push("Multiple exclamation marks in subject");
  }

  const linkN = countLinks(rawHtml);
  if (linkN > 5) {
    penalty += Math.min(20, (linkN - 5) * 3);
    flags.push(`Many links (${linkN}) — consider fewer CTAs`);
  } else if (linkN === 0 && text.length > 400) {
    penalty += 4;
    flags.push("Long body with no link — optional for some filters");
  }

  const imgN = countImages(rawHtml);
  if (imgN > 2) {
    penalty += Math.min(15, imgN * 4);
    flags.push(`Heavy image use (${imgN}) — balance with text`);
  }

  const shout = shoutingRatio(sub + " " + text.slice(0, 2000));
  if (shout > 0.35) {
    penalty += 12;
    flags.push("High uppercase ratio (looks like shouting)");
  }

  const exclaim = (text.match(/!/g) ?? []).length;
  if (exclaim > 6) {
    penalty += 8;
    flags.push("Many exclamation marks in body");
  }

  const dollar = (combined.match(/\$/g) ?? []).length;
  if (dollar > 3) {
    penalty += 6;
    flags.push("Repeated currency symbols");
  }

  for (const w of SPAM_WORDS) {
    if (combined.includes(w)) {
      penalty += 7;
      flags.push(`Spam-trigger phrase: “${w}”`);
      if (flags.length >= 8) break;
    }
  }

  if (text.length < 40 && text.length > 0) {
    penalty += 5;
    flags.push("Very short body — some filters prefer substance");
  }

  const uniq = [...new Set(flags)];
  const inboxHealthScore = Math.max(0, Math.min(100, Math.round(100 - penalty)));
  const spamRiskScore = Math.max(0, Math.min(100, 100 - inboxHealthScore));

  return {
    inboxHealthScore,
    deliverabilityStatus: statusFromInboxHealth(inboxHealthScore),
    flags: uniq.slice(0, 8),
    spamRiskScore,
  };
}

/** Rolling 7-day warm-up volume → synthetic placement score (0–100). */
export function inboxPlacementFromWarmupVolume(emailsSent7d: number): number {
  const n = Math.max(0, Math.min(350, emailsSent7d));
  return Math.max(0, Math.min(100, Math.round(28 + n * 0.2)));
}

/** Single-day log row → placement hint (ramps with consistency). */
export function placementScoreForDailyLog(emailsSent: number): number {
  const e = Math.max(0, Math.min(50, emailsSent));
  return Math.max(0, Math.min(100, Math.round(45 + e * 1.1)));
}
