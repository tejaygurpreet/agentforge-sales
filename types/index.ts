import type { LeadEnrichmentPayload, LeadFormInput, SequenceStep } from "@/agents/types";

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
  /** Prompt 91b — when thread matches a scored persisted campaign. */
  lead_priority_tier?: LeadPriorityTier | null;
  lead_priority_score?: number | null;
  /** Prompt 93 — from `getDashboardAnalytics` merge on workspace home. */
  deal_close_probability?: number | null;
  deal_confidence?: "low" | "medium" | "high" | null;
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
  /** Prompt 82 — from persisted snapshot (`results.lead_enrichment_preview`). */
  enriched_data?: LeadEnrichmentPayload | null;
  /** Prompt 90 — experiment grouping when row is part of an A/B run. */
  ab_test_id?: string | null;
  ab_variant?: "A" | "B" | null;
  /** Prompt 91b — cached json `{ icp_fit, intent_signals, reply_probability, deal_value_potential, composite, tier }`. */
  lead_score?: Record<string, unknown> | null;
  /** Prompt 91b — short priority rationale. */
  priority_reason?: string | null;
  /** Prompt 92 — cached pipeline qualification 0–100 (optional column). */
  qualification_score?: number | null;
  /** Prompt 92 — jsonb array of `{ source, text, patterns, coach_headline? }` from qualification. */
  detected_objections?: unknown;
  /** Prompt 93 — estimated win likelihood 0–100 (optional column). */
  close_probability?: number | null;
  /** Prompt 93 — json `{ engine_version, confidence, factors, suggested_actions }`. */
  qualification_factors?: unknown;
  /** Prompt 94 — optimizer status label when column exists. */
  optimization_status?: string | null;
  /** Prompt 94 — json metrics mirror (`CampaignPerformanceMetrics`). */
  performance_metrics?: Record<string, unknown> | null;
  /** Prompt 95 — optional persisted recommendation snapshot when column exists. */
  sequence_recommendation?: Record<string, unknown> | null;
  /** Prompt 98 — AI proposal generation state when column exists. */
  proposal_status?: string | null;
  /** Prompt 98 — public URL to last generated proposal PDF when column exists. */
  generated_proposal_url?: string | null;
  /** Prompt 100 — demo pipeline state when column exists. */
  demo_status?: string | null;
  /** Prompt 100 — structured demo script JSON when column exists. */
  demo_script?: Record<string, unknown> | null;
  /** Prompt 100 — booking + recorded outcomes for playbook tuning when column exists. */
  demo_outcome?: Record<string, unknown> | null;
}

/** Prompt 97 — `public.playbooks` row. */
export interface PlaybookRow {
  id: string;
  workspace_id: string;
  thread_id: string | null;
  lead_name: string;
  company: string;
  title: string;
  playbook_body: Record<string, unknown>;
  created_at: string;
}

/** Prompt 97 — `public.knowledge_base_entries` row. */
export interface KnowledgeBaseEntryRow {
  id: string;
  entry_type: string;
  title: string;
  body: string;
  tags: string[];
  source_thread_id: string | null;
  created_at: string;
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

/** Prompt 83 — `call_transcripts` for Objection Library (workspace-scoped). */
export type CallTranscriptRow = {
  id: string;
  created_at: string;
  thread_id: string;
  twilio_call_sid: string;
  transcript: string;
  sentiment: string | null;
  summary: string | null;
  objections: unknown;
  insights: unknown;
  recording_duration_sec: number | null;
};

/** Prompt 83 — aggregated objections from transcribed calls. */
export type ObjectionLibraryEntryRow = {
  id: string;
  objection_text: string;
  use_count: number;
  last_seen_at: string;
  normalized_key: string;
};

export type DashboardStrengthBucket = {
  label: string;
  count: number;
  /** 0–100 share of campaigns in bucket (for simple bar UI). */
  pct: number;
};

/** Prompt 91b — smart lead priority (workspace leaderboard). */
export type LeadPriorityTier = "critical" | "high" | "medium" | "low";

export type LeadPriorityLeaderboardRow = {
  thread_id: string;
  lead_name: string;
  company: string;
  email: string;
  completed_at: string | null;
  composite_score: number;
  priority_tier: LeadPriorityTier;
  tier_label: string;
  dimensions: {
    icp_fit: number;
    intent_signals: number;
    reply_probability: number;
    deal_value_potential: number;
  };
  /** Template “AI-style” queue rationale (deterministic from signals). */
  ai_recommendation: string;
};

/** Prompt 92 — per-lead qualification display (snapshot + live reply interest). */
export type QualificationInsightRow = {
  thread_id: string;
  lead_name: string;
  company: string;
  qualification_base: number | null;
  qualification_refined: number | null;
  next_best_action: string | null;
  completed_at: string | null;
};

/** Prompt 92 — recent reply with heuristic objection patterns + suggested copy. */
export type ReplyObjectionCardRow = {
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

/** Prompt 93 — deal close engine row (analytics + campaign merge). */
export type DealCloseQualificationRow = {
  thread_id: string;
  lead_name: string;
  company: string;
  close_probability: number;
  confidence: "low" | "medium" | "high";
  factors: { key: string; label: string; impact: number; detail: string }[];
  suggested_actions: string[];
  completed_at: string | null;
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
/** Prompt 85 — one A/B pair (variant A vs B) for analytics. Prompt 90 — batch + auto-winner. */
export type AbTestComparisonRow = {
  ab_test_id: string;
  lead_name: string;
  completed_at: string;
  /** Prompt 90 — multiple lead pairs under one experiment id. */
  is_batch?: boolean;
  batch_pair_count?: number;
  variantA: {
    thread_id: string;
    composite: number;
    qual: number | null;
    icp: number | null;
    voice_label: string;
  };
  variantB: {
    thread_id: string;
    composite: number;
    qual: number | null;
    icp: number | null;
    voice_label: string;
  };
  /** Prompt 90 — auto-optimization layer */
  optimization_score_a?: number;
  optimization_score_b?: number;
  winner_variant?: "A" | "B" | "tie" | null;
  winner_recommendation?: string;
  reply_interest_a?: number | null;
  reply_interest_b?: number | null;
  meeting_signal_a?: number;
  meeting_signal_b?: number;
};

/** Prompt 90 — row from `ab_tests` registry. */
export type AbTestExperimentRow = {
  id: string;
  name: string;
  status: string;
  experiment_type: string;
  winner_variant: string | null;
  winner_reason: string | null;
  metrics_summary: Record<string, unknown> | null;
  created_at: string;
};

/** Prompt 87 — weekly bucket for weighted pipeline trend chart. */
export type ForecastTrendPoint = {
  weekStart: string;
  label: string;
  weightedPipelineUsd: number;
  dealCount: number;
};

/** Prompt 94 — per-campaign optimizer row for dashboard feed (derived from snapshots + replies). */
export type DashboardOptimizerRow = {
  thread_id: string;
  lead_name: string;
  company: string;
  optimization_status: string;
  composite_health: number | null;
  auto_pause_suggested: boolean;
  top_recommendations: string[];
  suggested_variant: "A" | "B" | null;
  evaluated_at: string | null;
};

/** Prompt 101 — deterministic coaching snapshot derived in `getDashboardAnalytics`. */
export type CoachingPreviewDTO = {
  voiceStats: { voice: string; avgComposite: number; runs: number }[];
  strengths: string[];
  weaknesses: string[];
  momentum: "up" | "flat" | "down" | "unknown";
};

/** Prompt 101 — full coaching payload (preview + cached AI + prefs). */
export type SalesCoachingPayloadDTO = {
  preview: CoachingPreviewDTO | null;
  ai: {
    personalized_tips: string[];
    focus_areas: string[];
    voice_tips: { voice: string; tip: string }[];
    sequence_tips: string[];
    team_insight: string | null;
  } | null;
  cachedAt: string | null;
  weeklyEmailEnabled: boolean;
  performanceMetrics: Record<string, unknown> | null;
};

/** Prompt 102 — deterministic SDR Manager KPIs (server + client). */
export type ExecutiveMetricsDTO = {
  weightedPipelineUsd: number;
  totalPipelineUsd: number;
  estimatedRoiMultiple: number;
  productivityIndex: number;
  campaignVolume: number;
  replyCoveragePct: number;
  teamMembers: number;
  avgComposite: number | null;
  forecastWinRate: number | null;
};

/** Prompt 102 — one health row for integrations & deliverability. */
export type SdrManagerHealthCheckItem = {
  id: string;
  label: string;
  status: "ok" | "warn" | "critical";
  detail: string;
};

/** Prompt 102 — scored system health for executives. */
export type SystemHealthStatusDTO = {
  overall: "healthy" | "degraded" | "attention";
  score: number;
  checks: SdrManagerHealthCheckItem[];
  updatedAt: string;
};

/** Prompt 102 — SDR Manager tab payload (cached report in `profiles.executive_metrics`). */
export type SdrManagerPayloadDTO = {
  metrics: ExecutiveMetricsDTO;
  health: SystemHealthStatusDTO;
  cachedExecutiveReportMarkdown: string | null;
  cachedReportAt: string | null;
  aiRecommendations: string[];
};

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
  /** Prompt 85 — completed A/B pairs with side-by-side scores. */
  abTestComparisons: AbTestComparisonRow[];
  /** Prompt 87 — Σ (predicted_revenue × win_probability/100). */
  forecastWeightedPipelineUsd: number;
  /** Prompt 87 — Σ predicted_revenue (unweighted). */
  forecastTotalPipelineUsd: number;
  /** Prompt 87 — mean win probability across deals with snapshots. */
  forecastAvgWinProbability: number | null;
  /** Prompt 87 — same as campaignCount when forecasts computed. */
  forecastDealCount: number;
  /** Prompt 87 — last weeks weighted pipeline. */
  forecastTrend: ForecastTrendPoint[];
  /** Prompt 91b — scored leads for prioritization (from saved campaigns + replies). */
  leadPriorityLeaderboard: LeadPriorityLeaderboardRow[];
  /** Prompt 91b — one-line “contact first” hint from top ranks. */
  leadPrioritySummary: string | null;
  /** Prompt 92 — qualification score + next action per saved campaign (reply-aware). */
  qualificationInsights: QualificationInsightRow[];
  /** Prompt 92 — recent analyzed replies with objection coach snippets. */
  replyObjectionCards: ReplyObjectionCardRow[];
  /** Prompt 93 — deal close probability rows (reply-aware, workspace history–calibrated). */
  dealCloseQualifications: DealCloseQualificationRow[];
  /** Prompt 93 — mean close % across scored deals in analytics window. */
  avgCloseProbability: number | null;
  /** Prompt 94 — live optimizer feed (lowest health first). */
  optimizerFeed: DashboardOptimizerRow[];
  /** Prompt 101 — real-time deterministic coaching signals (voice, momentum, strengths). */
  coachingPreview: CoachingPreviewDTO | null;
};

/** Prompt 85 — workspace template library row. */
export type CampaignTemplateRow = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  payload: Record<string, unknown>;
};

/** Prompt 89 — whether OAuth calendar write access is linked for the signed-in user. */
export type CalendarConnectionStatusDTO = {
  google: boolean;
  microsoft: boolean;
};

/** Prompt 88 — saved multi-channel sequence (workspace-scoped). */
export type CampaignSequenceRow = {
  id: string;
  name: string;
  steps: SequenceStep[];
  created_at: string;
  updated_at: string;
};

/** Prompt 86 — advanced report + scheduled email filters (JSON on `scheduled_reports`). */
export type ReportFiltersPayload = {
  dateFrom: string | null;
  dateTo: string | null;
  voice: string;
  memberUserId: string;
};

/** Prompt 86 — `scheduled_reports` row for dashboard + cron. */
export type ScheduledReportRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  recipient_email: string;
  cadence: "daily" | "weekly";
  hour_utc: number;
  weekday_utc: number | null;
  filters: Record<string, unknown>;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
};

/** Prompt 80 — warm-up chart + prefs for Deliverability tab. */
export type DeliverabilityWarmupLogDTO = {
  log_date: string;
  emails_sent: number;
  inbox_placement_score: number;
};

/** Prompt 100 — AI-generated personalized demo run-of-show (stored in `campaigns.demo_script`). */
export type PersonalizedDemoScriptDTO = {
  title: string;
  opening: string;
  agenda: string[];
  discovery_questions: string[];
  proof_points: string[];
  closing: string;
  invite_email_paragraph: string;
  booking_cta: string;
};

/** Prompt 99 — AI deliverability coach (warm-up progress, placement prediction, tips). */
export type DeliverabilityCoachInsightsDTO = {
  healthScore: number;
  placementPrediction: number;
  warmupProgressPct: number;
  suggestedSendWindows: string[];
  quickTips: string[];
  inboxPlacementLabel: string;
};

export type DeliverabilitySuitePayload = {
  warmupEnabled: boolean;
  logs14d: DeliverabilityWarmupLogDTO[];
  emailsSentLast7Days: number;
  avgPlacementLast7d: number | null;
  todayEmails: number;
  todayPlacement: number | null;
  /** Prompt 99 — composite health + coaching tips (deterministic + optional cached AI). */
  coach: DeliverabilityCoachInsightsDTO;
  /** Prompt 99 — when AI coach JSON was last merged (ISO), if known. */
  cachedCoachAt: string | null;
  /** Prompt 99 — suggested next log window (ISO UTC), informational. */
  nextSuggestedSendAt: string | null;
};
