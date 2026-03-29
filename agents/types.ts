import { z } from "zod";

export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "nurtured"
  | "closed";

/** Prompt 40 — SDR voice steers outreach subjects, email/LinkedIn tone, nurture language, qual hint. */
export const SDR_VOICE_TONE_VALUES = [
  "default",
  "consultative_enterprise",
  "warm_relationship_builder",
  "bold_challenger",
  "data_driven_analyst",
] as const;

export type SdrVoiceTone = (typeof SDR_VOICE_TONE_VALUES)[number];

/** Prompt 78 — user-authored voice loaded from `custom_voices` and passed through the graph. */
export interface CustomVoiceProfile {
  id: string;
  name: string;
  description: string;
  /** 2–3 example lines the model should emulate in rhythm (not copy). */
  examples: string[];
  tone_instructions: string;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  company: string;
  /** E.164 when set — used for Twilio dial / voicemail drop (Prompt 77). */
  phone?: string;
  linkedin_url?: string;
  status: LeadStatus;
  notes?: string;
  sdr_voice_tone?: SdrVoiceTone;
  /** When set, pipeline uses `CustomVoiceProfile` instead of preset-only instructions (Prompt 78). */
  custom_voice_id?: string;
  /** Denormalized for dashboard labels / exports when a custom voice is selected. */
  custom_voice_name?: string;
}

export type AgentMessageRole = "human" | "ai";

export interface AgentMessage {
  role: AgentMessageRole;
  content: string;
}

export type CampaignFinalStatus =
  | "running"
  | "completed"
  | "completed_with_errors"
  | "failed";

/**
 * Serializable graph state. Channel names must not match LangGraph node ids.
 */
export interface AgentState {
  lead: Lead;
  messages: AgentMessage[];
  current_agent: string;
  thread_id: string;
  user_id: string;
  research_output?: ResearchOutput;
  outreach_output?: OutreachOutput;
  qualification_score?: number;
  qualification_detail?: QualificationAgentResult;
  nurture_output?: NurtureOutput;
  final_status?: CampaignFinalStatus;
  pipeline_error?: string;
  /** Per-node payloads for UI and debugging */
  results?: Record<string, unknown>;
}

export const leadFormSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "Name is required"),
  email: z.string().email(),
  company: z.string().min(1, "Company is required"),
  linkedin_url: z
    .union([z.string().url(), z.literal("")])
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  /** Optional E.164 (+15551234567) — Twilio outbound dial. */
  phone: z
    .union([z.string(), z.literal("")])
    .optional()
    .transform((v) => (v === undefined || v === "" ? undefined : v.trim())),
  notes: z.string().optional(),
  status: z
    .enum(["new", "contacted", "qualified", "nurtured", "closed"])
    .default("new"),
  sdr_voice_tone: z.enum(SDR_VOICE_TONE_VALUES).default("default"),
  custom_voice_id: z
    .union([z.string().uuid(), z.literal("")])
    .optional()
    .transform((v) => (v === undefined || v === "" ? undefined : v)),
  /** Set when re-running from snapshot — not a form field. */
  custom_voice_name: z.string().optional(),
});

export type LeadFormInput = z.input<typeof leadFormSchema>;
export type LeadFormValues = z.output<typeof leadFormSchema>;

export const bantSignalSchema = z.object({
  evidence: z.string(),
  confidence: z.enum(["none", "low", "medium", "high"]),
  notes: z.string(),
});

export type BantSignal = z.infer<typeof bantSignalSchema>;

export const bantAssessmentSchema = z.object({
  budget: bantSignalSchema,
  authority: bantSignalSchema,
  need: bantSignalSchema,
  timeline: bantSignalSchema,
});

export type BantAssessment = z.infer<typeof bantAssessmentSchema>;

export const researchOutputSchema = z.object({
  /** 0–100 holistic ICP match for outbound SaaS motion. */
  icp_fit_score: z.number().min(0).max(100),
  /** Private chain-of-thought steps; keep concise. Not shown to the lead. Prompt 69: elite 6–8 step trace. */
  reasoning_steps: z.array(z.string()).min(6).max(8),
  /** Sector + sub-vertical; hedge uncertainty in natural prose (no "(inferred)" tags in strings). */
  industry_inference: z.string(),
  /**
   * Public facts when justified by the lead; otherwise a sharp read on timing and strategic focus
   * in plain language — never a "no web access" disclaimer (Prompt 27).
   */
  recent_news_or_funding_summary: z.string(),
  bant_assessment: bantAssessmentSchema,
  /** Satisfies schema / graph state; not surfaced in dashboard or exports (Prompt 49). */
  company_size_inference: z.object({
    segment: z.enum([
      "micro",
      "smb",
      "mid_market",
      "enterprise",
      "unknown",
    ]),
    employee_band_guess: z.string(),
    rationale: z.string(),
  }),
  /** Inferred tools / categories — label thin signals. */
  tech_stack_hints: z.array(z.string()).min(2).max(10),
  icp_fit_summary: z.string(),
  key_stakeholders: z.array(z.string()).min(2).max(8),
  pain_points: z.array(z.string()).min(2).max(8),
  /** Exactly three distinct, high-signal outbound hooks. */
  messaging_angles: z.array(z.string()).length(3),
  executive_summary: z.string(),
});

export type ResearchOutput = z.infer<typeof researchOutputSchema>;

/**
 * Lenient schema for `withStructuredOutput` — avoids Groq tool validation flakes when the model
 * drops `industry_inference` or other keys. Canonical shape is enforced by `normalizeResearchLlmToCanonical`.
 */
export const researchOutputLlmSchema = z
  .object({
    icp_fit_score: z.union([z.number(), z.string()]).optional(),
    reasoning_steps: z.array(z.string()).optional(),
    industry_inference: z.string().optional(),
    recent_news_or_funding_summary: z.string().optional(),
    bant_assessment: z.unknown().optional(),
    company_size_inference: z.unknown().optional(),
    tech_stack_hints: z.array(z.string()).optional(),
    icp_fit_summary: z.string().optional(),
    key_stakeholders: z.array(z.string()).optional(),
    pain_points: z.array(z.string()).optional(),
    messaging_angles: z.array(z.string()).optional(),
    executive_summary: z.string().optional(),
  })
  .passthrough();

export type ResearchOutputLlmShape = z.infer<typeof researchOutputLlmSchema>;

export const outreachDraftSchema = z.object({
  subject: z.string(),
  /** Full email body as HTML (ready for ESP). */
  email_body: z.string(),
  linkedin_message: z.string(),
  /** Plain text, ~25–45s spoken — Twilio Say + Amazon Polly (Prompt 77). */
  voicemail_script: z.string().max(600).optional(),
  personalization_hooks: z.array(z.string()).min(2).max(6),
  primary_angle: z.string(),
  cta_strategy: z.string(),
  linkedin_rationale: z.string(),
});

export type OutreachDraft = z.infer<typeof outreachDraftSchema>;

export const outreachOutputSchema = outreachDraftSchema.extend({
  email_sent: z.boolean(),
  send_error: z.string().optional(),
  /** Prompt 73 — `ready_to_send` until the user sends from the dashboard. */
  resend_status: z
    .enum(["ready_to_send", "delivered", "not_sent", "failed"])
    .optional(),
});

export type OutreachOutput = z.infer<typeof outreachOutputSchema>;

export const qualificationObjectionSchema = z.object({
  /** Buyer-voice concern — specific mechanism, not a one-word label. */
  objection: z.string().min(15).max(135),
  /**
   * "Why it matters" for the rep: deal impact + what to do with this intel (UI: WHY IT MATTERS).
   */
  reasoning: z.string().min(35).max(240),
});

export type QualificationObjection = z.infer<typeof qualificationObjectionSchema>;

/**
 * Lenient schema for `withStructuredOutput` only — avoids Groq/tool validation flakes
 * when the model is one token short. Canonical shape is produced by normalization.
 */
/** Lenient mins reduce Groq "tool call validation failed" flakes; canonical shape enforced in normalization. */
export const qualificationObjectionLlmSchema = z.object({
  objection: z.string().min(3).max(170),
  reasoning: z.string().min(6).max(280),
});

/** Prompt 89 — lenient LLM shape; canonical rows validated in normalization. */
export const meetingTimeSuggestionLlmSchema = z.object({
  label: z.string().optional(),
  start_iso: z.string().optional(),
  end_iso: z.string().optional(),
  timezone_hint: z.string().optional(),
  rationale: z.string().optional(),
});

/** Prompt 89 — canonical meeting slot for UI + calendar. */
export const meetingTimeSuggestionSchema = z.object({
  label: z.string().min(2).max(80),
  start_iso: z.string().min(12).max(44),
  end_iso: z.string().min(12).max(44),
  timezone_hint: z.string().min(2).max(64),
  rationale: z.string().min(8).max(220),
});

export type MeetingTimeSuggestion = z.infer<typeof meetingTimeSuggestionSchema>;

export const qualificationAgentLlmSchema = z.object({
  score: z.number().min(0).max(100),
  /** Model may return 1–6; normalization always yields exactly 3. */
  top_objections: z.array(qualificationObjectionLlmSchema).min(1).max(6),
  bant_summary: z.string().min(4).max(4000),
  next_best_action: z.string().min(6).max(620),
  /** Prompt 89 — optional smart scheduling hints. */
  meeting_time_suggestions: z.array(meetingTimeSuggestionLlmSchema).max(6).optional(),
  response_pattern_hint: z
    .enum(["morning_preferred", "async_heavy", "evening_ok", "unknown"])
    .optional(),
});

export type QualificationAgentLlmResult = z.infer<typeof qualificationAgentLlmSchema>;

/** BANT in summary; exactly three objections after normalization. */
export const qualificationAgentSchema = z.object({
  score: z.number().min(0).max(100),
  top_objections: z.array(qualificationObjectionSchema).length(3),
  bant_summary: z.string(),
  /** Playbook-style: concrete steps, owner/artifact, or explicit pause criterion. */
  next_best_action: z.string().min(32).max(520),
  meeting_time_suggestions: z.array(meetingTimeSuggestionSchema).max(5).optional(),
  response_pattern_hint: z
    .enum(["morning_preferred", "async_heavy", "evening_ok", "unknown"])
    .optional(),
});

export type QualificationAgentResult = z.infer<typeof qualificationAgentSchema>;

export const nurtureFollowUpSchema = z.object({
  day_offset: z.number().int().min(0).max(90),
  channel: z.enum(["email", "linkedin", "call"]),
  summary: z.string(),
  value_add_idea: z.string(),
  content_asset_suggestion: z.string(),
  timing_rationale: z.string(),
});

export const nurtureOutputSchema = z.object({
  sequence_summary: z.string(),
  follow_up_sequences: z.array(nurtureFollowUpSchema).length(3),
  /** Prompt 89 — optional copy line for scheduling follow-through. */
  meeting_scheduling_hint: z.string().max(520).optional(),
  /** Prompt 89 — may echo or refine qualification slots. */
  meeting_time_suggestions: z.array(meetingTimeSuggestionSchema).max(5).optional(),
});

export type NurtureOutput = z.infer<typeof nurtureOutputSchema>;

/** Prompt 91 — optional prior reply / interest context for nurture + timing engine. */
export type ReplyFollowUpIntel = {
  interest_0_to_10: number | null;
  summary: string;
};

/** Prompt 91 — one scheduled follow-up touch with smart timing + human approval. */
export type SmartFollowUpStepPlan = {
  step_index: number;
  /** Channel produced by the nurture model. */
  model_channel: "email" | "linkedin" | "call";
  /** Channel after light heuristics (e.g. break email fatigue when interest is cold). */
  engine_recommended_channel: "email" | "linkedin" | "call";
  original_day_offset: number;
  adjusted_day_offset: number;
  /** ISO 8601 UTC suggested send instant. */
  suggested_send_at: string;
  delay_hours_from_previous: number | null;
  timing_rationale: string;
  /** 0–1 heuristic confidence for the suggested instant. */
  timing_confidence: number;
  summary: string;
  value_add_idea: string;
  content_asset_suggestion: string;
  approval_status: "pending_review" | "approved" | "skipped";
};

/** Prompt 91 — intelligent follow-up plan attached to the campaign snapshot. */
export type SmartFollowUpEngineState = {
  engine_version: "p91-v1";
  generated_at: string;
  interest_signal_0_to_10: number | null;
  qualification_score: number | null;
  reply_signals_summary: string;
  overall_rationale: string;
  steps: SmartFollowUpStepPlan[];
};

/** Prompt 70 — post-research live signals (Tavily / heuristic fallback). */
export type CampaignLiveSignalType =
  | "funding"
  | "hiring"
  | "company_update"
  | "news"
  | "other";

export interface CampaignLiveSignal {
  signal_type: CampaignLiveSignalType;
  signal_text: string;
  /** ISO timestamp when the signal was captured. */
  captured_at: string;
}

/** Prompt 82 — structured lead enrichment (Tavily / Browserless); optional and backward-compatible. */
export interface LeadEnrichmentPayload {
  enriched_at: string;
  provider: string;
  source_urls: string[];
  company_snapshot: string;
  funding_news: string;
  hiring_signals: string;
  tech_stack: string;
  intent_signals: string;
}

export interface AgentContext {
  threadId: string;
  userId: string;
}

/** Prompt 88 — multi-channel playbook step (order is display + tracking; graph pipeline unchanged). */
export type SequenceChannel = "email" | "linkedin" | "call" | "follow_up";

export interface SequenceStep {
  id: string;
  channel: SequenceChannel;
  /** Optional UI label; defaults from channel. */
  label?: string;
}

/** Attached to a run when user picked a saved sequence. */
export interface CampaignSequencePlan {
  sequence_id: string;
  name: string;
  steps: SequenceStep[];
}

/** Derived progress: channels map to pipeline milestones (outreach / qual / nurture). */
export interface SequenceRunProgress {
  steps: SequenceStep[];
  completed: boolean[];
  /** First incomplete index, or steps.length when all complete. */
  currentIndex: number;
}

/** JSON-safe payload returned to the dashboard after a campaign run. */
export interface CampaignClientSnapshot {
  lead: Lead;
  messages: AgentMessage[];
  current_agent: string;
  thread_id: string;
  user_id: string;
  research_output: ResearchOutput | null;
  outreach_output: OutreachOutput | null;
  qualification_score: number | null;
  qualification_detail: QualificationAgentResult | null;
  nurture_output: NurtureOutput | null;
  /** Prompt 91 — smart timing + approval workflow for nurture follow-ups. */
  smart_follow_up_engine?: SmartFollowUpEngineState | null;
  final_status: CampaignFinalStatus;
  pipeline_error: string | null;
  results: Record<string, unknown>;
  /** ISO timestamp when the campaign run finished (server). */
  campaign_completed_at: string | null;
  /** Prompt 70 — funding / hiring / news lines captured after research. */
  live_signals?: CampaignLiveSignal[] | null;
  /** Prompt 73 — for manual Resend send (`buildDynamicFromEmail`). */
  sender_signoff_name?: string | null;
  /** Prompt 79 — display/sign-off brand line (falls back to AgentForge Sales when unset). */
  brand_display_name?: string | null;
  /** Prompt 82 — pre-run enrichment preview (same payload persisted when `enriched_data` column exists). */
  lead_enrichment_preview?: LeadEnrichmentPayload | null;
  /** Prompt 88 — when a saved sequence was applied to this run. */
  sequence_plan?: CampaignSequencePlan | null;
  /** Prompt 88 — step completion derived from pipeline outputs. */
  sequence_progress?: SequenceRunProgress | null;
}
