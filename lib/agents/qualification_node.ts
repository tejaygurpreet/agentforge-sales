import "server-only";

import type { CampaignClientSnapshot, Lead, ResearchOutput } from "@/agents/types";
import { createServiceRoleSupabase } from "@/lib/supabase-server";
import { fetchLivingObjectionLibraryPromptBlock } from "@/lib/objection-library";

/**
 * Prompt 93 — Deal close probability + factor json (`close_probability`, `qualification_factors` on
 * `campaigns`) is computed in `lib/qualification-engine.ts` using these qualification signals together
 * with `lib/scoring.ts` and `lib/forecast.ts` (no change to graph thresholds).
 */

/**
 * Prompt 83 — living objection library context for qualification (and re-used by nurture).
 */
export async function loadLivingObjectionContextForWorkspace(
  workspaceId: string,
): Promise<string> {
  const sb = createServiceRoleSupabase();
  return fetchLivingObjectionLibraryPromptBlock(sb, workspaceId);
}

/** Prompt 89 — coarse region hint for scheduling (not a geolocation guarantee). */
export function inferLeadTimezoneHint(lead: Lead, research?: ResearchOutput | null): string {
  const email = lead.email?.toLowerCase() ?? "";
  const company = `${lead.company ?? ""} ${lead.notes ?? ""}`.toLowerCase();
  if (/\.(co\.uk|uk)\b/.test(email) || /\b(london|manchester|uk|united kingdom)\b/.test(company)) {
    return "Europe/London — prefer 09:00–17:00 local for buyer-facing slots.";
  }
  if (/\.(de|fr|nl|eu|ie)\b/.test(email) || /\b(berlin|paris|amsterdam|dublin)\b/.test(company)) {
    return "EU business hours — stagger vs US rep mornings.";
  }
  if (/\.(com\.au|nz|jp|in|sg|hk)\b/.test(email) || /\b(sydney|tokyo|singapore|mumbai)\b/.test(company)) {
    return "APAC — use early local morning or late US evening; confirm on reply.";
  }
  return "Americas default (America/New_York style) — confirm actual locale on live reply.";
}

export function inferResponsePatternFromOutreach(emailBodyExcerpt?: string | null): string {
  const body = (emailBodyExcerpt ?? "").slice(0, 2500);
  if (/\basync|when you have a moment|no rush|at your pace\b/i.test(body)) return "async_heavy";
  if (/\b(morning|8\s*(:|\.)?00|9\s*(:|\.)?00|10\s*(:|\.)?00|before noon)\b/i.test(body)) {
    return "morning_preferred";
  }
  if (/\b(afternoon|3\s*(:|\.)?00|4\s*(:|\.)?00|later in the day)\b/i.test(body)) {
    return "evening_ok";
  }
  return "unknown";
}

/**
 * Prompt 89 — injected into qualification (and referenced in nurture) for smart meeting windows.
 */
export function buildMeetingSchedulingPromptBlock(
  lead: Lead,
  research?: ResearchOutput | null,
  outreachEmailExcerpt?: string | null,
): string {
  const tz = inferLeadTimezoneHint(lead, research);
  const pattern = inferResponsePatternFromOutreach(outreachEmailExcerpt ?? undefined);
  const region = research?.industry_inference?.slice(0, 120) ?? "";
  return `=== MEETING_SCHEDULING_CONTEXT (Prompt 89) ===
Lead timezone / region hint: ${tz}${region ? `\nResearch industry context (non-authoritative): ${region}` : ""}
Inferred cadence from outreach excerpt: ${pattern}
Add **optional** JSON keys:
- "meeting_time_suggestions": 2–4 objects with label, start_iso, end_iso (UTC ISO8601), timezone_hint (IANA-style label), rationale (≤220 chars). Each window **45 minutes**, **weekdays**, **business hours**, on **at least two different calendar days**, respecting the timezone hint and cadence.
- "response_pattern_hint": one of morning_preferred | async_heavy | evening_ok | unknown (may match ${pattern}).
Omit these keys entirely if scheduling is premature.`;
}

// --- Prompt 92 — deterministic objection patterns + coach responses (dashboard + persistence) ---

export type ObjectionPatternId =
  | "budget_price"
  | "timing"
  | "authority"
  | "competitor"
  | "not_interested"
  | "need_proof"
  | "generic_soft_no";

const OBJECTION_RESPONSES: Record<
  ObjectionPatternId,
  { headline: string; body: string }
> = {
  budget_price: {
    headline: "Reframe around value and payback",
    body:
      "Totally fair — most teams ask this first. Here’s a tight version you can send: “Happy to align on numbers. A quick 15‑min would help me understand volume and timeline so I don’t waste your time with the wrong package. If it’s not a fit after that, I’ll bow out cleanly.”",
  },
  timing: {
    headline: "Respect the pause, keep a light door open",
    body:
      "Acknowledge timing without chasing: “Makes sense if Q3 is packed. I’ll pause here — if priorities shift, I’m happy to resurface a one‑pager or a 10‑min walkthrough. Want me to check back in [month] or should I leave it with you?”",
  },
  authority: {
    headline: "Clarify who else needs to be in the loop",
    body:
      "Gently map the buying committee: “Thanks for flagging — who else typically weighs in on a tool like this (security, finance, ops)? If helpful, I can send a short summary you can forward so you’re not translating for everyone.”",
  },
  competitor: {
    headline: "Stay curious, avoid trash talk",
    body:
      "Use a neutral compare frame: “Lots of teams evaluate a few options. The areas we hear matter most are [X/Y]. If you’re open to it, I can share how we approach those differently — no pressure to switch unless it genuinely helps your use case.”",
  },
  not_interested: {
    headline: "Close the loop with dignity",
    body:
      "Short and clean: “Appreciate the direct answer — I’ll close the loop on my side. If anything changes down the road, you’ve got my contact. Wishing you a smooth quarter.”",
  },
  need_proof: {
    headline: "Offer proof without a heavy ask",
    body:
      "Offer lightweight evidence: “Happy to share a relevant customer snippet or a redacted outcome from a similar team — would a 2‑bullet summary or a short Loom be more useful on your side?”",
  },
  generic_soft_no: {
    headline: "Low-pressure clarify",
    body:
      "Soft follow: “Thanks for the note. Sounds like now might not be the right moment — is it more about priority, fit, or timing? Either way I’m glad to send a leave-behind you can file for later.”",
  },
};

const PATTERN_RULES: { id: ObjectionPatternId; re: RegExp }[] = [
  {
    id: "budget_price",
    re: /\b(too\s+expensive|budget|pricing|cost|cheaper|discount|roi|can'?t\s+afford|no\s+budget)\b/i,
  },
  { id: "timing", re: /\b(not\s+now|next\s+(quarter|year|month)|busy|revisit|circle\s+back|later|timing|roadmap)\b/i },
  { id: "authority", re: /\b(boss|manager|committee|legal|procurement|need\s+approval|decision\s+maker|stakeholder)\b/i },
  { id: "competitor", re: /\b(already\s+(use|using|have)|competitor|vendor|incumbent|locked\s+into)\b/i },
  { id: "not_interested", re: /\b(not\s+interested|no\s+thanks|unsubscribe|stop\s+emailing|pass)\b/i },
  { id: "need_proof", re: /\b(proof|case\s+study|reference|customer|example|show\s+me|evidence|security\s+review)\b/i },
];

/**
 * Scans free text (reply preview, objection strings) for common buyer objections.
 */
export function detectObjectionPatternsFromText(text: string): ObjectionPatternId[] {
  const t = (text ?? "").slice(0, 4000);
  if (!t.trim()) return [];
  const seen = new Set<ObjectionPatternId>();
  const out: ObjectionPatternId[] = [];
  for (const { id, re } of PATTERN_RULES) {
    if (re.test(t) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  if (out.length === 0 && /\b(sorry|not\s+a\s+fit|not\s+sure|maybe|think\s+about)\b/i.test(t)) {
    out.push("generic_soft_no");
  }
  return out;
}

export function suggestResponsesForPatterns(
  patterns: ObjectionPatternId[],
): Array<{ pattern: ObjectionPatternId; headline: string; body: string }> {
  const seen = new Set<ObjectionPatternId>();
  const out: Array<{ pattern: ObjectionPatternId; headline: string; body: string }> = [];
  for (const p of patterns) {
    if (seen.has(p)) continue;
    seen.add(p);
    const block = OBJECTION_RESPONSES[p];
    if (block) out.push({ pattern: p, headline: block.headline, body: block.body });
    if (out.length >= 5) break;
  }
  return out;
}

/**
 * Pipeline qualification score (BANT node) plus optional live reply interest for dashboard display.
 * Does **not** change graph routing thresholds — display / persistence hint only.
 */
export function computeDisplayQualificationScore(
  snapshot: CampaignClientSnapshot,
  replyInterest0to10: number | null | undefined,
): {
  base: number | null;
  refined: number | null;
  next_best_action: string | null;
} {
  const detail = snapshot.qualification_detail;
  const baseRaw =
    typeof snapshot.qualification_score === "number" && Number.isFinite(snapshot.qualification_score)
      ? snapshot.qualification_score
      : typeof detail?.score === "number" && Number.isFinite(detail.score)
        ? detail.score
        : null;
  const next_best_action =
    typeof detail?.next_best_action === "string" && detail.next_best_action.trim()
      ? detail.next_best_action.trim().slice(0, 520)
      : null;
  if (baseRaw == null && next_best_action == null) {
    return { base: null, refined: null, next_best_action: null };
  }
  const base = baseRaw ?? 50;
  let delta = 0;
  if (typeof replyInterest0to10 === "number" && Number.isFinite(replyInterest0to10)) {
    delta = Math.round((replyInterest0to10 - 5) * 2.4);
  }
  const refined = Math.min(100, Math.max(0, Math.round(base + delta)));
  return { base: baseRaw, refined, next_best_action };
}

export type PersistedObjectionEntry = {
  source: "qualification_top_objection";
  text: string;
  patterns: string[];
  coach_headline?: string;
};

/**
 * JSON-safe rows for `campaigns.detected_objections` (jsonb).
 */
export function aggregateObjectionsForPersistence(
  snapshot: CampaignClientSnapshot,
): PersistedObjectionEntry[] {
  const detail = snapshot.qualification_detail;
  if (!detail?.top_objections?.length) return [];
  const out: PersistedObjectionEntry[] = [];
  for (const o of detail.top_objections) {
    const text = `${o.objection}`.slice(0, 220);
    const patterns = detectObjectionPatternsFromText(`${o.objection} ${o.reasoning}`);
    const coach = suggestResponsesForPatterns(patterns)[0];
    out.push({
      source: "qualification_top_objection",
      text,
      patterns,
      ...(coach ? { coach_headline: coach.headline.slice(0, 160) } : {}),
    });
  }
  return out.slice(0, 12);
}

export type ReplyObjectionCardInput = {
  id: string;
  thread_id: string | null;
  lead_name: string | null;
  company: string | null;
  reply_preview: string;
  analysis: unknown;
  created_at: string;
};

export type ReplyObjectionCardDTO = {
  id: string;
  thread_id: string | null;
  lead_name: string | null;
  company: string | null;
  reply_preview: string;
  analyzer_objections: string[];
  detected_patterns: string[];
  suggested_responses: { pattern: string; headline: string; body: string }[];
  created_at: string;
};

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

/** Builds one analytics card: pattern detection + suggested replies for recent prospect messages. */
export function buildReplyObjectionCardFromRow(input: ReplyObjectionCardInput): ReplyObjectionCardDTO {
  const preview = (input.reply_preview ?? "").slice(0, 1200);
  const analysis = isPlainObject(input.analysis) ? input.analysis : {};
  const analyzerObjs = Array.isArray(analysis.objections_detected)
    ? analysis.objections_detected
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim().slice(0, 220))
        .filter(Boolean)
    : [];
  const patternSet = new Set<ObjectionPatternId>();
  for (const p of detectObjectionPatternsFromText(preview)) patternSet.add(p);
  for (const o of analyzerObjs) {
    for (const p of detectObjectionPatternsFromText(o)) patternSet.add(p);
  }
  let patterns = [...patternSet];
  if (patterns.length === 0 && analyzerObjs.length > 0) {
    patterns = ["generic_soft_no"];
  }
  const suggested = suggestResponsesForPatterns(patterns);
  return {
    id: input.id,
    thread_id: input.thread_id,
    lead_name: input.lead_name,
    company: input.company,
    reply_preview: preview.slice(0, 420),
    analyzer_objections: analyzerObjs.slice(0, 8),
    detected_patterns: patterns,
    suggested_responses: suggested.map((s) => ({
      pattern: s.pattern,
      headline: s.headline,
      body: s.body,
    })),
    created_at: input.created_at,
  };
}

/**
 * Optional appendix for qualification prompts — surfaces pattern library labels without changing JSON schema.
 */
export function buildObjectionCoachAppendixForPrompt(): string {
  const lines = (Object.keys(OBJECTION_RESPONSES) as ObjectionPatternId[]).map(
    (id) => `- ${id}: ${OBJECTION_RESPONSES[id].headline}`,
  );
  return `=== OBJECTION_COACH_HINTS (Prompt 92, internal) ===
When listing top_objections, prefer buyer-voice phrasing that maps to these buckets when accurate:
${lines.join("\n")}
Keep objections specific to this lead; do not paste template bodies into JSON.`;
}

/** Prompt 97 — structured qualification + objection signals for the sales playbook generator. */
export type PlaybookQualificationSignals = {
  qualification_score: number | null;
  bant_summary: string | null;
  top_objections: { objection: string; reasoning?: string }[];
  next_best_action: string | null;
  detected_pattern_ids: ObjectionPatternId[];
};

/**
 * Prompt 97 — feeds `lib/playbook-generator.ts` with qualification + objection coach context
 * (no new persistence; snapshot-only).
 */
export function extractPlaybookQualificationSignals(
  snapshot: CampaignClientSnapshot,
): PlaybookQualificationSignals {
  const detail = snapshot.qualification_detail;
  const score =
    typeof snapshot.qualification_score === "number" && Number.isFinite(snapshot.qualification_score)
      ? snapshot.qualification_score
      : typeof detail?.score === "number" && Number.isFinite(detail.score)
        ? detail.score
        : null;
  const top =
    detail?.top_objections?.map((o) => ({
      objection: `${o.objection}`.slice(0, 400),
      reasoning: o.reasoning ? `${o.reasoning}`.slice(0, 400) : undefined,
    })) ?? [];
  const blob = top.map((o) => `${o.objection} ${o.reasoning ?? ""}`).join(" ");
  const detected_pattern_ids = detectObjectionPatternsFromText(blob);
  return {
    qualification_score: score,
    bant_summary:
      typeof detail?.bant_summary === "string" && detail.bant_summary.trim()
        ? detail.bant_summary.trim().slice(0, 2000)
        : null,
    top_objections: top.slice(0, 8),
    next_best_action:
      typeof detail?.next_best_action === "string" && detail.next_best_action.trim()
        ? detail.next_best_action.trim().slice(0, 800)
        : null,
    detected_pattern_ids,
  };
}
