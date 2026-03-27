import type { LeadFormInput } from "@/agents/types";

export type {
  AgentMessage,
  AgentState,
  Lead,
  LeadStatus,
} from "@/agents/types";

/** Serializable white-label fields for client components (Prompt 79). */
export type WhiteLabelClientSettingsDTO = {
  appName: string;
  companyName: string;
  primaryColor: string;
  secondaryColor: string;
  supportEmail: string;
  logoUrl: string;
  brandSignoff: string;
};

export type WorkspaceMemberRole = "admin" | "member" | "viewer";

export type WorkspaceMemberDTO = {
  workspace_id: string;
  user_id: string | null;
  role: WorkspaceMemberRole;
  invited_email: string | null;
  status: "active" | "pending";
  created_at: string;
  is_self: boolean;
};

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
/** Prompt 78 — `custom_voices` table row for dashboard lists. */
export interface CustomVoiceRow {
  id: string;
  name: string;
  description: string;
  examples: unknown;
  tone_instructions: string;
  created_at: string;
}

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
  /** Prompt 80 — inbox health 0–100 after outreach send (null if not recorded). */
  spam_score?: number | null;
  /** Prompt 80 — excellent | good | fair | poor */
  deliverability_status?: string | null;
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
  /** Prompt 80 — avg inbox health where `campaigns.spam_score` is set. */
  avgInboxHealthScore: number | null;
  deliverabilitySampleCount: number;
  warmupEmailsLast7Days: number;
  avgWarmupPlacementScore: number | null;
  warmupEnabled: boolean;
};

/** Prompt 80 — warm-up chart + prefs for Deliverability tab. */
export type DeliverabilityWarmupLogDTO = {
  log_date: string;
  emails_sent: number;
  inbox_placement_score: number;
};

export type DeliverabilitySuitePayload = {
  warmupEnabled: boolean;
  logs14d: DeliverabilityWarmupLogDTO[];
  emailsSentLast7Days: number;
  avgPlacementLast7d: number | null;
  todayEmails: number;
  todayPlacement: number | null;
};
