import type { Lead, NurtureOutput, OutreachDraft, ResearchOutput } from "@/agents/types";
import { normalizeOutreachEmailHtml } from "@/lib/outreach-email-format";
import { resolveOutreachSignoffName } from "@/lib/outreach-signoff";
import {
  nurtureOutputSchema,
  outreachDraftSchema,
  researchOutputSchema,
} from "@/agents/types";

/**
 * Heuristic ICP when the LLM path fails — uses notes, email domain, title cues.
 * Keeps strength metrics realistic vs flat 48 (Prompt 18 quality-preserving fallback).
 */
export function estimateIcpFromLead(lead: Lead): number {
  let score = 62;
  const notes = (lead.notes ?? "").trim();
  if (notes.length > 80) score += 6;
  if (notes.length > 220) score += 5;
  if (notes.length > 500) score += 4;
  const email = lead.email.toLowerCase();
  if (
    /@gmail\.|@yahoo\.|@hotmail\.|@icloud\.|@outlook\./i.test(email)
  ) {
    score -= 7;
  }
  if (email.includes("@") && !/@gmail\.|@yahoo\.|@hotmail\.|@icloud\.|@outlook\./i.test(email)) {
    score += 8;
  }
  const blob = `${lead.name} ${notes} ${lead.company}`.toLowerCase();
  if (
    /\b(vp|vice president|director|head of|chief|cfo|ceo|cto|cro|cmo|owner|founder|partner)\b/i.test(
      blob,
    )
  ) {
    score += 9;
  }
  if (/\b(enterprise|series [a-d]|500\+|global|revenue|procurement)\b/i.test(blob)) {
    score += 4;
  }
  return Math.min(88, Math.max(55, Math.round(score)));
}

/**
 * When the model returns a broken ICP (e.g. 1/100 on a real account), blend toward lead heuristics (Prompt 39).
 */
export function stabilizeResearchIcpScore(lead: Lead, raw: number): number {
  const n = Math.min(100, Math.max(0, Math.round(raw)));
  const company = (lead.company ?? "").trim();
  const name = (lead.name ?? "").trim();
  if (company.length < 2 || name.length < 1) return n;
  const est = estimateIcpFromLead(lead);
  if (n <= 18) return Math.max(56, Math.min(88, est));
  if (n < 36) return Math.max(n, Math.min(84, est - 1));
  if (n < 44) return Math.max(n, 48);
  return n;
}

/** Default BANT legs when the model omits or partial-fills `bant_assessment` (Prompt 26). */
export function bantBlockForLead(lead: Lead) {
  const noteSnippet = lead.notes?.slice(0, 140)?.trim();
  return {
    budget: {
      evidence:
        noteSnippet ||
        "Budget scope not stated — open with range, timing, and capex vs opex on the first call.",
      confidence: "low" as const,
      notes: "Confirm range, approval path, and whether this is opex or capex.",
    },
    authority: {
      evidence: `Named contact ${lead.name} at ${lead.company}.`,
      confidence: "medium" as const,
      notes: "Map economic buyer vs champion; validate who signs vendor agreements.",
    },
    need: {
      evidence:
        noteSnippet ||
        `Role + company context suggest operational priorities to validate on discovery.`,
      confidence: noteSnippet ? ("medium" as const) : ("low" as const),
      notes: "Anchor to one measurable outcome they already track.",
    },
    timeline: {
      evidence: "Decision timing not on the lead — anchor to their fiscal or planning rhythm live.",
      confidence: "none" as const,
      notes: "Ask what would need to be true for a pilot this half.",
    },
  };
}

/**
 * Rotating analyst lenses — avoids same default every time (Prompt 28).
 */
export function defaultRecentNewsInsight(lead: Lead): string {
  const company = (lead.company || "This account").trim();
  const first = (lead.name || "the buyer").split(/\s+/)[0] || "the buyer";
  const seed = (company.length + first.length + (lead.email?.length ?? 0)) % 3;
  const v = [
    `${company}: prioritize discovery on whether ${first} is in **expand**, **optimize**, or **defend** mode on GTM spend — that posture usually predicts urgency more than a headline.`,
    `For ${company}, frame timing around **what would force a budget conversation this quarter** for ${first}'s function — execution risk, margin pressure, or consolidation are common levers to test early.`,
    `${first} at ${company}: test whether the live initiative is **net-new capability** vs **replacing something brittle** — the reply path and proof they need differ sharply between those two.`,
  ];
  return v[seed]!;
}

/** Prompt 28: strip empty output + legacy tool-meta / web-disclaimer phrasing. */
export function replaceLegacyNewsSummaryIfNeeded(raw: string | undefined, lead: Lead): string {
  const t = (raw ?? "").trim();
  if (!t) return defaultRecentNewsInsight(lead);
  const low = t.toLowerCase();
  if (
    low.includes("no live web") ||
    /\blive web access\b/.test(low) ||
    /\bweb access\b/.test(low) ||
    low.includes("without live") ||
    low.includes("cannot browse") ||
    low.includes("can't browse") ||
    low.includes("unable to browse") ||
    low.includes("no browsing") ||
    low.includes("do not infer press") ||
    low.includes("do not infer funding") ||
    low.includes("cannot search") ||
    low.includes("can't search") ||
    (low.includes("not available") && (low.includes("web") || low.includes("access") || low.includes("online"))) ||
    (low.includes("unable to") && low.includes("verify") && low.includes("public"))
  ) {
    return defaultRecentNewsInsight(lead);
  }
  return t;
}

/**
 * Schema-valid research when the model fails — reads like a strong SDR scratch note, not a system error.
 */
export function buildFallbackResearchOutput(lead: Lead, reason: string): ResearchOutput {
  const company = (lead.company || "this account").trim();
  const first = (lead.name || "Contact").split(/\s+/)[0] || "Contact";
  const icp = estimateIcpFromLead(lead);
  const draft = {
    icp_fit_score: icp,
    reasoning_steps: [
      "Step 1 — Lock identity + role mandate before you attach dollar risk to the thread.",
      "Step 2 — Pressure-test whether pain is funded or curiosity-only using one metric they already report.",
      "Step 3 — Map champion vs signer before you promise timelines or security depth.",
      "Step 4 — Keep claims tight to what the lead row supports; enrich everything else on the call.",
      `Step 5 — Trace: ${reason.slice(0, 88)}`,
      "Step 6 — Sequence proof so the first artifact passes the buyer's internal bar — not your demo script.",
    ],
    industry_inference: `${company}: steer sector and stack questions from ${first}'s title first, then tighten sub-vertical once live context lands.`,
    recent_news_or_funding_summary: defaultRecentNewsInsight(lead),
    bant_assessment: bantBlockForLead(lead),
    company_size_inference: {
      segment: "smb" as const,
      employee_band_guess:
        "Headcount isn't on the lead — ask whether they're closer to dozens or hundreds of seats.",
      rationale: "Confirm scale on discovery; the lead row alone doesn't carry firmographics.",
    },
    tech_stack_hints: [
      "Ask which systems own pipeline and customer data today.",
      "Confirm who runs security review if production data is in scope.",
    ],
    icp_fit_summary: `${company}: compare to lookalikes on speed to proof and who can reallocate budget. Strong lanes show a named owner for the problem; weak lanes stall on procurement theater without a signer. Landmines: vague innovation budgets, single-threaded champions, pilots without a scoreboard. On call one: who owns the number, what broke last time they tried a shortcut, and what calendar event forces a decision.`,
    key_stakeholders: [
      `${lead.name} — inbound or targeted contact; map influence vs signing authority.`,
      "Economic buyer — identify title and procurement path on discovery.",
      "Operations / IT — likely involved if rollout touches workflows or data.",
    ],
    pain_points: [
      "Throughput or margin pressure common for the role — confirm with one metric they already report.",
      "Tooling or handoff friction between teams — validate whether it is a top-3 initiative.",
      "Reporting or forecasting drag — ask what breaks first when volume spikes.",
    ],
    messaging_angles: [
      `Which operational metric moves first if ${company} fixes the leak ${first} cares about this quarter?`,
      `When ${company} adds pipeline without headcount, where does quality or speed drop first — and who owns the patch?`,
      `If spend froze for ninety days, what internal signal would still force ${company} to revisit this category?`,
    ],
    executive_summary: `${first} at ${company}: lead with one falsifiable hypothesis about how they monetize or deliver — not category boilerplate. Biggest swing factor: top-three initiative vs backlog filler. Ask what proof bar clears a pilot, and what would park the thread past this half.`,
  };
  return researchOutputSchema.parse(draft);
}

export function buildFallbackOutreachDraft(
  lead: Lead,
  errorHint: string,
  senderSignoffName?: string,
): OutreachDraft {
  const company = (lead.company || "your team").trim();
  const rawFirst = (lead.name || "there").split(/\s+/)[0] || "there";
  const first = rawFirst.replace(/^[^a-zA-ZÀ-ÿ]+/u, "").replace(/[^a-zA-ZÀ-ÿ'-].*$/u, "") || "there";
  const signer = resolveOutreachSignoffName(senderSignoffName);
  const noteHook = lead.notes?.trim().slice(0, 200);
  const mid = noteHook
    ? `Something in your notes stuck with me — ${noteHook.replace(/"/g, "'").slice(0, 118)}. If that's still a live thing at ${company}, I'd love to put something useful in front of whoever actually runs with it. If it's old news, say so and I'll vanish.`
    : `I have a quiet hunch ${company} still has someone who cares about pipeline turning into cash without extra mess. If I'm off, one word is plenty. If I'm close, a name keeps me from bothering the wrong person.`;
  const rawBody = `<p>Hi ${first},</p><p>${mid}</p><p>Reply however thin works — a name, one word, or "not us" and I'm gone.</p>`;
  const draft = {
    subject: `${first}, quick thought on ${company.split(/\s+/).slice(0, 2).join(" ")}`,
    email_body: normalizeOutreachEmailHtml(rawBody, {
      firstName: first,
      signOffName: signer,
    }),
    linkedin_message:
      `${first} — hey — at ${company.slice(0, 22)} still you for rev/handoff, or who should I ask?`.slice(
        0,
        300,
      ),
    personalization_hooks: [
      `${lead.name} @ ${company}`,
      noteHook ? `Notes: ${noteHook.slice(0, 100)}` : "No notes — open with role + company tension only",
      "Rerun campaign with LLM path for research-tied hooks",
    ],
    primary_angle: "Blunt relevance filter + routing; zero corporate hedging.",
    cta_strategy: "One-tap correction or name-the-owner.",
    linkedin_rationale: "Parallel: ownership check, not email repeat.",
  };
  void errorHint;
  return outreachDraftSchema.parse(draft);
}

export function buildFallbackNurtureOutput(lead: Lead, reason: string): NurtureOutput {
  void reason;
  const company = (lead.company || "this account").trim();
  const draft = {
    sequence_summary: `Three-touch arc for ${company}: sharpen the wedge with one confirmable fact, ship a forwardable artifact that stands alone, then offer a bounded choice or a clean exit. Rotate channel shape so the thread feels human, not templated.`,
    follow_up_sequences: [
      {
        day_offset: 4,
        channel: "email" as const,
        summary: `Reply in-thread: add one observation specific to ${company}'s motion, then ask which of two priorities is louder this month (A vs B) so they can answer in four words.`,
        value_add_idea: "Bullet framework: current state → friction → metric they'd use to judge a fix.",
        content_asset_suggestion: "One-page: before/after workflow sketch (no pricing).",
        timing_rationale: "Four days keeps momentum without same-day pressure.",
      },
      {
        day_offset: 11,
        channel: "linkedin" as const,
        summary: `DM: reference the email thread obliquely; share one anonymized benchmark pattern and ask if ${company} is seeing the same pattern or an exception.`,
        value_add_idea: "Offer to send the benchmark source link async — low friction.",
        content_asset_suggestion: "Short Loom or static graphic — under 60s voice.",
        timing_rationale: "Second surface after email reduces single-channel fatigue.",
      },
      {
        day_offset: 22,
        channel: "call" as const,
        summary:
          "Single voicemail + one dial window: restate outcome hypothesis in 12 seconds; offer two concrete times; if no connect, park 45 days unless they engage digitally.",
        value_add_idea: "Voicemail script tied to their stated objection from qual, not product features.",
        content_asset_suggestion: "Internal battlecard: three questions + red-flag answers.",
        timing_rationale: "Three weeks respects two async touches before voice.",
      },
    ],
  };
  return nurtureOutputSchema.parse(draft);
}
