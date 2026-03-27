import type { Lead } from "@/agents/types";
import {
  type MeetingTimeSuggestion,
  type QualificationAgentResult,
  type QualificationObjection,
  qualificationAgentSchema,
  type QualificationAgentLlmResult,
  meetingTimeSuggestionSchema,
} from "@/agents/types";

const OBJ_MIN = 15;
const OBJ_MAX = 135;
const REASON_MIN = 35;
const REASON_MAX = 240;
const NBA_MIN = 32;
const NBA_MAX = 520;

const PAD_OBJ = " — confirm in live discovery.";
const PAD_REASON =
  " Deal risk: unknown stakeholder map; rep move: ask who owns budget and timeline on the next touch.";
const PAD_NBA =
  " Then: send one proof point plus a single qualifying question; pause if no reply in 7 days.";

function clampLen(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max);
}

function padMin(s: string, minLen: number, suffix: string, maxLen: number): string {
  let t = s.trim();
  if (t.length >= minLen) return clampLen(t, maxLen);
  while (t.length < minLen) {
    t = `${t} ${suffix}`.trim();
  }
  return clampLen(t, maxLen);
}

function normalizeObjection(raw: { objection: string; reasoning: string }): QualificationObjection {
  return {
    objection: padMin(raw.objection, OBJ_MIN, PAD_OBJ, OBJ_MAX),
    reasoning: padMin(raw.reasoning, REASON_MIN, PAD_REASON, REASON_MAX),
  };
}

const STOCK_OBJECTIONS: QualificationObjection[] = [
  {
    objection:
      "This has to fight for budget against three other Q priorities — we need a hard ROI story, not a slide.",
    reasoning:
      "Impact: deal slips a quarter if it stays nice-to-have. Rep move: anchor one KPI they already report and ask what would promote this to top two.",
  },
  {
    objection:
      "Our security and legal path is slow — anything touching customer data goes through review before a pilot.",
    reasoning:
      "Impact: calendar risk even when champion is warm. Rep move: send one-pager + data flow; ask who owns infosec sign-off and typical elapsed weeks.",
  },
  {
    objection:
      "We are mid-stack in your category — ripping anything out is a political project, not a feature swap.",
    reasoning:
      "Impact: no-decision or POC theater. Rep move: carve a 30-day wedge with one team; name the exec who can bless a parallel trial.",
  },
];

function objectionSignature(o: QualificationObjection): string {
  return `${o.objection.slice(0, 72)}|${o.reasoning.slice(0, 48)}`.toLowerCase();
}

function sanitizeMeetingSuggestions(raw: unknown): MeetingTimeSuggestion[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: MeetingTimeSuggestion[] = [];
  for (const row of raw.slice(0, 5)) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const r = row as Record<string, unknown>;
    const parsed = meetingTimeSuggestionSchema.safeParse({
      label: r.label,
      start_iso: r.start_iso,
      end_iso: r.end_iso,
      timezone_hint: r.timezone_hint,
      rationale: r.rationale,
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out.length ? out : undefined;
}

function sanitizeResponsePatternHint(
  raw: unknown,
): QualificationAgentResult["response_pattern_hint"] {
  if (raw === "morning_preferred" || raw === "async_heavy" || raw === "evening_ok" || raw === "unknown") {
    return raw;
  }
  return undefined;
}

function dedupeObjections(rows: QualificationObjection[]): QualificationObjection[] {
  const seen = new Set<string>();
  const out: QualificationObjection[] = [];
  for (const r of rows) {
    const s = objectionSignature(r);
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(r);
  }
  return out;
}

/** Always three distinct objections for UI + nurture consistency. */
function ensureThreeObjections(rows: QualificationObjection[]): QualificationObjection[] {
  const out = rows.slice(0, 3);
  for (const stock of STOCK_OBJECTIONS) {
    if (out.length >= 3) break;
    if (!out.some((o) => objectionSignature(o) === objectionSignature(stock))) {
      out.push(stock);
    }
  }
  return out.slice(0, 3);
}

function looksLikeSystemNoiseInBant(s: string): boolean {
  return /\b(schema|timeout|groq|openai|anthropic|llm|api key|validation failed|rate limit|error code|json parse|parse error|structured output|tool call)\b/i.test(
    s,
  );
}

function strategicBantFallback(lead?: Lead): string {
  const c = lead?.company?.trim() || "This account";
  const n = lead?.name?.trim() || "the contact";
  return `${c}: Budget is still a hypothesis — ask for band and whether this is opex or a project line before sizing the deal. Authority starts with ${n} but the economic buyer may be parallel; map both early. Need should match what the function is measured on this half; pressure-test priority versus nice-to-have. Timeline only matters once they cite a forcing event — capture that before you forecast.`;
}

/** Keep qual score aligned with stabilized research ICP; avoid crash-to-zero (Prompt 30). */
function stabilizeQualificationScore(
  lead: Lead | undefined,
  raw: number,
  icpFromResearch?: number,
): number {
  let s = Number.isFinite(raw) ? Math.min(100, Math.max(0, Math.round(raw))) : 52;
  const ok =
    !!lead &&
    (lead.company ?? "").trim().length >= 2 &&
    (lead.name ?? "").trim().length >= 1;
  if (typeof icpFromResearch === "number" && Number.isFinite(icpFromResearch)) {
    const floor = Math.max(40, Math.min(78, icpFromResearch - 10));
    s = Math.max(s, floor);
    s = Math.min(s, 97);
  } else if (ok && s < 36) {
    s = Math.max(s, 42);
  }
  return s;
}

export type NormalizeQualificationOutcome = {
  result: QualificationAgentResult;
  /** True when canonical validation failed and stock fallback was used. */
  usedFallback: boolean;
};

export type NormalizeQualificationOpts = {
  lead?: Lead;
  icpFromResearch?: number;
};

/**
 * Maps relaxed LLM output to the canonical qualification shape (strict Zod).
 * Never throws; pads/trims fields and enforces exactly three objections.
 */
export function normalizeQualificationLlmToCanonical(
  raw: QualificationAgentLlmResult,
  opts?: NormalizeQualificationOpts,
): NormalizeQualificationOutcome {
  const rawScore = Number(raw.score);
  const score = stabilizeQualificationScore(opts?.lead, rawScore, opts?.icpFromResearch);

  let objections = (raw.top_objections ?? [])
    .filter((o) => o && typeof o.objection === "string")
    .map((o) =>
      normalizeObjection({
        objection: o.objection,
        reasoning: typeof o.reasoning === "string" ? o.reasoning : "",
      }),
    );

  objections = dedupeObjections(objections).slice(0, 3);

  if (objections.length === 0) {
    objections = [...STOCK_OBJECTIONS];
  } else {
    objections = ensureThreeObjections(objections);
  }

  let bant =
    typeof raw.bant_summary === "string" && raw.bant_summary.trim().length > 0
      ? raw.bant_summary.trim()
      : strategicBantFallback(opts?.lead);

  if (looksLikeSystemNoiseInBant(bant)) {
    bant = strategicBantFallback(opts?.lead);
  }

  bant = clampLen(bant, 4000);

  let nba = padMin(
    typeof raw.next_best_action === "string" ? raw.next_best_action : "",
    NBA_MIN,
    PAD_NBA,
    NBA_MAX,
  );

  const meeting_time_suggestions = sanitizeMeetingSuggestions(
    (raw as { meeting_time_suggestions?: unknown }).meeting_time_suggestions,
  );
  const response_pattern_hint = sanitizeResponsePatternHint(
    (raw as { response_pattern_hint?: unknown }).response_pattern_hint,
  );

  const draft: QualificationAgentResult = {
    score,
    top_objections: objections,
    bant_summary: bant,
    next_best_action: nba,
    ...(meeting_time_suggestions ? { meeting_time_suggestions } : {}),
    ...(response_pattern_hint ? { response_pattern_hint } : {}),
  };

  const parsed = qualificationAgentSchema.safeParse(draft);
  if (parsed.success) {
    return { result: parsed.data, usedFallback: false };
  }

  return {
    result: buildFallbackQualification(opts?.lead, "normalize_repair_failed"),
    usedFallback: true,
  };
}

export function buildFallbackQualification(
  lead: Lead | undefined,
  _reason: string,
  opts?: { icpHint?: number },
): QualificationAgentResult {
  const company = lead?.company?.trim() || "this account";
  const hint = opts?.icpHint;
  let score = 58;
  if (typeof hint === "number" && Number.isFinite(hint)) {
    score = Math.min(86, Math.max(54, Math.round(hint - 5)));
  }
  const bant_summary = strategicBantFallback(lead);

  return {
    score,
    top_objections: [...STOCK_OBJECTIONS],
    bant_summary,
    next_best_action:
      `Today: CRM note — one-line pain hypothesis + next owner. Then: single follow-up with one proof point and one question tied to ${company}'s stated motion. If no reply in 7 business days: pause automation; enrich notes or take a live call before re-scoring.`,
  };
}
