import {
  bantBlockForLead,
  buildFallbackResearchOutput,
  replaceLegacyNewsSummaryIfNeeded,
  stabilizeResearchIcpScore,
} from "@/agents/pipeline-fallbacks";
import {
  type BantAssessment,
  type Lead,
  type ResearchOutput,
  type ResearchOutputLlmShape,
  researchOutputLlmSchema,
  researchOutputSchema,
} from "@/agents/types";

const SEGMENTS = ["micro", "smb", "mid_market", "enterprise", "unknown"] as const;

const TOKEN_STOP = new Set([
  "that",
  "this",
  "with",
  "from",
  "your",
  "their",
  "have",
  "been",
  "will",
  "would",
  "could",
  "should",
  "about",
  "which",
  "where",
  "when",
  "what",
  "into",
  "than",
  "then",
  "them",
  "these",
  "those",
  "there",
  "here",
  "they",
  "only",
  "also",
  "just",
  "very",
]);

function stripReasoningStepPrefix(s: string): string {
  return s.replace(/^\s*Step\s+\d+\s*[—:\-]\s*/i, "").trim();
}

function wordBag(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const body = s.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  for (const w of body.split(/\s+/)) {
    if (w.length < 4 || TOKEN_STOP.has(w)) continue;
    m.set(w, (m.get(w) ?? 0) + 1);
  }
  return m;
}

function jaccardWeighted(a: Map<string, number>, b: Map<string, number>): number {
  let inter = 0;
  let union = 0;
  const keys = new Set<string>([...a.keys(), ...b.keys()]);
  for (const k of keys) {
    const ca = a.get(k) ?? 0;
    const cb = b.get(k) ?? 0;
    inter += Math.min(ca, cb);
    union += Math.max(ca, cb);
  }
  return union === 0 ? 0 : inter / union;
}

function maxJaccardToPrior(candidate: string, priorBodies: string[]): number {
  const c = wordBag(candidate);
  if (c.size === 0) return 0;
  let max = 0;
  for (const p of priorBodies) {
    const j = jaccardWeighted(c, wordBag(p));
    if (j > max) max = j;
  }
  return max;
}

/** Drop near-duplicate lines: prefix match and token overlap (Prompt 28). */
function dedupeReasoningSteps(steps: string[]): { steps: string[]; deduped: boolean } {
  const seenPrefix = new Set<string>();
  const out: string[] = [];
  const bodiesForJaccard: string[] = [];
  let deduped = false;
  for (const raw of steps) {
    const s = raw.trim();
    if (!s) continue;
    const body = stripReasoningStepPrefix(s);
    const prefixKey = body.slice(0, 88).toLowerCase().replace(/\s+/g, " ");
    if (seenPrefix.has(prefixKey)) {
      deduped = true;
      continue;
    }
    if (body.length > 28 && maxJaccardToPrior(body, bodiesForJaccard) > 0.52) {
      deduped = true;
      continue;
    }
    seenPrefix.add(prefixKey);
    bodiesForJaccard.push(body);
    out.push(s);
  }
  return { steps: out, deduped };
}

/** Dedupe short list fields (pain, tech hints) by overlap (Prompt 28). */
function dedupeSimilarLines(lines: string[], jaccardThreshold: number): { lines: string[]; deduped: boolean } {
  const out: string[] = [];
  const bodies: string[] = [];
  let deduped = false;
  for (const raw of lines) {
    const s = raw.trim();
    if (!s) continue;
    const norm = s.slice(0, 120).toLowerCase().replace(/\s+/g, " ");
    if (out.some((o) => o.slice(0, 120).toLowerCase().replace(/\s+/g, " ") === norm)) {
      deduped = true;
      continue;
    }
    if (s.length > 24 && maxJaccardToPrior(s, bodies) > jaccardThreshold) {
      deduped = true;
      continue;
    }
    bodies.push(s);
    out.push(s);
  }
  return { lines: out, deduped };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function coerceScore(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) {
    return Math.min(100, Math.max(0, Math.round(v)));
  }
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number.parseFloat(v.replace(/,/g, ""));
    if (Number.isFinite(n)) return Math.min(100, Math.max(0, Math.round(n)));
  }
  return 62;
}

function mergeBantLeg(
  raw: unknown,
  fallback: BantAssessment["budget"],
): BantAssessment["budget"] {
  if (!isRecord(raw)) return fallback;
  const confRaw = raw.confidence;
  const confidence =
    confRaw === "none" ||
    confRaw === "low" ||
    confRaw === "medium" ||
    confRaw === "high"
      ? confRaw
      : fallback.confidence;
  return {
    evidence:
      typeof raw.evidence === "string" && raw.evidence.trim().length > 0
        ? raw.evidence.trim()
        : fallback.evidence,
    confidence,
    notes:
      typeof raw.notes === "string" && raw.notes.trim().length > 0
        ? raw.notes.trim()
        : fallback.notes,
  };
}

function mergeBant(raw: unknown, lead: Lead): BantAssessment {
  const d = bantBlockForLead(lead);
  if (!isRecord(raw)) return d;
  return {
    budget: mergeBantLeg(raw.budget, d.budget),
    authority: mergeBantLeg(raw.authority, d.authority),
    need: mergeBantLeg(raw.need, d.need),
    timeline: mergeBantLeg(raw.timeline, d.timeline),
  };
}

function mergeCompanySize(raw: unknown): ResearchOutput["company_size_inference"] {
  const fallback: ResearchOutput["company_size_inference"] = {
    segment: "smb",
    employee_band_guess:
      "Headcount isn't on the record — ask whether they're closer to dozens or hundreds of seats.",
    rationale: "Size the account on the first live touch, not from the lead row alone.",
  };
  if (!isRecord(raw)) return fallback;
  const seg = raw.segment;
  let segment: ResearchOutput["company_size_inference"]["segment"] = SEGMENTS.includes(
    seg as (typeof SEGMENTS)[number],
  )
    ? (seg as ResearchOutput["company_size_inference"]["segment"])
    : fallback.segment;
  if (segment === "unknown") segment = "smb";
  return {
    segment,
    employee_band_guess:
      typeof raw.employee_band_guess === "string" && raw.employee_band_guess.trim()
        ? raw.employee_band_guess.trim()
        : fallback.employee_band_guess,
    rationale:
      typeof raw.rationale === "string" && raw.rationale.trim()
        ? raw.rationale.trim()
        : fallback.rationale,
  };
}

const REASONING_PAD = [
  "Map champion vs economic buyer before you attach a number to the deal.",
  "Pressure-test whether the pain is budgeted or curiosity-only on the next touch.",
  "Tie one claim to a metric they already report upward.",
  "Stress-test single-thread risk if only one name is warm.",
  "Name the internal initiative that would force a budget conversation this quarter.",
  "Identify the proof artifact that would survive a skeptical finance or security review.",
];

function padReasoningSteps(steps: string[]): string[] {
  const clean = steps.map((s) => s.trim()).filter(Boolean);
  let out = clean.length > 8 ? clean.slice(0, 8) : [...clean];
  let i = out.length + 1;
  let p = 0;
  while (out.length < 6 && p < REASONING_PAD.length) {
    out.push(`Step ${i} — ${REASONING_PAD[p]}`);
    i += 1;
    p += 1;
  }
  while (out.length < 6) {
    out.push(`Step ${i} — Validate timeline and procurement path before proposing a pilot.`);
    i += 1;
  }
  return out.slice(0, 8);
}

function padStringArray(arr: string[], min: number, max: number, filler: string[]): string[] {
  const clean = arr.map((s) => s.trim()).filter(Boolean);
  const out = [...clean];
  let f = 0;
  while (out.length < min && f < filler.length) {
    out.push(filler[f]!);
    f += 1;
  }
  const extra = [
    "Pin down the system of record they trust before you propose a swap.",
    "Ask which workflow breaks first when volume spikes — that usually surfaces real pain.",
  ];
  let e = 0;
  while (out.length < min) {
    out.push(extra[e % extra.length]!);
    e += 1;
  }
  return out.slice(0, max);
}

/** Strip legacy "(inferred …)" crumbs so customer-facing JSON never carries meta tags (Prompt 48). */
function stripInferenceCrumbs(s: string): string {
  const t = s
    .replace(/\s*\(inferred[^)]*\)\s*/gi, " ")
    .replace(/\s*\*{1,2}\(inferred[^)]*\)\*{1,2}\s*/gi, " ")
    .replace(/\binferred from\b/gi, "based on")
    .replace(/\s*\[tbd\]\s*/gi, " ")
    .replace(/\s*\(tbd\)\s*/gi, " ");
  return t.replace(/\s{2,}/g, " ").trim();
}

function sanitizeResearchOutput(o: ResearchOutput): ResearchOutput {
  const m = (s: string) => stripInferenceCrumbs(s);
  const seg = o.company_size_inference.segment === "unknown" ? "smb" : o.company_size_inference.segment;
  return {
    ...o,
    executive_summary: m(o.executive_summary),
    icp_fit_summary: m(o.icp_fit_summary),
    industry_inference: m(o.industry_inference),
    recent_news_or_funding_summary: m(o.recent_news_or_funding_summary),
    reasoning_steps: o.reasoning_steps.map(m),
    tech_stack_hints: o.tech_stack_hints.map(m),
    key_stakeholders: o.key_stakeholders.map(m),
    pain_points: o.pain_points.map(m),
    messaging_angles: o.messaging_angles.map(m),
    company_size_inference: {
      ...o.company_size_inference,
      segment: seg,
      employee_band_guess: m(o.company_size_inference.employee_band_guess),
      rationale: m(o.company_size_inference.rationale),
    },
    bant_assessment: {
      budget: {
        ...o.bant_assessment.budget,
        evidence: m(o.bant_assessment.budget.evidence),
        notes: m(o.bant_assessment.budget.notes),
      },
      authority: {
        ...o.bant_assessment.authority,
        evidence: m(o.bant_assessment.authority.evidence),
        notes: m(o.bant_assessment.authority.notes),
      },
      need: {
        ...o.bant_assessment.need,
        evidence: m(o.bant_assessment.need.evidence),
        notes: m(o.bant_assessment.need.notes),
      },
      timeline: {
        ...o.bant_assessment.timeline,
        evidence: m(o.bant_assessment.timeline.evidence),
        notes: m(o.bant_assessment.timeline.notes),
      },
    },
  };
}

/**
 * Coerces loose LLM / tool JSON into `researchOutputSchema`-safe output.
 * Fills `industry_inference`, nested BANT, company size, and array mins without discarding good partials.
 */
export function normalizeResearchLlmToCanonical(
  raw: unknown,
  lead: Lead,
): { output: ResearchOutput; patched: boolean } {
  const lax = researchOutputLlmSchema.safeParse(raw);
  const r: Partial<ResearchOutputLlmShape> = lax.success ? lax.data : {};
  let patched = !lax.success;

  const company = (lead.company || "this account").trim();
  const first = (lead.name || "Contact").split(/\s+/)[0] || "Contact";

  const industry =
    typeof r.industry_inference === "string" && r.industry_inference.trim().length > 0
      ? r.industry_inference.trim()
      : (() => {
          patched = true;
          return `${company}: sector and sub-vertical stay open until the first call — use ${first}'s title and notes to steer discovery, then nail the buyer map live.`;
        })();

  const rawRecent =
    typeof r.recent_news_or_funding_summary === "string"
      ? r.recent_news_or_funding_summary
      : "";
  const recentNorm = replaceLegacyNewsSummaryIfNeeded(rawRecent, lead);
  let recent = recentNorm;
  if (recentNorm !== rawRecent.trim()) patched = true;

  const stepsIn = Array.isArray(r.reasoning_steps) ? r.reasoning_steps : [];
  const rawSteps = stepsIn
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean);
  const { steps: dedupedSteps, deduped } = dedupeReasoningSteps(rawSteps);
  if (deduped) patched = true;
  const reasoning_steps = padReasoningSteps(dedupedSteps);
  if (stepsIn.length < 6) patched = true;

  const rawTech = Array.isArray(r.tech_stack_hints)
    ? r.tech_stack_hints.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean)
    : [];
  const techDedup = dedupeSimilarLines(rawTech, 0.55);
  if (techDedup.deduped) patched = true;
  const tech_stack_hints = padStringArray(
    techDedup.lines,
    2,
    10,
    [
      "Ask which systems own pipeline, billing, and customer record today.",
      "Confirm whether a security review gates any data share before you promise timelines.",
    ],
  );
  if (!Array.isArray(r.tech_stack_hints) || r.tech_stack_hints.length < 2) patched = true;

  const rawStake = Array.isArray(r.key_stakeholders)
    ? r.key_stakeholders.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean)
    : [];
  const stakeDedup = dedupeSimilarLines(rawStake, 0.52);
  if (stakeDedup.deduped) patched = true;
  const key_stakeholders = padStringArray(
    stakeDedup.lines,
    2,
    8,
    [
      `${lead.name} — map champion vs economic buyer.`,
      "Procurement / legal — likely on path if contract or data access expands.",
    ],
  );
  if (!Array.isArray(r.key_stakeholders) || r.key_stakeholders.length < 2) patched = true;

  const rawPain = Array.isArray(r.pain_points)
    ? r.pain_points.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean)
    : [];
  const painDedup = dedupeSimilarLines(rawPain, 0.55);
  if (painDedup.deduped) patched = true;
  const pain_points = padStringArray(
    painDedup.lines,
    2,
    8,
    [
      "Throughput or margin pressure for the role — validate with one metric they already track.",
      "Cross-team handoff friction — confirm if it is a top-3 initiative this half.",
    ],
  );
  if (!Array.isArray(r.pain_points) || r.pain_points.length < 2) patched = true;

  const rawAngles = Array.isArray(r.messaging_angles)
    ? r.messaging_angles.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean)
    : [];
  const angleDedup = dedupeSimilarLines(rawAngles, 0.58);
  if (angleDedup.deduped) patched = true;
  let messaging_angles: string[] = [...angleDedup.lines];
  let anglePad = 0;
  while (messaging_angles.length < 3) {
    patched = true;
    anglePad += 1;
    messaging_angles.push(
      anglePad === 1
        ? `What single metric would ${first} defend in a leadership review if ${company} improved it this quarter?`
        : anglePad === 2
          ? `Which workflow breaks first when ${company} scales volume — and who owns fixing it?`
          : `If budget were frozen, what would still force ${company} to act in your category?`,
    );
  }
  messaging_angles = messaging_angles.slice(0, 3);

  const executive_summary =
    typeof r.executive_summary === "string" && r.executive_summary.trim().length > 24
      ? r.executive_summary.trim()
      : (() => {
          patched = true;
          return `${first} at ${company}: outbound angle should lean on how they grow revenue or ship product — pick one tension from title + notes (or role alone) and make it the spine of the first call. Biggest open question: is this problem budgeted or still below the line? One discovery line to test: what proof would make ${company} move faster vs. keep status quo for another quarter?`;
        })();

  const icp_fit_summary =
    typeof r.icp_fit_summary === "string" && r.icp_fit_summary.trim().length > 40
      ? r.icp_fit_summary.trim()
      : (() => {
          patched = true;
          return `${company} compares favorably to noisy SMB lists when ${first} maps to a buying center that touches pipeline, customer delivery, or finance ops. Weaker neighbors stall on unclear ROI — here the job is to tie motion to a metric leadership already tracks. Landmines: pilot theater without an owner, or tools that need security review before value. Must-haves on call one: timeline driver, who can reallocate budget, and what broke last time they tried a shortcut.`;
        })();

  const rawIcp = coerceScore(r.icp_fit_score);
  const icpStabilized = stabilizeResearchIcpScore(lead, rawIcp);
  if (icpStabilized !== rawIcp) patched = true;

  const merged: ResearchOutput = {
    icp_fit_score: icpStabilized,
    reasoning_steps,
    industry_inference: industry,
    recent_news_or_funding_summary: recent,
    bant_assessment: mergeBant(r.bant_assessment, lead),
    company_size_inference: mergeCompanySize(r.company_size_inference),
    tech_stack_hints,
    icp_fit_summary,
    key_stakeholders,
    pain_points,
    messaging_angles,
    executive_summary,
  };

  const parsed = researchOutputSchema.safeParse(sanitizeResearchOutput(merged));
  if (!parsed.success) {
    return {
      output: buildFallbackResearchOutput(lead, "research_normalize_schema_failed"),
      patched: true,
    };
  }
  return { output: parsed.data, patched };
}
