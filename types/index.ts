import type { LeadFormInput } from "@/agents/types";

export type {
  AgentMessage,
  AgentState,
  Lead,
  LeadStatus,
} from "@/agents/types";

export interface CampaignThreadRow {
  thread_id: string;
  updated_at: string;
  lead_preview?: string;
  company_preview?: string;
  current_agent?: string;
  outreach_sent?: boolean;
  /** From checkpoint `state.lead.sdr_voice_tone` when present (Prompt 43). */
  sdr_voice_label?: string | null;
}

/** Row from `public.campaigns` (persisted campaign runs). */
export interface PersistedCampaignRow {
  id: string;
  thread_id: string;
  lead_name: string;
  company: string;
  email: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  /** Human label from `results.lead.sdr_voice_tone` when snapshot exists (Prompt 41). */
  sdr_voice_label: string | null;
  /**
   * Parsed from `results.lead` when the saved snapshot includes a full lead — used to Re-run
   * without retyping (Prompt 23).
   */
  rerun_lead: LeadFormInput | null;
}

/** JSON stored in `reply_analyses.analysis` (matches ReplyAnalysisWithLabels). */
export type ProspectReplyAnalysisPayload = {
  sentiment: string;
  interest_level_0_to_10: number;
  objections_detected: string[];
  buying_signals: string[];
  suggested_next_nurture_step: string;
  suggested_voice: string;
  suggested_voice_label: string;
  rationale: string;
};

/** Row from `public.reply_analyses` (Prompt 50 + 52). */
export interface PersistedReplyAnalysisRow {
  id: string;
  created_at: string;
  thread_id: string | null;
  company: string | null;
  lead_name: string | null;
  /** Lead / campaign email when saved from a completed run (Prompt 52). */
  prospect_email: string | null;
  reply_preview: string;
  /** Full pasted text when column exists in DB (Prompt 52). */
  reply_full: string | null;
  analysis: ProspectReplyAnalysisPayload;
}

export type DashboardStrengthBucket = {
  label: string;
  count: number;
  /** 0–100 share of campaigns in bucket (for simple bar UI). */
  pct: number;
};

/** Prompt 70 — one lead in a dashboard batch run. */
export type BatchRunItem = {
  id: string;
  label: string;
  company: string;
  status: "queued" | "running" | "done" | "error";
  threadId?: string;
  error?: string;
};

/** Prompt 70 — row for analytics live feed (Supabase `campaign_signals`). */
export type LiveSignalFeedItem = {
  id: string;
  thread_id: string;
  signal_type: string;
  signal_text: string;
  created_at: string;
};

/** Aggregates for `/analytics` + main dashboard Analytics tab (Prompt 50 + 70). */
export type DashboardAnalyticsSummary = {
  campaignCount: number;
  avgCompositeScore: number | null;
  replyAnalyzedCount: number;
  avgReplyInterest: number | null;
  strengthBuckets: DashboardStrengthBucket[];
  /** Latest cross-campaign signals (Prompt 70). */
  liveSignalsFeed: LiveSignalFeedItem[];
  /** Placeholder pipeline $ for executive view (Prompt 70). */
  estimatedPipelineValueUsd: number;
  /** Placeholder ROI multiple vs tooling cost (Prompt 70). */
  estimatedRoiMultiplier: number;
};
