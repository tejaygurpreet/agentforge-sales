import "server-only";

import type { CampaignClientSnapshot } from "@/agents/types";
import { z } from "zod";
import { invokeWithGroqRateLimitResilience } from "@/lib/agent-model";
import {
  type ProposalQuotePdfInput,
  renderProposalQuotePdfBytes,
} from "@/lib/campaign-pdf";
import { DEFAULT_BRAND_DISPLAY_NAME } from "@/lib/brand-prompt";
import { computeForecastFromSnapshot } from "@/lib/forecast";

const PROPOSAL_TEMPERATURE = 0.32;

const proposalLlmSchema = z
  .object({
    title: z.string().optional(),
    cover_subtitle: z.string().optional(),
    value_proposition: z.string().optional(),
    pricing_summary: z.string().optional(),
    line_items: z
      .array(
        z.object({
          label: z.string().optional(),
          amount_usd: z.number().optional(),
          detail: z.string().optional(),
        }),
      )
      .optional(),
    roi_section: z.string().optional(),
    roi_highlight: z.string().optional(),
    assumptions: z.array(z.string()).optional(),
    next_steps: z.array(z.string()).optional(),
    payment_terms: z.string().optional(),
    valid_until_iso: z.string().optional(),
    legal_disclaimer: z.string().optional(),
  })
  .passthrough();

export { isProposalEligible } from "@/lib/proposal-eligibility";

function clampMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(9_999_999, Math.max(0, n)));
}

function defaultLineItems(fc: { predictedRevenueUsd: number }): ProposalQuotePdfInput["line_items"] {
  const acv = clampMoney(fc.predictedRevenueUsd);
  const impl = clampMoney(Math.round(acv * 0.12));
  const success = clampMoney(Math.round(acv * 0.18));
  return [
    {
      label: "Annual platform (estimate)",
      amount_usd: Math.max(acv, 12_000),
      detail:
        "Scope-aligned estimate from campaign signals — finalize after discovery on seats, integrations, and success criteria.",
    },
    {
      label: "Implementation & enablement",
      amount_usd: Math.max(impl, 4_800),
      detail: "Kickoff, workflow mapping, admin training, and rollout checkpoints.",
    },
    {
      label: "Customer success (year 1)",
      amount_usd: Math.max(success, 6_000),
      detail: "Quarterly business reviews, adoption metrics, and expansion planning.",
    },
  ];
}

export function buildDeterministicProposalPdfInput(
  snapshot: CampaignClientSnapshot,
  brandDisplayName?: string | null,
): ProposalQuotePdfInput {
  const org = brandDisplayName?.trim() || DEFAULT_BRAND_DISPLAY_NAME;
  const fc = computeForecastFromSnapshot(snapshot);
  const r = snapshot.research_output;
  const q = snapshot.qualification_detail;
  const company = snapshot.lead.company?.trim() || "Your team";
  const contact = snapshot.lead.name?.trim() || "Team";
  const vp = [
    r?.executive_summary?.slice(0, 900) ||
      "We propose a focused rollout that ties software to measurable revenue and operational outcomes your team already tracks.",
    r?.messaging_angles?.[0]
      ? `Primary angle to test: ${r.messaging_angles[0].slice(0, 280)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const items = defaultLineItems(fc);
  const total = items.reduce((s, x) => s + x.amount_usd, 0);
  const roiPct = Math.round(Math.min(85, Math.max(8, fc.winProbability * 0.35 + 12)));

  const nba =
    q?.next_best_action?.trim() ||
    "Schedule a working session with data access to validate scope, success metrics, and procurement path.";

  return {
    org_line: org,
    title: `Commercial proposal — ${company}`,
    cover_subtitle:
      "Personalized scope, investment outline, and ROI framing based on your latest campaign intelligence.",
    company,
    contact_name: contact,
    value_proposition: vp.slice(0, 3500),
    pricing_summary: `Indicative first-year investment near ${total.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} before discounts, credits, or multi-year agreements. Final pricing follows a short discovery on users, integrations, and support tier.`,
    line_items: items,
    roi_section: `Using internal forecast signals (win probability ~${fc.winProbability}% and blended campaign strength), we model payback driven by pipeline lift and operational efficiency — not guaranteed outcomes. Replace placeholders with your finance-approved assumptions before circulation.`,
    roi_highlight: `Illustrative ROI: ~${roiPct}% annualized efficiency lift vs baseline when goals align with discovery (non-binding).`,
    assumptions: [
      "Economic buyer participates in a 60-minute scoping session within 3 weeks.",
      "Baseline metrics for ROI are agreed in writing before contract signature.",
      "No material change in stack or headcount during pilot window.",
    ],
    next_steps: [
      nba.slice(0, 420),
      "Confirm security / legal reviewers and target signature date.",
      "Align on pilot success metrics and executive readout format.",
    ],
    payment_terms:
      "Net 30 on annual agreements; quarterly true-ups available for seat growth. Pilot options may include reduced platform fee with success milestone.",
    valid_until: new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10),
    disclaimer:
      "This document is for discussion only and does not constitute a binding offer. Pricing, scope, and terms require mutual written agreement. ROI figures are illustrative.",
    thread_id: snapshot.thread_id,
    exported_at: new Date().toISOString(),
  };
}

export async function generateProposalPdfInputWithAi(
  snapshot: CampaignClientSnapshot,
  brandDisplayName?: string | null,
): Promise<ProposalQuotePdfInput> {
  const base = buildDeterministicProposalPdfInput(snapshot, brandDisplayName);
  const fc = computeForecastFromSnapshot(snapshot);
  const ctx = {
    forecast: fc,
    lead: snapshot.lead,
    research_excerpt: snapshot.research_output?.executive_summary?.slice(0, 1500) ?? "",
    qual_summary: snapshot.qualification_detail?.bant_summary?.slice(0, 1200) ?? "",
    objections:
      snapshot.qualification_detail?.top_objections?.slice(0, 4).map((o) => o.objection) ?? [],
    next_best: snapshot.qualification_detail?.next_best_action?.slice(0, 800) ?? "",
  };

  const system = `You are a senior SaaS sales strategist. Output ONE JSON object only. No markdown.
Build a commercial proposal outline: value prop, pricing line items (USD), ROI narrative (honest, non-guaranteed), next steps.
Ground content in INPUT — do not invent customer names, logos, or signed contracts. Keep amounts plausible for mid-market B2B.`;

  const human = `INPUT:\n${JSON.stringify(ctx).slice(0, 24_000)}\n\nReturn JSON with: title, cover_subtitle, value_proposition, pricing_summary, line_items[{label, amount_usd, detail}], roi_section, roi_highlight, assumptions[], next_steps[], payment_terms, valid_until_iso (YYYY-MM-DD), legal_disclaimer.`;

  try {
    const { value: raw } = await invokeWithGroqRateLimitResilience(
      "proposal_generator",
      PROPOSAL_TEMPERATURE,
      (m) =>
        m.withStructuredOutput(proposalLlmSchema, { name: "proposal_quote" }).invoke(`${system}\n\n---\n${human}`),
    );
    const lax = proposalLlmSchema.safeParse(raw);
    if (!lax.success) return base;

    const o = lax.data;
    const items =
      o.line_items
        ?.map((row) => ({
          label: `${row.label ?? "Line item"}`.slice(0, 120),
          amount_usd: clampMoney(typeof row.amount_usd === "number" ? row.amount_usd : 0),
          detail: `${row.detail ?? ""}`.slice(0, 600),
        }))
        .filter((r) => r.amount_usd > 0 || r.label.length > 2) ?? base.line_items;
    const line_items = items.length > 0 ? items : base.line_items;

    const merged: ProposalQuotePdfInput = {
      ...base,
      title: o.title?.trim()?.slice(0, 200) || base.title,
      cover_subtitle: o.cover_subtitle?.trim()?.slice(0, 400) || base.cover_subtitle,
      value_proposition: o.value_proposition?.trim()?.slice(0, 4000) || base.value_proposition,
      pricing_summary: o.pricing_summary?.trim()?.slice(0, 2000) || base.pricing_summary,
      line_items,
      roi_section: o.roi_section?.trim()?.slice(0, 3500) || base.roi_section,
      roi_highlight: o.roi_highlight?.trim()?.slice(0, 800) || base.roi_highlight,
      assumptions:
        o.assumptions?.filter((s) => s.trim().length > 4).slice(0, 10) || base.assumptions,
      next_steps: o.next_steps?.filter((s) => s.trim().length > 4).slice(0, 10) || base.next_steps,
      payment_terms: o.payment_terms?.trim()?.slice(0, 1200) || base.payment_terms,
      valid_until: o.valid_until_iso?.trim()?.slice(0, 10) || base.valid_until,
      disclaimer: o.legal_disclaimer?.trim()?.slice(0, 2000) || base.disclaimer,
    };
    return merged;
  } catch {
    return base;
  }
}

export function renderProposalPdfBytes(
  input: ProposalQuotePdfInput,
): Uint8Array {
  return renderProposalQuotePdfBytes(input);
}
