import { replaceLegacyNewsSummaryIfNeeded } from "@/agents/pipeline-fallbacks";
import type { CampaignClientSnapshot, CompetitorLandscape, SdrVoiceTone } from "@/agents/types";
import { DEFAULT_BRAND_DISPLAY_NAME } from "@/lib/brand-prompt";
import { computeCampaignStrength } from "@/lib/campaign-strength";
import { emailPlainTextFromHtml } from "@/lib/email-plain";
import { userFacingLeadNotes } from "@/lib/user-facing-lead-notes";

export type CampaignSummaryExport = {
  meta: {
    product: string;
    exportKind: "summary_v2";
    exportedAt: string;
  };
  run: {
    thread_id: string;
    final_status: string;
    campaign_completed_at: string | null;
  };
  campaign_strength: {
    composite: number;
    label: string;
    stepsComplete: number;
    signalCore: number;
    summary: string;
    icp: number | null;
    qual: number | null;
  };
  lead: {
    name: string;
    email: string;
    company: string;
    linkedin_url?: string | null;
    notes?: string | null;
    status?: string;
    sdr_voice_tone?: SdrVoiceTone;
  };
  research: {
    icp_fit_score: number;
    executive_summary: string;
    icp_fit_summary: string;
    industry_inference?: string;
    recent_news_or_funding_summary?: string;
    reasoning_steps: string[];
    key_stakeholders: string[];
    pain_points: string[];
    tech_stack_hints: string[];
    messaging_angles?: string[];
    bant_snapshot?: {
      budget: { confidence: string; evidence: string };
      authority: { confidence: string; evidence: string };
      need: { confidence: string; evidence: string };
      timeline: { confidence: string; evidence: string };
    };
    /** Prompt 96 — automated competitor battle cards (3–5 alternatives). */
    competitor_landscape?: CompetitorLandscape | null;
  } | null;
  outreach: {
    subject: string;
    email_plain: string;
    linkedin_message: string;
    email_sent: boolean;
    primary_angle?: string;
    cta_strategy?: string;
    linkedin_rationale?: string;
    personalization_hooks: string[];
  } | null;
  qualification: {
    score: number;
    bant_summary: string;
    top_objections: { objection: string; reasoning?: string }[];
    next_best_action: string;
  } | null;
  nurture: {
    sequence_summary: string;
    follow_up_sequences: {
      day_offset: number;
      channel: string;
      summary: string;
      value_add_idea: string;
      content_asset_suggestion: string;
      timing_rationale: string;
    }[];
  } | null;
  /** Prompt 70 — post-research live signals for PDF + exports. */
  live_signals: {
    signal_type: string;
    signal_text: string;
    captured_at: string;
  }[];
};

/** Clean JSON handoff for CRM, demos, integrations, and full PDF generation (Prompt 22). */
export function buildCampaignSummaryExport(
  snapshot: CampaignClientSnapshot,
  opts?: { productLabel?: string },
): CampaignSummaryExport {
  const productLabel =
    opts?.productLabel?.trim() ||
    snapshot.brand_display_name?.trim() ||
    DEFAULT_BRAND_DISPLAY_NAME;
  const strength = computeCampaignStrength(snapshot);
  const q = snapshot.qualification_detail;
  const r = snapshot.research_output;
  const o = snapshot.outreach_output;
  const n = snapshot.nurture_output;

  return {
    meta: {
      product: productLabel,
      exportKind: "summary_v2",
      exportedAt: new Date().toISOString(),
    },
    run: {
      thread_id: snapshot.thread_id,
      final_status: snapshot.final_status,
      campaign_completed_at: snapshot.campaign_completed_at ?? null,
    },
    campaign_strength: {
      composite: strength.composite,
      label: strength.label,
      stepsComplete: strength.stepsComplete,
      signalCore: strength.signalCore,
      summary: strength.summary,
      icp: strength.icp,
      qual: strength.qual,
    },
    lead: {
      name: snapshot.lead.name,
      email: snapshot.lead.email,
      company: snapshot.lead.company,
      linkedin_url: snapshot.lead.linkedin_url,
      /** Prompt 26: strips appended research digest + recovery lines (no duplicate Research section). */
      notes: userFacingLeadNotes(snapshot.lead.notes) || null,
      status: snapshot.lead.status,
      sdr_voice_tone: snapshot.lead.sdr_voice_tone,
    },
    research: r
      ? {
          icp_fit_score: r.icp_fit_score,
          executive_summary: r.executive_summary,
          icp_fit_summary: r.icp_fit_summary,
          industry_inference: r.industry_inference,
          recent_news_or_funding_summary: replaceLegacyNewsSummaryIfNeeded(
            r.recent_news_or_funding_summary,
            snapshot.lead,
          ),
          reasoning_steps: r.reasoning_steps,
          key_stakeholders: r.key_stakeholders,
          pain_points: r.pain_points,
          tech_stack_hints: r.tech_stack_hints,
          messaging_angles: r.messaging_angles,
          bant_snapshot: {
            budget: {
              confidence: r.bant_assessment.budget.confidence,
              evidence: r.bant_assessment.budget.evidence,
            },
            authority: {
              confidence: r.bant_assessment.authority.confidence,
              evidence: r.bant_assessment.authority.evidence,
            },
            need: {
              confidence: r.bant_assessment.need.confidence,
              evidence: r.bant_assessment.need.evidence,
            },
            timeline: {
              confidence: r.bant_assessment.timeline.confidence,
              evidence: r.bant_assessment.timeline.evidence,
            },
          },
          competitor_landscape: r.competitor_landscape ?? null,
        }
      : null,
    outreach: o
      ? {
          subject: o.subject,
          email_plain: emailPlainTextFromHtml(o.email_body ?? ""),
          linkedin_message: o.linkedin_message,
          email_sent: o.email_sent === true,
          primary_angle: o.primary_angle,
          cta_strategy: o.cta_strategy,
          linkedin_rationale: o.linkedin_rationale,
          personalization_hooks: o.personalization_hooks ?? [],
        }
      : null,
    qualification: q
      ? {
          score: q.score,
          bant_summary: q.bant_summary,
          top_objections: q.top_objections.map((row) => ({
            objection: row.objection,
            reasoning: row.reasoning,
          })),
          next_best_action: q.next_best_action,
        }
      : null,
    nurture: n
      ? {
          sequence_summary: n.sequence_summary,
          follow_up_sequences: n.follow_up_sequences.map((s) => ({
            day_offset: s.day_offset,
            channel: s.channel,
            summary: s.summary,
            value_add_idea: s.value_add_idea,
            content_asset_suggestion: s.content_asset_suggestion,
            timing_rationale: s.timing_rationale,
          })),
        }
      : null,
    live_signals: (snapshot.live_signals ?? []).map((s) => ({
      signal_type: s.signal_type,
      signal_text: s.signal_text,
      captured_at: s.captured_at,
    })),
  };
}
