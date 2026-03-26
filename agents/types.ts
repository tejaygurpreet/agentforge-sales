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

export interface Lead {
  id: string;
  name: string;
  email: string;
  company: string;
  linkedin_url?: string;
  status: LeadStatus;
  notes?: string;
  sdr_voice_tone?: SdrVoiceTone;
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
  notes: z.string().optional(),
  status: z
    .enum(["new", "contacted", "qualified", "nurtured", "closed"])
    .default("new"),
  sdr_voice_tone: z.enum(SDR_VOICE_TONE_VALUES).default("default"),
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
  personalization_hooks: z.array(z.string()).min(2).max(6),
  primary_angle: z.string(),
  cta_strategy: z.string(),
  linkedin_rationale: z.string(),
});

export type OutreachDraft = z.infer<typeof outreachDraftSchema>;

export const outreachOutputSchema = outreachDraftSchema.extend({
  email_sent: z.boolean(),
  send_error: z.string().optional(),
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

export const qualificationAgentLlmSchema = z.object({
  score: z.number().min(0).max(100),
  /** Model may return 1–6; normalization always yields exactly 3. */
  top_objections: z.array(qualificationObjectionLlmSchema).min(1).max(6),
  bant_summary: z.string().min(4).max(4000),
  next_best_action: z.string().min(6).max(620),
});

export type QualificationAgentLlmResult = z.infer<typeof qualificationAgentLlmSchema>;

/** BANT in summary; exactly three objections after normalization. */
export const qualificationAgentSchema = z.object({
  score: z.number().min(0).max(100),
  top_objections: z.array(qualificationObjectionSchema).length(3),
  bant_summary: z.string(),
  /** Playbook-style: concrete steps, owner/artifact, or explicit pause criterion. */
  next_best_action: z.string().min(32).max(520),
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
});

export type NurtureOutput = z.infer<typeof nurtureOutputSchema>;

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

export interface AgentContext {
  threadId: string;
  userId: string;
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
  final_status: CampaignFinalStatus;
  pipeline_error: string | null;
  results: Record<string, unknown>;
  /** ISO timestamp when the campaign run finished (server). */
  campaign_completed_at: string | null;
  /** Prompt 70 — funding / hiring / news lines captured after research. */
  live_signals?: CampaignLiveSignal[] | null;
}
