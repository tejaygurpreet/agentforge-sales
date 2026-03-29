"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import {
  runCampaignGraph,
  serializeCampaignStateForClient,
} from "@/agents/graph";
import { saveCampaign as persistCampaignToDatabase } from "@/lib/save-campaign";
import { deleteThreadCheckpoint, mergeDashboardState } from "@/agents/supabase-checkpointer";
import {
  type CampaignClientSnapshot,
  type CampaignSequencePlan,
  type CustomVoiceProfile,
  type Lead,
  type LeadEnrichmentPayload,
  type LeadFormInput,
  type OutreachOutput,
  SDR_VOICE_TONE_VALUES,
  type ReplyFollowUpIntel,
  type SdrVoiceTone,
  type SmartFollowUpEngineState,
} from "@/agents/types";
import { runLeadEnrichmentStep } from "@/lib/agents/research_node";
import { getServiceRoleSupabaseOrNull } from "@/lib/supabase-server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { hasLlmProviderConfigured, warnIfResendNotConfigured } from "@/lib/env";
import {
  analyzeProspectReply,
  replyAnalysisWithLabels,
  type ReplyAnalysisWithLabels,
} from "@/lib/reply-analyzer";
import {
  aggregateBatchAbOptimization,
  autoOptimizationRecommendation,
  computeAutoOptimizationScore,
  meetingSchedulingSignal,
  pickAbWinner,
  snapshotFromCampaignResults,
} from "@/lib/ab-testing";
import {
  deriveFollowUpApprovalStatus,
  nextFollowUpSendIso,
} from "@/lib/agents/nurture_node";
import {
  buildReplyObjectionCardFromRow,
  computeDisplayQualificationScore,
} from "@/lib/agents/qualification_node";
import {
  buildLeadPriorityQueueSummary,
  priorityTierLabel,
  resolveReplyInterestForLead,
  scoreLeadForPriority,
} from "@/lib/scoring";
import type {
  AbTestComparisonRow,
  AbTestExperimentRow,
  CalendarConnectionStatusDTO,
  CampaignSequenceRow,
  CampaignTemplateRow,
  CampaignThreadRow,
  CustomVoiceRow,
  DashboardAnalyticsSummary,
  DeliverabilitySuitePayload,
  ForecastTrendPoint,
  LeadPriorityLeaderboardRow,
  LiveSignalFeedItem,
  PersistedCampaignRow,
  PersistedReplyAnalysisRow,
  ProspectReplyAnalysisPayload,
  QualificationInsightRow,
  ReplyObjectionCardRow,
  ReportFiltersPayload,
  ScheduledReportRow,
  WorkspaceMemberDTO,
  WorkspaceMemberRole,
} from "@/types";
import { computeCampaignStrength } from "@/lib/campaign-strength";
import { mergeTemplatePayloadIntoLeadForm } from "@/lib/campaign-templates-merge";
import { computeForecastFromSnapshot } from "@/lib/forecast";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { withTimeout } from "@/lib/async-timeout";
import { fetchCustomVoiceProfileForUser } from "@/lib/custom-voices";
import { sdrVoiceLabel, voiceLabelForLead } from "@/lib/sdr-voice";
import { generateCampaignPdfArrayBuffer } from "@/lib/campaign-pdf";
import { syncCampaignToHubSpot } from "@/lib/hubspot";
import { buildDynamicFromEmail, sendTransactionalEmail } from "@/lib/resend";
import {
  analyzeDeliverability,
  inboxPlacementFromWarmupVolume,
  placementScoreForDailyLog,
} from "@/lib/deliverability";
import {
  buildCampaignPdfExportOptionsFromWhiteLabel,
  fetchWhiteLabelSettings,
} from "@/lib/white-label";
import {
  ensurePersonalWorkspaceMembership,
  resolveWorkspaceContext,
  type WorkspaceRole,
} from "@/lib/workspace";
import {
  notifyBatchFinishedPush,
  notifyNewReplySavedPush,
} from "@/lib/push";
import type { CallTranscriptRow, ObjectionLibraryEntryRow } from "@/types";
import {
  advanceScheduledNextRun,
  buildAggregatePdfBuffer,
  buildCsvReport,
  buildReportMetrics,
  buildScheduledReportEmailHtml,
  computeNextRunUtc,
  defaultReportFilters,
  fetchReportBundle,
  parseReportFilters,
  type ReportMetricsSummary,
} from "@/lib/reports";
import {
  campaignSequenceStepsSchema,
  parseSequenceStepsFromJson,
} from "@/lib/sequences";
import {
  createGoogleCalendarEvent,
  createMicrosoftCalendarEvent,
  getValidAccessTokenForUser,
} from "@/lib/calendar";
import type { CalendarProvider } from "@/lib/calendar";

/** Prompt 18: hard cap so the dashboard never spins forever (must be ≥ `GRAPH_INVOKE_MAX_MS` in graph). */
const START_CAMPAIGN_MAX_MS = 90_000;

const LEAD_STATUSES = ["new", "contacted", "qualified", "nurtured", "closed"] as const;

function parseRerunLeadFromResults(results: unknown): LeadFormInput | null {
  if (!results || typeof results !== "object" || Array.isArray(results)) return null;
  const snap = results as Record<string, unknown>;
  const lead = snap.lead;
  if (!lead || typeof lead !== "object" || Array.isArray(lead)) return null;
  const l = lead as Record<string, unknown>;
  if (
    typeof l.name !== "string" ||
    typeof l.email !== "string" ||
    typeof l.company !== "string"
  ) {
    return null;
  }
  const statusRaw = l.status;
  const status = LEAD_STATUSES.includes(statusRaw as (typeof LEAD_STATUSES)[number])
    ? (statusRaw as LeadFormInput["status"])
    : "new";
  const voiceRaw = l.sdr_voice_tone;
  const sdr_voice_tone: SdrVoiceTone = SDR_VOICE_TONE_VALUES.includes(
    voiceRaw as SdrVoiceTone,
  )
    ? (voiceRaw as SdrVoiceTone)
    : "default";

  const phoneRaw = l.phone;
  const phone =
    typeof phoneRaw === "string" && phoneRaw.trim() ? phoneRaw.trim() : undefined;
  const cvIdRaw = l.custom_voice_id;
  const custom_voice_id =
    typeof cvIdRaw === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      cvIdRaw.trim(),
    )
      ? cvIdRaw.trim()
      : undefined;
  const custom_voice_name =
    typeof l.custom_voice_name === "string" && l.custom_voice_name.trim()
      ? l.custom_voice_name.trim()
      : undefined;

  return {
    name: l.name.trim(),
    email: l.email.trim(),
    company: l.company.trim(),
    linkedin_url:
      typeof l.linkedin_url === "string" && l.linkedin_url.trim()
        ? l.linkedin_url.trim()
        : "",
    phone,
    notes: typeof l.notes === "string" ? l.notes : "",
    status,
    sdr_voice_tone,
    custom_voice_id,
    custom_voice_name,
  };
}

/** Label for list UI — uses same lead shape as re-run parser. */
function parseSdrVoiceLabelFromResults(results: unknown): string | null {
  const lead = parseRerunLeadFromResults(results);
  if (!lead) return null;
  return voiceLabelForLead(lead as unknown as Lead);
}

type SupabaseErrorShape = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};

function logCheckpointListError(context: string, error: SupabaseErrorShape | null): void {
  if (!error) return;
  console.error(
    "[AgentForge] listCampaignThreads",
    context,
    error.message,
    error.code ?? "",
    error.details ?? "",
    error.hint ?? "",
  );
}

function readCheckpointDashboardFields(state: unknown): {
  lead?: {
    name?: string;
    company?: string;
    sdr_voice_tone?: string;
    custom_voice_id?: string;
    custom_voice_name?: string;
  };
  current_agent?: string;
  outreach_sent?: boolean;
  outreach_output?: { email_sent?: boolean };
} {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return {};
  }
  const st = state as Record<string, unknown>;
  const rawLead = st.lead;
  let lead:
    | {
        name?: string;
        company?: string;
        sdr_voice_tone?: string;
        custom_voice_id?: string;
        custom_voice_name?: string;
      }
    | undefined;
  if (rawLead && typeof rawLead === "object" && !Array.isArray(rawLead)) {
    const l = rawLead as Record<string, unknown>;
    lead = {
      name: typeof l.name === "string" ? l.name : undefined,
      company: typeof l.company === "string" ? l.company : undefined,
      sdr_voice_tone:
        typeof l.sdr_voice_tone === "string" ? l.sdr_voice_tone : undefined,
      custom_voice_id:
        typeof l.custom_voice_id === "string" ? l.custom_voice_id : undefined,
      custom_voice_name:
        typeof l.custom_voice_name === "string" ? l.custom_voice_name : undefined,
    };
  }
  const outreach_output = st.outreach_output;
  let oo: { email_sent?: boolean } | undefined;
  if (
    outreach_output &&
    typeof outreach_output === "object" &&
    !Array.isArray(outreach_output)
  ) {
    const o = outreach_output as Record<string, unknown>;
    oo = {
      email_sent: typeof o.email_sent === "boolean" ? o.email_sent : undefined,
    };
  }
  return {
    lead,
    current_agent:
      typeof st.current_agent === "string" ? st.current_agent : undefined,
    outreach_sent:
      typeof st.outreach_sent === "boolean" ? st.outreach_sent : undefined,
    outreach_output: oo,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function snapshotFromPersistedResults(results: unknown): CampaignClientSnapshot | null {
  if (!isRecord(results)) return null;
  if (typeof results.thread_id !== "string") return null;
  if (!isRecord(results.lead)) return null;
  if (typeof results.final_status !== "string") return null;
  return results as unknown as CampaignClientSnapshot;
}

function coerceProspectReplyAnalysis(raw: unknown): ProspectReplyAnalysisPayload | null {
  if (!isRecord(raw)) return null;
  const sentiment = typeof raw.sentiment === "string" ? raw.sentiment : "neutral";
  const interestRaw = raw.interest_level_0_to_10;
  const interest =
    typeof interestRaw === "number" && Number.isFinite(interestRaw)
      ? Math.min(10, Math.max(0, Math.round(interestRaw)))
      : 5;
  const objections = Array.isArray(raw.objections_detected)
    ? raw.objections_detected.filter((x): x is string => typeof x === "string")
    : [];
  const buying = Array.isArray(raw.buying_signals)
    ? raw.buying_signals.filter((x): x is string => typeof x === "string")
    : [];
  const step =
    typeof raw.suggested_next_nurture_step === "string"
      ? raw.suggested_next_nurture_step
      : "";
  const voice =
    typeof raw.suggested_voice === "string" ? raw.suggested_voice : "default";
  const voiceLabel =
    typeof raw.suggested_voice_label === "string"
      ? raw.suggested_voice_label
      : sdrVoiceLabel(
          SDR_VOICE_TONE_VALUES.includes(voice as SdrVoiceTone)
            ? (voice as SdrVoiceTone)
            : "default",
        );
  const rationale =
    typeof raw.rationale === "string" ? raw.rationale : "Analysis stored.";
  return {
    sentiment,
    interest_level_0_to_10: interest,
    objections_detected: objections,
    buying_signals: buying,
    suggested_next_nurture_step: step,
    suggested_voice: voice,
    suggested_voice_label: voiceLabel,
    rationale,
  };
}

/** PostgREST / Postgres hints when optional columns are missing from an older table. */
function isMissingColumnOrSchemaError(message: string): boolean {
  return /column|does not exist|schema cache|42703|PGRST204|undefined column/i.test(message);
}

function coerceInterestScoreColumn(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.min(10, Math.max(0, Math.round(raw)));
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number.parseInt(raw.replace(/,/g, ""), 10);
    if (Number.isFinite(n)) return Math.min(10, Math.max(0, n));
  }
  return fallback;
}

function mergeReplyRowIntoAnalysisPayload(r: Record<string, unknown>): ProspectReplyAnalysisPayload | null {
  const fromJson = coerceProspectReplyAnalysis(r.analysis);
  if (!fromJson) return null;
  const interestLevel = coerceInterestScoreColumn(r.interest_score, fromJson.interest_level_0_to_10);
  const sentiment =
    typeof r.sentiment === "string" && r.sentiment.trim()
      ? r.sentiment.trim()
      : fromJson.sentiment;
  const voiceRaw =
    typeof r.suggested_voice === "string" && r.suggested_voice.trim()
      ? r.suggested_voice.trim()
      : fromJson.suggested_voice;
  const sdrVoice: SdrVoiceTone = SDR_VOICE_TONE_VALUES.includes(voiceRaw as SdrVoiceTone)
    ? (voiceRaw as SdrVoiceTone)
    : SDR_VOICE_TONE_VALUES.includes(fromJson.suggested_voice as SdrVoiceTone)
      ? (fromJson.suggested_voice as SdrVoiceTone)
      : "default";
  const nextStep =
    typeof r.next_step === "string" ? r.next_step : fromJson.suggested_next_nurture_step;
  let objections = fromJson.objections_detected;
  if (Array.isArray(r.objections)) {
    const o = r.objections.filter((x): x is string => typeof x === "string");
    if (o.length > 0) objections = o;
  }
  return {
    ...fromJson,
    sentiment,
    interest_level_0_to_10: interestLevel,
    suggested_voice: sdrVoice,
    suggested_voice_label: sdrVoiceLabel(sdrVoice),
    suggested_next_nurture_step: nextStep,
    objections_detected: objections,
  };
}

/**
 * Inserts into `reply_analyses` using the service role when available (same pattern as campaign saves),
 * with a fallback to the user-scoped client. Retries with a minimal column set if the DB predates Prompt 52.
 */
async function insertReplyAnalysisRow(
  userScoped: SupabaseClient,
  fullRow: Record<string, unknown>,
  minimalRow: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sr = getServiceRoleSupabaseOrNull();
  const clients: SupabaseClient[] = sr ? [sr, userScoped] : [userScoped];
  let lastMessage = "Could not save reply analysis.";
  for (const client of clients) {
    let { error } = await client.from("reply_analyses").insert(fullRow);
    if (!error) return { ok: true };
    lastMessage = error.message;
    if (isMissingColumnOrSchemaError(error.message)) {
      ({ error } = await client.from("reply_analyses").insert(minimalRow));
      if (!error) return { ok: true };
      lastMessage = error.message;
    }
  }
  console.error("[AgentForge] reply_analyses insert failed:", lastMessage);
  return { ok: false, error: lastMessage };
}

const REPLY_LIST_SELECT_FULL =
  "id, created_at, thread_id, company, lead_name, prospect_email, reply_preview, reply_full, analysis, sentiment, interest_score, suggested_voice, next_step, objections";
const REPLY_LIST_SELECT_MIN =
  "id, created_at, thread_id, company, lead_name, reply_preview, analysis";

async function queryReplyAnalysesForList(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ data: Record<string, unknown>[] | null; error: Error | null }> {
  const primary = await supabase
    .from("reply_analyses")
    .select(REPLY_LIST_SELECT_FULL)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (!primary.error) {
    return { data: (primary.data ?? []) as Record<string, unknown>[], error: null };
  }
  if (isMissingColumnOrSchemaError(primary.error.message)) {
    const fb = await supabase
      .from("reply_analyses")
      .select(REPLY_LIST_SELECT_MIN)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (!fb.error) {
      return { data: (fb.data ?? []) as Record<string, unknown>[], error: null };
    }
    return { data: null, error: new Error(fb.error.message) };
  }
  return { data: null, error: new Error(primary.error.message) };
}

async function queryCampaignSignalsFeed(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<LiveSignalFeedItem[]> {
  const { data, error } = await supabase
    .from("campaign_signals")
    .select("id, thread_id, signal_type, signal_text, created_at")
    .in("user_id", userIds)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    if (isMissingColumnOrSchemaError(error.message)) {
      return [];
    }
    console.error("[AgentForge] queryCampaignSignalsFeed", error.message);
    return [];
  }
  const rows = data ?? [];
  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id ?? ""),
      thread_id: String(r.thread_id ?? ""),
      signal_type: String(r.signal_type ?? "other"),
      signal_text: String(r.signal_text ?? ""),
      created_at: String(r.created_at ?? ""),
    };
  });
}

async function queryReplyRowsForAnalytics(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Record<string, unknown>[]> {
  const full = await supabase
    .from("reply_analyses")
    .select("interest_score, analysis")
    .in("user_id", userIds)
    .limit(2000);
  if (!full.error) {
    return (full.data ?? []) as Record<string, unknown>[];
  }
  if (isMissingColumnOrSchemaError(full.error.message)) {
    const fb = await supabase
      .from("reply_analyses")
      .select("analysis")
      .in("user_id", userIds)
      .limit(2000);
    if (!fb.error) {
      return (fb.data ?? []) as Record<string, unknown>[];
    }
  }
  return [];
}

async function queryReplyObjectionRowsForAnalytics(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Record<string, unknown>[]> {
  const full = await supabase
    .from("reply_analyses")
    .select("id, thread_id, lead_name, company, reply_preview, analysis, created_at")
    .in("user_id", userIds)
    .order("created_at", { ascending: false })
    .limit(45);
  if (!full.error) {
    return (full.data ?? []) as Record<string, unknown>[];
  }
  if (isMissingColumnOrSchemaError(full.error.message)) {
    const fb = await supabase
      .from("reply_analyses")
      .select("id, thread_id, lead_name, company, analysis, created_at")
      .in("user_id", userIds)
      .order("created_at", { ascending: false })
      .limit(45);
    if (!fb.error) {
      return (fb.data ?? []).map((row) => ({
        ...row,
        reply_preview: "",
      })) as Record<string, unknown>[];
    }
  }
  return [];
}

function buildReplyInterestByThreadMap(rows: Record<string, unknown>[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const tid = typeof row.thread_id === "string" ? row.thread_id : null;
    if (!tid) continue;
    const fromCol = coerceInterestScoreColumn(row.interest_score, NaN);
    let interest = Number.isNaN(fromCol) ? 5 : fromCol;
    const a = row.analysis;
    if (isRecord(a) && typeof a.interest_level_0_to_10 === "number") {
      interest = Math.min(10, Math.max(0, Math.round(a.interest_level_0_to_10)));
    }
    const prev = map.get(tid);
    if (prev == null || interest > prev) map.set(tid, interest);
  }
  return map;
}

function buildReplyInterestByEmailMap(rows: Record<string, unknown>[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const emRaw = row.prospect_email;
    const em = typeof emRaw === "string" ? emRaw.trim().toLowerCase() : "";
    if (!em) continue;
    const fromCol = coerceInterestScoreColumn(row.interest_score, NaN);
    let interest = Number.isNaN(fromCol) ? 5 : fromCol;
    const a = row.analysis;
    if (isRecord(a) && typeof a.interest_level_0_to_10 === "number") {
      interest = Math.min(10, Math.max(0, Math.round(a.interest_level_0_to_10)));
    }
    const prev = map.get(em);
    if (prev == null || interest > prev) map.set(em, interest);
  }
  return map;
}

function mondayWeekStartUtc(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate.slice(0, 10);
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

function voiceLabelFromCheckpointLead(lead: {
  sdr_voice_tone?: string;
  custom_voice_id?: string;
  custom_voice_name?: string;
} | undefined): string | null {
  if (!lead) return null;
  return voiceLabelForLead(lead as unknown as Lead);
}

type CheckpointRowInput = {
  thread_id: unknown;
  updated_at: unknown;
  state?: unknown;
};

function mapCheckpointRowToThread(row: CheckpointRowInput): CampaignThreadRow {
  const parsed = readCheckpointDashboardFields(row.state);
  const st = parsed;
  const sent =
    st.outreach_output?.email_sent ?? st.outreach_sent ?? false;
  return {
    thread_id: String(row.thread_id ?? ""),
    updated_at: String(row.updated_at ?? ""),
    lead_preview: st.lead?.name,
    company_preview: st.lead?.company,
    current_agent: st.current_agent,
    outreach_sent: sent,
    sdr_voice_label: voiceLabelFromCheckpointLead(st.lead),
  };
}

const incomingLeadSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  email: z.string().email(),
  company: z.string().min(1),
  linkedin_url: z
    .union([z.string().url(), z.literal("")])
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
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
  /** Carried from snapshots / reruns; optional on fresh submits. */
  custom_voice_name: z.string().max(200).optional(),
});

const campaignRunOptionsSchema = z.object({
  ab_test_id: z.string().uuid().optional(),
  ab_variant: z.enum(["A", "B"]).optional(),
  template_id: z.string().uuid().optional(),
  template_voice_note: z.string().max(2000).optional(),
  /** Prompt 88 — optional saved sequence for display + milestone progress in the UI. */
  sequence_id: z.string().uuid().optional(),
});

const startCampaignWithOptionsPayloadSchema = z.object({
  lead: incomingLeadSchema,
  options: campaignRunOptionsSchema.optional(),
});

const abVoicePairSchema = z.object({
  lead: incomingLeadSchema,
  voice_a: z.enum(SDR_VOICE_TONE_VALUES),
  voice_b: z.enum(SDR_VOICE_TONE_VALUES),
  voice_b_note: z.string().max(1200).optional(),
});

/** Prompt 90 — multi-lead A/B with optional templates + shared sequence. */
const advancedAbBatchSchema = z.object({
  name: z.string().max(160).optional(),
  leads: z.array(incomingLeadSchema).min(1).max(6),
  voice_a: z.enum(SDR_VOICE_TONE_VALUES),
  voice_b: z.enum(SDR_VOICE_TONE_VALUES),
  voice_b_note: z.string().max(1200).optional(),
  sequence_id: z.string().uuid().optional(),
  template_id_a: z.string().uuid().optional(),
  template_id_b: z.string().uuid().optional(),
});

export type StartCampaignResult =
  | {
      ok: true;
      thread_id: string;
      message: string;
      /** Full graph state safe for the dashboard (per-node results, outputs, errors). */
      snapshot: CampaignClientSnapshot;
    }
  | { ok: false; error: string };

function humanizeServerFailureMessage(message: string): string {
  const m = message.trim();
  if (/exceeded \d+ms/i.test(m)) {
    return "The campaign hit a safety time limit and was stopped so the page would not hang. Try again, or check API keys and network.";
  }
  if (
    /too_small|string must contain at least 1 character/i.test(m) &&
    /GROQ|ANTHROPIC|API_KEY|env/i.test(m)
  ) {
    return "Missing GROQ_API_KEY – please add it to .env.local";
  }
  if (
    m.includes("Missing GROQ_API_KEY") ||
    m.includes("Configure GROQ") ||
    m.includes("ANTHROPIC_API_KEY") ||
    m.includes("No LLM provider")
  ) {
    return "Missing GROQ_API_KEY – please add it to .env.local";
  }
  return m;
}

/**
 * Server action wrapper for persisting a campaign row (same as `runCampaignGraph` uses
 * via `@/lib/save-campaign`). Callable from other server code or tests.
 */
export async function saveCampaign(params: {
  userId: string;
  threadId: string;
  lead: Lead;
  snapshot: CampaignClientSnapshot;
}): Promise<void> {
  await persistCampaignToDatabase(params);
}

const workspaceRoleSchema = z.enum(["admin", "member", "viewer"]);

const inviteWorkspaceMemberSchema = z.object({
  email: z.string().email(),
  role: workspaceRoleSchema.default("member"),
});

export type InviteWorkspaceMemberResult = { ok: true } | { ok: false; error: string };

const updateWorkspaceMemberRoleSchema = z.object({
  user_id: z.string().uuid(),
  role: workspaceRoleSchema,
});

export type UpdateWorkspaceMemberRoleResult = { ok: true } | { ok: false; error: string };

/**
 * Prompt 81 — list members + pending invites for the active workspace.
 */
export async function getWorkspaceMembersAction(): Promise<{
  workspaceRole: WorkspaceMemberRole;
  members: WorkspaceMemberDTO[];
} | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const ctx = await resolveWorkspaceContext(supabase, {
    id: user.id,
    email: user.email ?? null,
  });

  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, user_id, role, invited_email, status, created_at")
    .eq("workspace_id", ctx.workspaceId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[AgentForge] getWorkspaceMembersAction", error.message);
    return {
      workspaceRole: ctx.currentUserRole,
      members: [
        {
          workspace_id: ctx.workspaceId,
          user_id: user.id,
          role: "admin",
          invited_email: user.email ?? null,
          status: "active",
          created_at: new Date().toISOString(),
          is_self: true,
        },
      ],
    };
  }

  const members: WorkspaceMemberDTO[] = (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      workspace_id: String(row.workspace_id ?? ctx.workspaceId),
      user_id: typeof row.user_id === "string" ? row.user_id : null,
      role: workspaceRoleSchema.parse(row.role),
      invited_email: typeof row.invited_email === "string" ? row.invited_email : null,
      status: row.status === "pending" ? "pending" : "active",
      created_at: String(row.created_at ?? ""),
      is_self: row.user_id === user.id,
    };
  });

  return {
    workspaceRole: ctx.currentUserRole,
    members,
  };
}

/**
 * Prompt 81 — invite user by email into active workspace.
 * If user already exists and has profile row, grant active membership immediately.
 */
export async function inviteWorkspaceMemberAction(
  raw: z.input<typeof inviteWorkspaceMemberSchema>,
): Promise<InviteWorkspaceMemberResult> {
  const parsed = inviteWorkspaceMemberSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid email or role." };

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "Unauthorized" };

  const ctx = await resolveWorkspaceContext(supabase, {
    id: user.id,
    email: user.email ?? null,
  });
  if (ctx.currentUserRole !== "admin") {
    return { ok: false, error: "Only workspace admins can invite members." };
  }

  const email = parsed.data.email.trim().toLowerCase();
  const role = parsed.data.role;

  const { error: cleanupErr } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", ctx.workspaceId)
    .is("user_id", null)
    .eq("invited_email", email)
    .eq("status", "pending");
  if (cleanupErr) return { ok: false, error: cleanupErr.message };

  const { error } = await supabase.from("workspace_members").insert({
    workspace_id: ctx.workspaceId,
    user_id: null,
    invited_email: email,
    role,
    status: "pending",
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  return { ok: true };
}

/**
 * Prompt 81 — admins can change member role in active workspace.
 */
export async function updateWorkspaceMemberRoleAction(
  raw: z.input<typeof updateWorkspaceMemberRoleSchema>,
): Promise<UpdateWorkspaceMemberRoleResult> {
  const parsed = updateWorkspaceMemberRoleSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid payload." };

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "Unauthorized" };

  const ctx = await resolveWorkspaceContext(supabase, {
    id: user.id,
    email: user.email ?? null,
  });
  if (ctx.currentUserRole !== "admin") {
    return { ok: false, error: "Only workspace admins can update roles." };
  }
  if (parsed.data.user_id === user.id) {
    return { ok: false, error: "Cannot change your own role here." };
  }

  const { error } = await supabase
    .from("workspace_members")
    .update({ role: parsed.data.role })
    .eq("workspace_id", ctx.workspaceId)
    .eq("user_id", parsed.data.user_id)
    .eq("status", "active");

  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  return { ok: true };
}

type WorkspaceCtx = Awaited<ReturnType<typeof resolveWorkspaceContext>>;

/** Prompt 88 — load saved playbook for this workspace (null if missing or table absent). */
async function fetchCampaignSequencePlanForWorkspace(
  supabase: SupabaseClient,
  workspaceId: string,
  sequenceId: string | undefined | null,
): Promise<CampaignSequencePlan | null> {
  const sid = sequenceId?.trim();
  if (!sid) return null;
  const { data, error } = await supabase
    .from("campaign_sequences")
    .select("id, name, steps")
    .eq("id", sid)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) {
    if (!isMissingColumnOrSchemaError(error.message)) {
      console.warn("[AgentForge] fetchCampaignSequencePlanForWorkspace", error.message);
    }
    return null;
  }
  if (!data) return null;
  const row = data as { id: string; name: string; steps: unknown };
  const steps = parseSequenceStepsFromJson(row.steps);
  return {
    sequence_id: row.id,
    name: row.name,
    steps,
  };
}

/**
 * Prompt 85 — shared graph invocation (templates + A/B meta optional).
 */
async function runSingleCampaignPipeline(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> },
  ws: WorkspaceCtx,
  parsedLead: z.infer<typeof incomingLeadSchema>,
  options?: z.infer<typeof campaignRunOptionsSchema> | null,
): Promise<StartCampaignResult> {
  let formLead: LeadFormInput = {
    name: parsedLead.name,
    email: parsedLead.email,
    company: parsedLead.company,
    linkedin_url: parsedLead.linkedin_url ?? "",
    phone: parsedLead.phone,
    notes: parsedLead.notes ?? "",
    status: parsedLead.status,
    sdr_voice_tone: parsedLead.sdr_voice_tone,
    custom_voice_id: parsedLead.custom_voice_id,
    custom_voice_name: parsedLead.custom_voice_name,
  };

  const tid = options?.template_id?.trim();
  if (tid) {
    const { data: tmpl } = await supabase
      .from("campaign_templates")
      .select("payload, workspace_id")
      .eq("id", tid)
      .maybeSingle();
    const tw = tmpl as { workspace_id?: string; payload?: unknown } | null;
    if (
      tw?.workspace_id === ws.workspaceId &&
      tw.payload &&
      typeof tw.payload === "object" &&
      !Array.isArray(tw.payload)
    ) {
      formLead = mergeTemplatePayloadIntoLeadForm(
        formLead,
        tw.payload as Record<string, unknown>,
      );
    }
  }

  let custom_voice_profile: CustomVoiceProfile | undefined;
  let lead: Lead = {
    id: parsedLead.id ?? randomUUID(),
    name: formLead.name,
    email: formLead.email,
    company: formLead.company,
    linkedin_url: formLead.linkedin_url || undefined,
    phone: formLead.phone,
    notes: formLead.notes,
    status: formLead.status ?? "new",
    sdr_voice_tone: formLead.sdr_voice_tone,
    custom_voice_id: formLead.custom_voice_id,
    custom_voice_name: formLead.custom_voice_name,
  };

  if (lead.custom_voice_id) {
    const profile = await fetchCustomVoiceProfileForUser(user.id, lead.custom_voice_id);
    if (profile) {
      custom_voice_profile = profile;
      lead = { ...lead, custom_voice_name: profile.name };
    } else {
      lead = { ...lead, custom_voice_id: undefined, custom_voice_name: undefined };
    }
  }

  const thread_id = `${user.id}_${Date.now()}`;

  let senderSignoffName = "";
  if (typeof user.user_metadata?.full_name === "string") {
    senderSignoffName = user.user_metadata.full_name.trim();
  }
  const { data: profileForSignoff } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  if (profileForSignoff?.full_name?.trim()) {
    senderSignoffName = profileForSignoff.full_name.trim();
  }

  try {
    warnIfResendNotConfigured();
    const wl = await fetchWhiteLabelSettings(supabase, ws.workspaceId);
    const sequence_plan =
      (await fetchCampaignSequencePlanForWorkspace(
        supabase,
        ws.workspaceId,
        options?.sequence_id,
      )) ?? undefined;
    await deleteThreadCheckpoint(thread_id);

    let reply_follow_up_intel: ReplyFollowUpIntel | undefined;
    try {
      const em = lead.email.trim();
      if (em) {
        const { data: rep } = await supabase
          .from("reply_analyses")
          .select("interest_score, analysis")
          .eq("user_id", user.id)
          .eq("prospect_email", em)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (rep) {
          const row = rep as {
            interest_score?: unknown;
            analysis?: unknown;
          };
          const a = row.analysis;
          const analysisRec =
            a && typeof a === "object" && !Array.isArray(a)
              ? (a as Record<string, unknown>)
              : null;
          let interest: number | null = null;
          if (typeof row.interest_score === "number" && Number.isFinite(row.interest_score)) {
            interest = Math.min(10, Math.max(0, Math.round(row.interest_score)));
          } else if (
            typeof analysisRec?.interest_level_0_to_10 === "number" &&
            Number.isFinite(analysisRec.interest_level_0_to_10)
          ) {
            interest = Math.min(
              10,
              Math.max(0, Math.round(analysisRec.interest_level_0_to_10)),
            );
          }
          const summary =
            typeof analysisRec?.rationale === "string" && analysisRec.rationale.trim()
              ? analysisRec.rationale.trim().slice(0, 600)
              : "Prior prospect reply on file — tune follow-up spacing and proof density.";
          reply_follow_up_intel = { interest_0_to_10: interest, summary };
        }
      }
    } catch {
      reply_follow_up_intel = undefined;
    }

    const finalState = await withTimeout(
      runCampaignGraph({
        lead,
        thread_id,
        user_id: user.id,
        workspace_id: ws.workspaceId,
        sender_signoff_name: senderSignoffName || undefined,
        custom_voice_profile,
        brand_display_name: wl.brandSignoff,
        ab_test_id: options?.ab_test_id,
        ab_variant: options?.ab_variant,
        template_id: options?.template_id,
        template_voice_note: options?.template_voice_note,
        sequence_plan,
        reply_follow_up_intel: reply_follow_up_intel ?? null,
      }),
      START_CAMPAIGN_MAX_MS,
      "startCampaign.runCampaignGraph",
    );
    const snapshot = serializeCampaignStateForClient(finalState);

    revalidatePath("/");
    revalidatePath("/analytics");

    return {
      ok: true,
      thread_id,
      message: "Campaign finished. Review results below or use View full log.",
      snapshot,
    };
  } catch (e) {
    const message =
      e instanceof Error
        ? e.message
        : typeof e === "string"
          ? e
          : "Campaign failed";
    console.error("[AgentForge] startCampaign", e);
    return { ok: false, error: humanizeServerFailureMessage(message) };
  }
}

/**
 * Core campaign runner: new `thread_id` per invocation, full graph, persist + revalidate.
 * Prefer {@link startCampaignAction} from Client Components so imports read as an explicit server action.
 */
export async function startCampaign(
  raw: z.input<typeof incomingLeadSchema>,
): Promise<StartCampaignResult> {
  const parsed = incomingLeadSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      error: Object.values(msg)
        .flat()
        .filter(Boolean)
        .join(", "),
    };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "Unauthorized" };
  }
  await ensurePersonalWorkspaceMembership(supabase, user.id);
  const ws = await resolveWorkspaceContext(supabase, {
    id: user.id,
    email: user.email ?? null,
  });

  return runSingleCampaignPipeline(supabase, user, ws, parsed.data, null);
}

/**
 * Prompt 85 — start campaign with template merge + optional A/B tracking fields.
 */
export async function startCampaignWithOptionsAction(
  raw: z.input<typeof startCampaignWithOptionsPayloadSchema>,
): Promise<StartCampaignResult> {
  const parsed = startCampaignWithOptionsPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: Object.values(parsed.error.flatten().fieldErrors)
        .flat()
        .filter(Boolean)
        .join(", "),
    };
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Unauthorized" };
  }
  await ensurePersonalWorkspaceMembership(supabase, user.id);
  const ws = await resolveWorkspaceContext(supabase, {
    id: user.id,
    email: user.email ?? null,
  });
  return runSingleCampaignPipeline(supabase, user, ws, parsed.data.lead, parsed.data.options);
}

export type AbVoicePairResult =
  | {
      ok: true;
      ab_test_id: string;
      thread_id_a: string;
      thread_id_b: string;
      message: string;
    }
  | { ok: false; error: string };

/**
 * Prompt 85 — run the same lead through two preset SDR voices (sequential full pipelines).
 */
export async function startAbVoicePairAction(
  raw: z.input<typeof abVoicePairSchema>,
): Promise<AbVoicePairResult> {
  const parsed = abVoicePairSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: Object.values(parsed.error.flatten().fieldErrors)
        .flat()
        .filter(Boolean)
        .join(", "),
    };
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Unauthorized" };
  }
  await ensurePersonalWorkspaceMembership(supabase, user.id);
  const ws = await resolveWorkspaceContext(supabase, {
    id: user.id,
    email: user.email ?? null,
  });

  const ab_test_id = randomUUID();
  const base = parsed.data.lead;
  const leadA: z.infer<typeof incomingLeadSchema> = {
    ...base,
    sdr_voice_tone: parsed.data.voice_a,
    custom_voice_id: undefined,
    custom_voice_name: undefined,
  };
  const leadB: z.infer<typeof incomingLeadSchema> = {
    ...base,
    sdr_voice_tone: parsed.data.voice_b,
    custom_voice_id: undefined,
    custom_voice_name: undefined,
  };

  const resA = await runSingleCampaignPipeline(supabase, user, ws, leadA, {
    ab_test_id,
    ab_variant: "A",
  });
  if (!resA.ok) {
    return { ok: false, error: resA.error };
  }

  const noteB = parsed.data.voice_b_note?.trim();
  const resB = await runSingleCampaignPipeline(supabase, user, ws, leadB, {
    ab_test_id,
    ab_variant: "B",
    template_voice_note: noteB || undefined,
  });
  if (!resB.ok) {
    return { ok: false, error: `Variant B failed: ${resB.error}` };
  }

  return {
    ok: true,
    ab_test_id,
    thread_id_a: resA.thread_id,
    thread_id_b: resB.thread_id,
    message: "A/B voice test completed — both variants saved. Compare in Analytics.",
  };
}

async function tryInsertAbTestRow(
  supabase: SupabaseClient,
  payload: {
    id: string;
    workspace_id: string;
    user_id: string;
    name: string;
    experiment_type: string;
    config: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from("ab_tests").insert({
    id: payload.id,
    workspace_id: payload.workspace_id,
    user_id: payload.user_id,
    name: payload.name,
    experiment_type: payload.experiment_type,
    status: "running",
    config: payload.config,
  });
  if (error && !isMissingColumnOrSchemaError(error.message)) {
    console.warn("[AgentForge] ab_tests insert", error.message);
  }
}

async function markAbTestFailed(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase
    .from("ab_tests")
    .update({ status: "failed", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error && !isMissingColumnOrSchemaError(error.message)) {
    console.warn("[AgentForge] ab_tests failed status", error.message);
  }
}

async function finalizeAbTestFromCampaigns(
  supabase: SupabaseClient,
  campaignsReader: SupabaseClient,
  ab_test_id: string,
  memberIds: string[],
): Promise<void> {
  const { data, error } = await campaignsReader
    .from("campaigns")
    .select("ab_variant, thread_id, results, user_id")
    .eq("ab_test_id", ab_test_id)
    .in("user_id", memberIds);
  if (error) {
    if (!isMissingColumnOrSchemaError(error.message)) {
      console.warn("[AgentForge] finalizeAbTestFromCampaigns campaigns", error.message);
    }
    return;
  }
  if (!data?.length) {
    const { error: upErr } = await supabase
      .from("ab_tests")
      .update({
        status: "completed",
        winner_variant: "tie",
        winner_reason: "No linked campaign rows yet for this experiment id.",
        metrics_summary: { count_a: 0, count_b: 0 },
        updated_at: new Date().toISOString(),
      })
      .eq("id", ab_test_id);
    if (upErr && !isMissingColumnOrSchemaError(upErr.message)) {
      console.warn("[AgentForge] ab_tests finalize empty", upErr.message);
    }
    return;
  }
  const threadIds = [
    ...new Set(
      data
        .map((r) => String((r as { thread_id?: string }).thread_id ?? ""))
        .filter(Boolean),
    ),
  ];
  const { data: rep } = await campaignsReader
    .from("reply_analyses")
    .select("thread_id, interest_score, analysis")
    .in("thread_id", threadIds)
    .in("user_id", memberIds);
  const interestMap = buildReplyInterestByThreadMap((rep ?? []) as Record<string, unknown>[]);
  const rows = (data ?? []).map((r) => ({
    ab_variant: String((r as { ab_variant?: string }).ab_variant ?? ""),
    thread_id: String((r as { thread_id?: string }).thread_id ?? ""),
    results: (r as { results?: unknown }).results,
  }));
  const agg = aggregateBatchAbOptimization(rows, interestMap);
  const { error: upErr } = await supabase
    .from("ab_tests")
    .update({
      status: "completed",
      winner_variant: agg.winner,
      winner_reason: agg.reason,
      metrics_summary: {
        mean_optimization_a: agg.meanA,
        mean_optimization_b: agg.meanB,
        count_a: agg.countA,
        count_b: agg.countB,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", ab_test_id);
  if (upErr && !isMissingColumnOrSchemaError(upErr.message)) {
    console.warn("[AgentForge] ab_tests finalize", upErr.message);
  }
}

/**
 * Prompt 90 — run A vs B across multiple leads (optional templates per variant + shared sequence).
 */
export async function startAdvancedAbBatchExperimentAction(
  raw: z.input<typeof advancedAbBatchSchema>,
): Promise<
  | { ok: true; ab_test_id: string; runs_completed: number; message: string }
  | { ok: false; error: string }
> {
  const parsed = advancedAbBatchSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        Object.values(parsed.error.flatten().fieldErrors)
          .flat()
          .filter(Boolean)
          .join(", ") || "Invalid batch A/B payload.",
    };
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Unauthorized" };
  }
  await ensurePersonalWorkspaceMembership(supabase, user.id);
  const ws = await resolveWorkspaceContext(supabase, {
    id: user.id,
    email: user.email ?? null,
  });
  const campaignsReader = getServiceRoleSupabaseOrNull() ?? supabase;

  const ab_test_id = randomUUID();
  const name =
    parsed.data.name?.trim() ||
    `Batch A/B · ${parsed.data.leads.length} leads · ${new Date().toLocaleDateString()}`;
  const experiment_type =
    parsed.data.template_id_a || parsed.data.template_id_b
      ? "batch_mixed"
      : parsed.data.sequence_id
        ? "batch_mixed"
        : "batch_voice";

  await tryInsertAbTestRow(supabase, {
    id: ab_test_id,
    workspace_id: ws.workspaceId,
    user_id: user.id,
    name,
    experiment_type,
    config: {
      leadCount: parsed.data.leads.length,
      voice_a: parsed.data.voice_a,
      voice_b: parsed.data.voice_b,
      sequence_id: parsed.data.sequence_id ?? null,
      template_id_a: parsed.data.template_id_a ?? null,
      template_id_b: parsed.data.template_id_b ?? null,
    },
  });

  let runs = 0;
  const seq = parsed.data.sequence_id?.trim();
  const noteB = parsed.data.voice_b_note?.trim();
  for (const leadRow of parsed.data.leads) {
    const leadA: z.infer<typeof incomingLeadSchema> = {
      ...leadRow,
      sdr_voice_tone: parsed.data.voice_a,
      custom_voice_id: undefined,
      custom_voice_name: undefined,
    };
    const resA = await runSingleCampaignPipeline(supabase, user, ws, leadA, {
      ab_test_id,
      ab_variant: "A",
      template_id: parsed.data.template_id_a,
      sequence_id: seq || undefined,
    });
    if (!resA.ok) {
      await markAbTestFailed(supabase, ab_test_id);
      return {
        ok: false,
        error: `Variant A failed for ${leadRow.email}: ${resA.error}`,
      };
    }
    runs += 1;

    const leadB: z.infer<typeof incomingLeadSchema> = {
      ...leadRow,
      sdr_voice_tone: parsed.data.voice_b,
      custom_voice_id: undefined,
      custom_voice_name: undefined,
    };
    const resB = await runSingleCampaignPipeline(supabase, user, ws, leadB, {
      ab_test_id,
      ab_variant: "B",
      template_id: parsed.data.template_id_b,
      template_voice_note: noteB || undefined,
      sequence_id: seq || undefined,
    });
    if (!resB.ok) {
      await markAbTestFailed(supabase, ab_test_id);
      return {
        ok: false,
        error: `Variant B failed for ${leadRow.email}: ${resB.error}`,
      };
    }
    runs += 1;
  }

  await finalizeAbTestFromCampaigns(supabase, campaignsReader, ab_test_id, ws.memberUserIds);
  revalidatePath("/");
  revalidatePath("/analytics");
  return {
    ok: true,
    ab_test_id,
    runs_completed: runs,
    message: `Completed ${runs} pipeline runs. See Sequences for the experiment registry and Analytics for scores.`,
  };
}

/** Prompt 90 — list advanced A/B experiments for the active workspace. */
export async function listAbTestsAction(): Promise<AbTestExperimentRow[]> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return [];
  }
  await ensurePersonalWorkspaceMembership(supabase, user.id);
  const ws = await resolveWorkspaceContext(supabase, {
    id: user.id,
    email: user.email ?? null,
  });
  const { data, error } = await supabase
    .from("ab_tests")
    .select(
      "id, name, status, experiment_type, winner_variant, winner_reason, metrics_summary, created_at",
    )
    .eq("workspace_id", ws.workspaceId)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) {
    if (!isMissingColumnOrSchemaError(error.message)) {
      console.warn("[AgentForge] listAbTestsAction", error.message);
    }
    return [];
  }
  return (data ?? []).map((rawRow) => {
    const r = rawRow as Record<string, unknown>;
    const ms = r.metrics_summary;
    return {
      id: String(r.id ?? ""),
      name: String(r.name ?? ""),
      status: String(r.status ?? ""),
      experiment_type: String(r.experiment_type ?? ""),
      winner_variant: r.winner_variant != null ? String(r.winner_variant) : null,
      winner_reason: r.winner_reason != null ? String(r.winner_reason) : null,
      metrics_summary:
        ms && typeof ms === "object" && !Array.isArray(ms)
          ? (ms as Record<string, unknown>)
          : null,
      created_at: String(r.created_at ?? ""),
    };
  });
}

const saveTemplateSchema = z.object({
  campaign_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
});

const deleteTemplateSchema = z.object({
  id: z.string().uuid(),
});

/**
 * Prompt 85 — persist voice/notes defaults from a completed campaign row.
 */
export async function saveCampaignAsTemplateAction(
  raw: z.input<typeof saveTemplateSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = saveTemplateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Invalid template payload." };
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Unauthorized" };
  }
  await ensurePersonalWorkspaceMembership(supabase, user.id);
  const ws = await resolveWorkspaceContext(supabase, {
    id: user.id,
    email: user.email ?? null,
  });
  const memberIds = ws.memberUserIds;

  const { data: row, error: qErr } = await supabase
    .from("campaigns")
    .select("id, results, user_id")
    .eq("id", parsed.data.campaign_id)
    .maybeSingle();

  if (qErr || !row) {
    return { ok: false, error: "Campaign not found." };
  }
  const owner = String((row as { user_id?: unknown }).user_id ?? "");
  if (!memberIds.includes(owner)) {
    return { ok: false, error: "Campaign not found." };
  }

  const snap = snapshotFromPersistedResults((row as { results?: unknown }).results);
  const l = snap?.lead;
  if (!l) {
    return { ok: false, error: "Campaign snapshot has no lead to template." };
  }

  const payload: Record<string, unknown> = {
    sdr_voice_tone: l.sdr_voice_tone,
    notes: l.notes ?? "",
    linkedin_url: l.linkedin_url ?? "",
    phone: l.phone ?? "",
    custom_voice_id: l.custom_voice_id,
    custom_voice_name: l.custom_voice_name,
  };

  const { error: insErr } = await supabase.from("campaign_templates").insert({
    workspace_id: ws.workspaceId,
    user_id: user.id,
    name: parsed.data.name.trim(),
    description: parsed.data.description?.trim() || null,
    payload,
    source_campaign_id: parsed.data.campaign_id,
  });

  if (insErr) {
    console.error("[AgentForge] saveCampaignAsTemplate", insErr.message);
    return {
      ok: false,
      error: insErr.message.includes("campaign_templates")
        ? "Templates table missing — run supabase/campaign_templates_ab_p85.sql."
        : insErr.message,
    };
  }
  revalidatePath("/");
  return { ok: true };
}

/** Prompt 85 — list templates for the active workspace. */
export async function listCampaignTemplatesAction(): Promise<CampaignTemplateRow[]> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return [];
  }
  await ensurePersonalWorkspaceMembership(supabase, user.id);
  const ws = await resolveWorkspaceContext(supabase, {
    id: user.id,
    email: user.email ?? null,
  });

  const { data, error } = await supabase
    .from("campaign_templates")
    .select("id, name, description, payload, created_at")
    .eq("workspace_id", ws.workspaceId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    if (!isMissingColumnOrSchemaError(error.message)) {
      console.warn("[AgentForge] listCampaignTemplates", error.message);
    }
    return [];
  }

  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      description: row.description != null ? String(row.description) : null,
      created_at: String(row.created_at ?? ""),
      payload:
        row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
          ? (row.payload as Record<string, unknown>)
          : {},
    };
  });
}

export async function deleteCampaignTemplateAction(
  raw: z.input<typeof deleteTemplateSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = deleteTemplateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Invalid id." };
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Unauthorized" };
  }
  await ensurePersonalWorkspaceMembership(supabase, user.id);
  const ws = await resolveWorkspaceContext(supabase, {
    id: user.id,
    email: user.email ?? null,
  });

  const { error } = await supabase
    .from("campaign_templates")
    .delete()
    .eq("id", parsed.data.id)
    .eq("workspace_id", ws.workspaceId);

  if (error) {
    return { ok: false, error: error.message };
  }
  revalidatePath("/");
  return { ok: true };
}

const upsertCampaignSequenceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  steps: campaignSequenceStepsSchema,
});

const deleteCampaignSequenceSchema = z.object({
  id: z.string().uuid(),
});

/** Prompt 88 — list saved sequences for the active workspace. */
export async function listCampaignSequencesAction(): Promise<CampaignSequenceRow[]> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return [];
  }
  await ensurePersonalWorkspaceMembership(supabase, user.id);
  const ws = await resolveWorkspaceContext(supabase, {
    id: user.id,
    email: user.email ?? null,
  });

  const { data, error } = await supabase
    .from("campaign_sequences")
    .select("id, name, steps, created_at, updated_at")
    .eq("workspace_id", ws.workspaceId)
    .order("updated_at", { ascending: false })
    .limit(80);

  if (error) {
    if (!isMissingColumnOrSchemaError(error.message)) {
      console.warn("[AgentForge] listCampaignSequences", error.message);
    }
    return [];
  }

  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      steps: parseSequenceStepsFromJson(row.steps),
      created_at: String(row.created_at ?? ""),
      updated_at: String(row.updated_at ?? ""),
    };
  });
}

export async function upsertCampaignSequenceAction(
  raw: z.input<typeof upsertCampaignSequenceSchema>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = upsertCampaignSequenceSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Invalid sequence name or steps." };
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Unauthorized" };
  }
  await ensurePersonalWorkspaceMembership(supabase, user.id);
  const ws = await resolveWorkspaceContext(supabase, {
    id: user.id,
    email: user.email ?? null,
  });

  const payload = {
    name: parsed.data.name.trim(),
    steps: parsed.data.steps,
    updated_at: new Date().toISOString(),
  };

  if (parsed.data.id) {
    const { data, error } = await supabase
      .from("campaign_sequences")
      .update(payload)
      .eq("id", parsed.data.id)
      .eq("workspace_id", ws.workspaceId)
      .select("id")
      .maybeSingle();
    if (error) {
      return {
        ok: false,
        error: error.message.includes("campaign_sequences")
          ? "Sequences table missing — run supabase/campaign_sequences_p88.sql."
          : error.message,
      };
    }
    if (!data?.id) {
      return { ok: false, error: "Sequence not found or access denied." };
    }
    revalidatePath("/");
    return { ok: true, id: String(data.id) };
  }

  const { data, error } = await supabase
    .from("campaign_sequences")
    .insert({
      workspace_id: ws.workspaceId,
      user_id: user.id,
      name: payload.name,
      steps: payload.steps,
    })
    .select("id")
    .single();

  if (error) {
    return {
      ok: false,
      error: error.message.includes("campaign_sequences")
        ? "Sequences table missing — run supabase/campaign_sequences_p88.sql."
        : error.message,
    };
  }
  revalidatePath("/");
  return { ok: true, id: String((data as { id: string }).id) };
}

export async function deleteCampaignSequenceAction(
  raw: z.input<typeof deleteCampaignSequenceSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = deleteCampaignSequenceSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Invalid id." };
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Unauthorized" };
  }
  await ensurePersonalWorkspaceMembership(supabase, user.id);
  const ws = await resolveWorkspaceContext(supabase, {
    id: user.id,
    email: user.email ?? null,
  });

  const { error } = await supabase
    .from("campaign_sequences")
    .delete()
    .eq("id", parsed.data.id)
    .eq("workspace_id", ws.workspaceId);

  if (error) {
    return { ok: false, error: error.message };
  }
  revalidatePath("/");
  return { ok: true };
}

const disconnectCalendarSchema = z.object({
  provider: z.enum(["google", "microsoft"]),
});

const proposeMeetingSchema = z.object({
  thread_id: z.string().min(1).max(280),
  provider: z.enum(["google", "microsoft"]),
  start_iso: z.string().min(12).max(44),
  end_iso: z.string().min(12).max(44),
  title: z.string().min(2).max(200).optional(),
  body: z.string().max(4000).optional(),
  attendee_email: z.string().email().optional(),
});

/** Prompt 89 — OAuth connection flags for dashboard meeting scheduler. */
export async function getCalendarConnectionStatusAction(): Promise<CalendarConnectionStatusDTO> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { google: false, microsoft: false };
  }
  const { data, error } = await supabase
    .from("user_calendar_connections")
    .select("provider")
    .eq("user_id", user.id);
  if (error) {
    if (!isMissingColumnOrSchemaError(error.message)) {
      console.warn("[AgentForge] getCalendarConnectionStatus", error.message);
    }
    return { google: false, microsoft: false };
  }
  const set = new Set((data ?? []).map((r) => String((r as { provider?: string }).provider ?? "")));
  return {
    google: set.has("google"),
    microsoft: set.has("microsoft"),
  };
}

export async function disconnectCalendarAction(
  raw: z.input<typeof disconnectCalendarSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = disconnectCalendarSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid provider." };
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "Unauthorized" };
  const { error } = await supabase
    .from("user_calendar_connections")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", parsed.data.provider);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  return { ok: true };
}

/**
 * Prompt 89 — create a calendar event from an AI-suggested slot (Google or Outlook).
 */
export async function proposeMeetingAction(
  raw: z.input<typeof proposeMeetingSchema>,
): Promise<
  | { ok: true; html_link?: string; event_id: string; provider: CalendarProvider }
  | { ok: false; error: string }
> {
  const parsed = proposeMeetingSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Invalid meeting payload." };
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Unauthorized" };
  }

  const { data: camp, error: campErr } = await supabase
    .from("campaigns")
    .select("user_id")
    .eq("thread_id", parsed.data.thread_id)
    .maybeSingle();
  if (campErr || !camp || (camp as { user_id?: string }).user_id !== user.id) {
    return { ok: false, error: "Campaign not found for this thread." };
  }

  const tok = await getValidAccessTokenForUser(supabase, user.id, parsed.data.provider);
  if (!tok) {
    return { ok: false, error: "Connect your calendar first (Google or Microsoft)." };
  }

  const title =
    parsed.data.title?.trim() ||
    `Meeting — ${parsed.data.thread_id.slice(0, 8)} (AgentForge)`;
  const bodyText =
    parsed.data.body?.trim() ||
    `Scheduled via AgentForge Sales.\nThread: ${parsed.data.thread_id}`;

  try {
    if (parsed.data.provider === "google") {
      const ev = await createGoogleCalendarEvent(tok.accessToken, {
        summary: title,
        description: bodyText,
        startIso: parsed.data.start_iso,
        endIso: parsed.data.end_iso,
        attendeeEmail: parsed.data.attendee_email,
      });
      revalidatePath("/");
      return { ok: true, event_id: ev.id, html_link: ev.htmlLink, provider: "google" };
    }
    const ev = await createMicrosoftCalendarEvent(tok.accessToken, {
      summary: title,
      description: bodyText,
      startIso: parsed.data.start_iso,
      endIso: parsed.data.end_iso,
      attendeeEmail: parsed.data.attendee_email,
    });
    revalidatePath("/");
    return { ok: true, event_id: ev.id, html_link: ev.webLink, provider: "microsoft" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Calendar API failed";
    return { ok: false, error: msg };
  }
}

/**
 * Prompt 83 — transcribed calls + living objections for the active workspace (RLS-scoped).
 */
const batchNotifySchema = z.object({
  total: z.number().int().min(1).max(24),
  done: z.number().int().min(0),
  errors: z.number().int().min(0),
});

/**
 * Prompt 84 — fire-and-forget push when a parallel batch run completes (client calls after chunk loop).
 */
export async function notifyBatchRunFinishedAction(
  raw: z.input<typeof batchNotifySchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = batchNotifySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Invalid batch summary." };
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Unauthorized" };
  }
  await notifyBatchFinishedPush(
    user.id,
    parsed.data.total,
    parsed.data.done,
    parsed.data.errors,
  );
  return { ok: true };
}

export async function loadObjectionLibraryForDashboard(): Promise<{
  transcripts: CallTranscriptRow[];
  objections: ObjectionLibraryEntryRow[];
}> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { transcripts: [], objections: [] };
  }
  await ensurePersonalWorkspaceMembership(supabase, user.id);
  const ws = await resolveWorkspaceContext(supabase, {
    id: user.id,
    email: user.email ?? null,
  });
  const workspaceId = ws.workspaceId;

  try {
    const [tRes, oRes] = await Promise.all([
      supabase
        .from("call_transcripts")
        .select(
          "id, created_at, thread_id, twilio_call_sid, transcript, sentiment, summary, objections, insights, recording_duration_sec",
        )
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("objection_library")
        .select("id, objection_text, use_count, last_seen_at, normalized_key")
        .eq("workspace_id", workspaceId)
        .order("last_seen_at", { ascending: false })
        .limit(60),
    ]);

    if (tRes.error) {
      console.warn("[AgentForge] call_transcripts:list", tRes.error.message);
    }
    if (oRes.error) {
      console.warn("[AgentForge] objection_library:list", oRes.error.message);
    }

    return {
      transcripts: (tRes.data ?? []) as CallTranscriptRow[],
      objections: (oRes.data ?? []) as ObjectionLibraryEntryRow[],
    };
  } catch (e) {
    console.warn("[AgentForge] loadObjectionLibraryForDashboard", e);
    return { transcripts: [], objections: [] };
  }
}

export type PreviewLeadEnrichmentResult =
  | { ok: true; enrichment: LeadEnrichmentPayload }
  | { ok: false; error: string };

/**
 * Prompt 82 — preview Tavily/Browserless enrichment before Start Campaign (no graph run).
 */
export async function previewLeadEnrichmentAction(
  raw: z.input<typeof incomingLeadSchema>,
): Promise<PreviewLeadEnrichmentResult> {
  const parsed = incomingLeadSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: Object.values(parsed.error.flatten().fieldErrors)
        .flat()
        .filter(Boolean)
        .join(", "),
    };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Unauthorized" };
  }

  await ensurePersonalWorkspaceMembership(supabase, user.id);

  let lead: Lead = {
    id: parsed.data.id ?? randomUUID(),
    name: parsed.data.name,
    email: parsed.data.email,
    company: parsed.data.company,
    linkedin_url: parsed.data.linkedin_url,
    phone: parsed.data.phone,
    notes: parsed.data.notes,
    status: parsed.data.status,
    sdr_voice_tone: parsed.data.sdr_voice_tone,
    custom_voice_id: parsed.data.custom_voice_id,
    custom_voice_name: parsed.data.custom_voice_name,
  };

  if (lead.custom_voice_id) {
    const profile = await fetchCustomVoiceProfileForUser(user.id, lead.custom_voice_id);
    if (profile) {
      lead = { ...lead, custom_voice_name: profile.name };
    } else {
      lead = { ...lead, custom_voice_id: undefined, custom_voice_name: undefined };
    }
  }

  try {
    const { enrichment } = await runLeadEnrichmentStep(lead);
    return { ok: true, enrichment };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[AgentForge] previewLeadEnrichmentAction", message);
    return { ok: false, error: humanizeServerFailureMessage(message) };
  }
}

/**
 * Lists recent rows from `public.campaigns` for the signed-in user.
 * Uses the user-scoped Supabase client so RLS (`auth.uid() = user_id`) applies.
 */
export async function listRecentCampaigns(): Promise<PersistedCampaignRow[]> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return [];
  }

  await ensurePersonalWorkspaceMembership(supabase, user.id);
  const ctx = await resolveWorkspaceContext(supabase, {
    id: user.id,
    email: user.email ?? null,
  });
  const memberIds = ctx.memberUserIds;
  const sr = getServiceRoleSupabaseOrNull();

  const selectFull =
    "id, thread_id, lead_name, company, email, status, created_at, completed_at, results, spam_score, deliverability_status, ab_test_id, ab_variant";
  const selectWithScore = `${selectFull}, lead_score, priority_reason`;
  const selectWithQual = `${selectWithScore}, qualification_score, detected_objections`;
  const selectMin =
    "id, thread_id, lead_name, company, email, status, created_at, completed_at, results, spam_score, deliverability_status";

  let data: Record<string, unknown>[] | null = null;
  let error: { message: string; code?: string; details?: string } | null = null;

  const runSelect = async (cols: string) => {
    const q = sr
      ? sr.from("campaigns").select(cols).in("user_id", memberIds)
      : supabase.from("campaigns").select(cols).eq("user_id", user.id);
    return q.order("created_at", { ascending: false }).limit(25);
  };

  const zeroth = await runSelect(selectWithQual);
  if (zeroth.error && isMissingColumnOrSchemaError(zeroth.error.message)) {
    const first = await runSelect(selectWithScore);
    if (first.error && isMissingColumnOrSchemaError(first.error.message)) {
      const second = await runSelect(selectFull);
      if (second.error && isMissingColumnOrSchemaError(second.error.message)) {
        const third = await runSelect(selectMin);
        data = (third.data ?? null) as Record<string, unknown>[] | null;
        error = third.error;
      } else {
        data = (second.data ?? null) as Record<string, unknown>[] | null;
        error = second.error;
      }
    } else {
      data = (first.data ?? null) as Record<string, unknown>[] | null;
      error = first.error;
    }
  } else {
    data = (zeroth.data ?? null) as Record<string, unknown>[] | null;
    error = zeroth.error;
  }

  if (error) {
    console.error(
      "[AgentForge] listRecentCampaigns",
      error.message,
      error.code,
      error.details,
    );
    return [];
  }

  if (!data || !Array.isArray(data)) {
    return [];
  }

  return data.map((row) => {
    const results = (row as { results?: unknown }).results;
    const r = row as {
      spam_score?: unknown;
      deliverability_status?: unknown;
      ab_test_id?: unknown;
      ab_variant?: unknown;
      lead_score?: unknown;
      priority_reason?: unknown;
      qualification_score?: unknown;
      detected_objections?: unknown;
    };
    const snap = results as Record<string, unknown> | undefined;
    const enrichmentFromSnapshot =
      snap?.lead_enrichment_preview &&
      typeof snap.lead_enrichment_preview === "object"
        ? (snap.lead_enrichment_preview as LeadEnrichmentPayload)
        : null;
    return {
      id: String(row.id),
      thread_id: String(row.thread_id),
      lead_name: String(row.lead_name ?? ""),
      company: String(row.company ?? ""),
      email: String(row.email ?? ""),
      status: String(row.status ?? ""),
      created_at: String(row.created_at ?? ""),
      completed_at: row.completed_at != null ? String(row.completed_at) : null,
      sdr_voice_label: parseSdrVoiceLabelFromResults(results),
      rerun_lead: parseRerunLeadFromResults(results),
      spam_score: typeof r.spam_score === "number" ? r.spam_score : null,
      deliverability_status:
        typeof r.deliverability_status === "string" ? r.deliverability_status : null,
      enriched_data: enrichmentFromSnapshot,
      ab_test_id:
        typeof r.ab_test_id === "string" && r.ab_test_id.trim() ? r.ab_test_id.trim() : null,
      ab_variant:
        r.ab_variant === "A" || r.ab_variant === "B" ? r.ab_variant : null,
      lead_score:
        r.lead_score && typeof r.lead_score === "object" && !Array.isArray(r.lead_score)
          ? (r.lead_score as Record<string, unknown>)
          : null,
      priority_reason:
        typeof r.priority_reason === "string" && r.priority_reason.trim()
          ? r.priority_reason.trim()
          : null,
      qualification_score:
        typeof r.qualification_score === "number" && Number.isFinite(r.qualification_score)
          ? Math.round(r.qualification_score)
          : null,
      detected_objections:
        r.detected_objections != null ? r.detected_objections : undefined,
    };
  });
}

export async function listCampaignThreads(): Promise<CampaignThreadRow[]> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return [];
    }
    await ensurePersonalWorkspaceMembership(supabase, user.id);
    const ctx = await resolveWorkspaceContext(supabase, {
      id: user.id,
      email: user.email ?? null,
    });
    const memberIds = ctx.memberUserIds;

    const sb = getServiceRoleSupabaseOrNull();
    if (!sb) {
      console.warn(
        "[AgentForge] listCampaignThreads: service role unavailable — returning no threads (check SUPABASE_SERVICE_ROLE_KEY).",
      );
      return [];
    }

    const primary = await sb
      .from("agent_graph_checkpoints")
      .select("thread_id, updated_at, state")
      .in("user_id", memberIds)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (primary.error) {
      logCheckpointListError("primary (thread_id, updated_at, state)", primary.error);
      const fallback = await sb
        .from("agent_graph_checkpoints")
        .select("thread_id, updated_at")
        .in("user_id", memberIds)
        .order("updated_at", { ascending: false })
        .limit(50);

      if (fallback.error) {
        logCheckpointListError("fallback (thread_id, updated_at only)", fallback.error);
        return [];
      }

      return (fallback.data ?? []).map((row) => ({
        thread_id: String((row as { thread_id?: unknown }).thread_id ?? ""),
        updated_at: String((row as { updated_at?: unknown }).updated_at ?? ""),
        lead_preview: undefined,
        company_preview: undefined,
        current_agent: undefined,
        outreach_sent: false,
        sdr_voice_label: null,
      }));
    }

    return (primary.data ?? []).map((row) =>
      mapCheckpointRowToThread(row as CheckpointRowInput),
    );
  } catch (e) {
    console.error("[AgentForge] listCampaignThreads unexpected exception", e);
    return [];
  }
}

/**
 * **Server action for the dashboard** — safe to import from `"use client"` modules.
 * File-level `"use server"` registers the action; this is the supported entry for form submit + Re-run auto-start (Prompt 24).
 */
export async function startCampaignAction(
  raw: z.input<typeof incomingLeadSchema>,
): Promise<StartCampaignResult> {
  return startCampaign(raw);
}

const updateSmartFollowUpStepSchema = z.object({
  thread_id: z.string().min(1).max(280),
  step_index: z.number().int().min(0).max(5),
  approval_status: z.enum(["approved", "skipped", "pending_review"]),
});

export type UpdateSmartFollowUpStepResult =
  | { ok: true; snapshot: CampaignClientSnapshot }
  | { ok: false; error: string };

/**
 * Prompt 91 — persist per-step approval for the smart follow-up engine (service role update).
 */
export async function updateSmartFollowUpStepAction(
  raw: z.input<typeof updateSmartFollowUpStepSchema>,
): Promise<UpdateSmartFollowUpStepResult> {
  const parsed = updateSmartFollowUpStepSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Invalid follow-up update." };
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Unauthorized" };
  }

  const sr = getServiceRoleSupabaseOrNull();
  if (!sr) {
    return { ok: false, error: "Campaign update unavailable (service role)." };
  }

  const { data: row, error: fetchErr } = await sr
    .from("campaigns")
    .select("results, user_id")
    .eq("thread_id", parsed.data.thread_id)
    .maybeSingle();
  if (fetchErr || !row) {
    return { ok: false, error: "Campaign not found." };
  }
  if (String((row as { user_id?: unknown }).user_id) !== user.id) {
    return { ok: false, error: "Not your campaign." };
  }

  const resultsRaw = (row as { results?: unknown }).results;
  if (!resultsRaw || typeof resultsRaw !== "object" || Array.isArray(resultsRaw)) {
    return { ok: false, error: "No campaign snapshot." };
  }
  const results = { ...(resultsRaw as Record<string, unknown>) };
  const engine = results.smart_follow_up_engine as SmartFollowUpEngineState | undefined;
  if (!engine?.steps?.length) {
    return { ok: false, error: "No follow-up engine on this run." };
  }
  const idx = parsed.data.step_index;
  if (idx < 0 || idx >= engine.steps.length) {
    return { ok: false, error: "Invalid step." };
  }

  const steps = engine.steps.map((s, i) =>
    i === idx ? { ...s, approval_status: parsed.data.approval_status } : s,
  );
  const nextEngine: SmartFollowUpEngineState = { ...engine, steps };
  results["smart_follow_up_engine"] = structuredClone(nextEngine) as unknown;

  const approval = deriveFollowUpApprovalStatus(steps);
  const nextAt = nextFollowUpSendIso(steps);

  const patch: Record<string, unknown> = {
    results,
    follow_up_engine_snapshot: nextEngine as unknown as Record<string, unknown>,
    follow_up_approval_status: approval,
    follow_up_next_send_at: nextAt,
  };

  let { error: upErr } = await sr
    .from("campaigns")
    .update(patch)
    .eq("thread_id", parsed.data.thread_id)
    .eq("user_id", user.id);

  if (
    upErr &&
    /follow_up_engine_snapshot|follow_up_approval_status|follow_up_next_send_at|column|schema/i.test(
      `${upErr.message} ${upErr.details ?? ""}`,
    )
  ) {
    ({ error: upErr } = await sr
      .from("campaigns")
      .update({ results })
      .eq("thread_id", parsed.data.thread_id)
      .eq("user_id", user.id));
  }

  if (upErr) {
    console.warn("[AgentForge] updateSmartFollowUpStepAction", upErr.message);
    return { ok: false, error: "Could not save approval." };
  }

  const snap = snapshotFromPersistedResults(results);
  if (!snap) {
    return { ok: false, error: "Could not read snapshot." };
  }

  revalidatePath("/");
  return { ok: true, snapshot: snap };
}

const sendOutreachEmailSchema = z.object({
  thread_id: z.string().min(1).max(260),
});

export type SendOutreachEmailResult =
  | {
      ok: true;
      snapshot: CampaignClientSnapshot;
      deliverability?: {
        inboxHealthScore: number;
        status: string;
        flags: string[];
      };
    }
  | { ok: false; error: string };

/**
 * Prompt 73 — sends the stored outreach draft via Resend (manual button); updates campaign row + checkpoint.
 */
export async function sendOutreachEmailAction(
  raw: z.input<typeof sendOutreachEmailSchema>,
): Promise<SendOutreachEmailResult> {
  const parsed = sendOutreachEmailSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Invalid thread." };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Unauthorized" };
  }

  const userSignupEmail =
    typeof user.email === "string" && user.email.trim().length > 0
      ? user.email.trim()
      : null;
  if (!userSignupEmail) {
    return { ok: false, error: "Account email missing — cannot set Reply-To." };
  }

  await ensurePersonalWorkspaceMembership(supabase, user.id);
  const ws = await resolveWorkspaceContext(supabase, {
    id: user.id,
    email: user.email ?? null,
  });
  const memberIds = ws.memberUserIds;
  const sr = getServiceRoleSupabaseOrNull();

  const q = sr
    ? sr
        .from("campaigns")
        .select("results")
        .eq("thread_id", parsed.data.thread_id)
        .in("user_id", memberIds)
        .maybeSingle()
    : supabase
        .from("campaigns")
        .select("results")
        .eq("thread_id", parsed.data.thread_id)
        .eq("user_id", user.id)
        .maybeSingle();

  const { data: row, error: rowError } = await q;

  if (rowError || row?.results == null) {
    return { ok: false, error: "Campaign not found." };
  }

  const snap = row.results as CampaignClientSnapshot;
  const oo = snap.outreach_output;
  if (!oo || oo.resend_status !== "ready_to_send" || oo.email_sent) {
    return { ok: false, error: "Nothing to send or email already sent." };
  }

  let senderName = snap.sender_signoff_name?.trim() ?? "";
  if (!senderName) {
    if (typeof user.user_metadata?.full_name === "string") {
      senderName = user.user_metadata.full_name.trim();
    }
    const { data: profileForSignoff } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    if (profileForSignoff?.full_name?.trim()) {
      senderName = profileForSignoff.full_name.trim();
    }
  }

  const preSendDv = analyzeDeliverability(oo.subject, oo.email_body);

  warnIfResendNotConfigured();
  const send = await sendTransactionalEmail({
    to: snap.lead.email,
    subject: oo.subject,
    html: oo.email_body,
    from: buildDynamicFromEmail(senderName || null),
    reply_to: userSignupEmail,
  });

  if (!send.ok) {
    return { ok: false, error: send.error };
  }

  const updatedOutreach: OutreachOutput = {
    ...oo,
    email_sent: true,
    send_error: undefined,
    resend_status: "delivered",
  };

  const updatedLead: Lead = { ...snap.lead, status: "contacted" };

  const oNodePrev = snap.results?.outreach_node;
  const outreachNodeResult: Record<string, unknown> = {
    ...(typeof oNodePrev === "object" && oNodePrev !== null && !Array.isArray(oNodePrev)
      ? (oNodePrev as Record<string, unknown>)
      : {}),
    ...updatedOutreach,
  };

  const snap2: CampaignClientSnapshot = {
    ...snap,
    lead: updatedLead,
    outreach_output: updatedOutreach,
    sender_signoff_name: (senderName || snap.sender_signoff_name) ?? null,
    results: {
      ...snap.results,
      outreach_node: outreachNodeResult,
    },
  };

  await mergeDashboardState(parsed.data.thread_id, user.id, {
    lead: updatedLead,
    outreach_output: updatedOutreach,
    outreach_sent: true,
    results: { outreach_node: outreachNodeResult },
  });

  await persistCampaignToDatabase({
    userId: user.id,
    threadId: parsed.data.thread_id,
    lead: updatedLead,
    snapshot: snap2,
    deliverability: {
      spam_score: preSendDv.inboxHealthScore,
      deliverability_status: preSendDv.deliverabilityStatus,
    },
  });

  revalidatePath("/");
  revalidatePath("/analytics");

  return {
    ok: true,
    snapshot: snap2,
    deliverability: {
      inboxHealthScore: preSendDv.inboxHealthScore,
      status: preSendDv.deliverabilityStatus,
      flags: preSendDv.flags,
    },
  };
}

/**
 * Prompt 80 — full warm-up + chart payload for the Deliverability tab.
 */
export async function getDeliverabilitySuiteAction(): Promise<DeliverabilitySuitePayload | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const today = new Date();
  const isoToday = today.toISOString().slice(0, 10);
  const fourteen = new Date(today);
  fourteen.setDate(fourteen.getDate() - 14);
  const iso14 = fourteen.toISOString().slice(0, 10);
  const seven = new Date(today);
  seven.setDate(seven.getDate() - 7);
  const isoSeven = seven.toISOString().slice(0, 10);

  const [prefsRes, logsRes, logs7Res, todayRes] = await Promise.all([
    supabase
      .from("user_deliverability_prefs")
      .select("warmup_enabled")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("email_warmup_logs")
      .select("log_date, emails_sent, inbox_placement_score")
      .eq("user_id", user.id)
      .gte("log_date", iso14)
      .order("log_date", { ascending: true }),
    supabase
      .from("email_warmup_logs")
      .select("emails_sent, inbox_placement_score")
      .eq("user_id", user.id)
      .gte("log_date", isoSeven)
      .lte("log_date", isoToday),
    supabase
      .from("email_warmup_logs")
      .select("emails_sent, inbox_placement_score")
      .eq("user_id", user.id)
      .eq("log_date", isoToday)
      .maybeSingle(),
  ]);

  if (prefsRes.error) {
    console.warn("[AgentForge] getDeliverabilitySuiteAction prefs", prefsRes.error.message);
  }
  if (logsRes.error) {
    console.warn("[AgentForge] getDeliverabilitySuiteAction logs", logsRes.error.message);
  }

  const warmupEnabled =
    prefsRes.data != null &&
    typeof (prefsRes.data as { warmup_enabled?: unknown }).warmup_enabled === "boolean"
      ? Boolean((prefsRes.data as { warmup_enabled: boolean }).warmup_enabled)
      : false;

  const logs14d = (logsRes.data ?? []).map((row) => {
    const r = row as {
      log_date?: unknown;
      emails_sent?: unknown;
      inbox_placement_score?: unknown;
    };
    return {
      log_date: String(r.log_date ?? ""),
      emails_sent: typeof r.emails_sent === "number" ? r.emails_sent : 0,
      inbox_placement_score:
        typeof r.inbox_placement_score === "number" ? r.inbox_placement_score : 0,
    };
  });

  let emailsSentLast7Days = 0;
  const place7: number[] = [];
  for (const row of logs7Res.data ?? []) {
    const r = row as { emails_sent?: unknown; inbox_placement_score?: unknown };
    emailsSentLast7Days += typeof r.emails_sent === "number" ? r.emails_sent : 0;
    if (typeof r.emails_sent === "number" && r.emails_sent > 0) {
      if (typeof r.inbox_placement_score === "number") place7.push(r.inbox_placement_score);
    }
  }

  const avgPlacementLast7d =
    place7.length > 0
      ? Math.round(place7.reduce((a, b) => a + b, 0) / place7.length)
      : null;

  const todayRow = todayRes.data as { emails_sent?: unknown; inbox_placement_score?: unknown } | null;
  const todayEmails = typeof todayRow?.emails_sent === "number" ? todayRow.emails_sent : 0;
  const todayPlacement =
    typeof todayRow?.inbox_placement_score === "number" ? todayRow.inbox_placement_score : null;

  return {
    warmupEnabled,
    logs14d,
    emailsSentLast7Days,
    avgPlacementLast7d,
    todayEmails,
    todayPlacement,
  };
}

const warmupToggleSchema = z.object({
  enabled: z.boolean(),
});

export type SetWarmupEnabledResult = { ok: true } | { ok: false; error: string };

/** Prompt 80 — enable/disable warm-up tracking. */
export async function setWarmupEnabledAction(
  raw: z.input<typeof warmupToggleSchema>,
): Promise<SetWarmupEnabledResult> {
  const parsed = warmupToggleSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "Unauthorized" };

  const { error } = await supabase.from("user_deliverability_prefs").upsert(
    {
      user_id: user.id,
      warmup_enabled: parsed.data.enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("[AgentForge] setWarmupEnabledAction", error.message);
    return {
      ok: false,
      error:
        error.message.includes("user_deliverability_prefs") || error.code === "42P01"
          ? "Run supabase/email_deliverability.sql in Supabase."
          : error.message,
    };
  }
  revalidatePath("/");
  revalidatePath("/analytics");
  return { ok: true };
}

export type RecordWarmupEmailResult = { ok: true } | { ok: false; error: string };

/**
 * Prompt 80 — record one warm-up send for today (simulated; no outbound mail).
 * Caps at 50/day per user.
 */
export async function recordWarmupEmailAction(): Promise<RecordWarmupEmailResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "Unauthorized" };

  const isoToday = new Date().toISOString().slice(0, 10);

  const { data: existing, error: readErr } = await supabase
    .from("email_warmup_logs")
    .select("emails_sent")
    .eq("user_id", user.id)
    .eq("log_date", isoToday)
    .maybeSingle();

  if (readErr) {
    console.error("[AgentForge] recordWarmupEmailAction", readErr.message);
    return {
      ok: false,
      error:
        readErr.message.includes("email_warmup_logs") || readErr.code === "42P01"
          ? "Run supabase/email_deliverability.sql in Supabase."
          : readErr.message,
    };
  }

  const prev = typeof existing?.emails_sent === "number" ? existing.emails_sent : 0;
  const next = Math.min(50, prev + 1);
  const inbox_placement_score = placementScoreForDailyLog(next);

  const { error } = await supabase.from("email_warmup_logs").upsert(
    {
      user_id: user.id,
      log_date: isoToday,
      emails_sent: next,
      inbox_placement_score,
    },
    { onConflict: "user_id,log_date" },
  );

  if (error) {
    console.error("[AgentForge] recordWarmupEmailAction upsert", error.message);
    return { ok: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/analytics");
  return { ok: true };
}

const spamCheckSchema = z.object({
  subject: z.string().max(500).optional(),
  html: z.string().max(200_000).optional(),
});

export type SpamCheckResult =
  | {
      ok: true;
      inboxHealthScore: number;
      spamRiskScore: number;
      status: string;
      flags: string[];
      estimatedWeekPlacement: number;
    }
  | { ok: false; error: string };

/** Prompt 80 — offline spam / inbox-health check (before send). */
export async function checkSpamScoreAction(
  raw: z.input<typeof spamCheckSchema>,
): Promise<SpamCheckResult> {
  const parsed = spamCheckSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Invalid payload." };
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "Unauthorized" };

  const a = analyzeDeliverability(parsed.data.subject ?? "", parsed.data.html ?? "");

  const seven = new Date();
  seven.setDate(seven.getDate() - 7);
  const isoSeven = seven.toISOString().slice(0, 10);
  const isoToday = new Date().toISOString().slice(0, 10);

  const { data: warmRows } = await supabase
    .from("email_warmup_logs")
    .select("emails_sent")
    .eq("user_id", user.id)
    .gte("log_date", isoSeven)
    .lte("log_date", isoToday);

  let emailsSentLast7Days = 0;
  for (const row of warmRows ?? []) {
    const n = (row as { emails_sent?: unknown }).emails_sent;
    if (typeof n === "number") emailsSentLast7Days += n;
  }

  const estimatedWeekPlacement = inboxPlacementFromWarmupVolume(emailsSentLast7Days);

  return {
    ok: true,
    inboxHealthScore: a.inboxHealthScore,
    spamRiskScore: a.spamRiskScore,
    status: a.deliverabilityStatus,
    flags: a.flags,
    estimatedWeekPlacement,
  };
}

const pasteReplySchema = z.object({
  text: z.string().min(1).max(12_000),
  thread_id: z
    .string()
    .max(240)
    .optional()
    .transform((s) => (s && s.trim() ? s.trim() : undefined)),
  company: z
    .string()
    .max(500)
    .optional()
    .transform((s) => (s && s.trim() ? s.trim() : undefined)),
  lead_name: z
    .string()
    .max(200)
    .optional()
    .transform((s) => (s && s.trim() ? s.trim() : undefined)),
  prospect_email: z
    .string()
    .max(320)
    .optional()
    .transform((s) => (s && s.trim() ? s.trim() : undefined)),
});

export type AnalyzeProspectReplyResult =
  | {
      ok: true;
      analysis: ReplyAnalysisWithLabels;
      /** False when LLM succeeded but DB insert failed (user still sees analysis). */
      persisted: boolean;
      persistError?: string;
    }
  | { ok: false; error: string };

/**
 * Prompt 45 + 52 — Analyze prospect reply, then persist to `reply_analyses` (service role when configured).
 */
export async function analyzeProspectReplyAction(
  raw: z.input<typeof pasteReplySchema>,
): Promise<AnalyzeProspectReplyResult> {
  const parsed = pasteReplySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Add reply text (up to ~12k characters)." };
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Unauthorized" };
  }
  if (!hasLlmProviderConfigured()) {
    return { ok: false, error: "Configure GROQ_API_KEY (or Anthropic) to run reply analysis." };
  }
  try {
    await ensurePersonalWorkspaceMembership(supabase, user.id);
    const ws = await resolveWorkspaceContext(supabase, {
      id: user.id,
      email: user.email ?? null,
    });
    const wl = await fetchWhiteLabelSettings(supabase, ws.workspaceId);
    const core = await analyzeProspectReply(parsed.data.text, wl.brandSignoff);
    const analysis = replyAnalysisWithLabels(core);
    const fullText = parsed.data.text.trim();
    const preview = fullText.replace(/\s+/g, " ").slice(0, 280);
    const analysisObj = JSON.parse(JSON.stringify(analysis)) as Record<string, unknown>;
    const minimalRow: Record<string, unknown> = {
      user_id: user.id,
      thread_id: parsed.data.thread_id ?? null,
      company: parsed.data.company ?? null,
      lead_name: parsed.data.lead_name ?? null,
      reply_preview: preview || fullText.slice(0, 120),
      reply_full: fullText.slice(0, 12_000),
      analysis: analysisObj,
    };
    const fullRow: Record<string, unknown> = {
      ...minimalRow,
      prospect_email: parsed.data.prospect_email ?? null,
      sentiment: analysis.sentiment,
      interest_score: analysis.interest_level_0_to_10,
      suggested_voice: analysis.suggested_voice,
      next_step: analysis.suggested_next_nurture_step,
      objections: analysis.objections_detected,
    };
    const inserted = await insertReplyAnalysisRow(supabase, fullRow, minimalRow);
    if (inserted.ok) {
      void notifyNewReplySavedPush(user.id, preview || fullText.slice(0, 200)).catch(() => {});
      revalidatePath("/");
      revalidatePath("/replies");
      revalidatePath("/analytics");
      return { ok: true, analysis, persisted: true };
    }
    return {
      ok: true,
      analysis,
      persisted: false,
      persistError:
        inserted.error +
        " — Run supabase/reply-analyses.sql (and reply-analyses-p52-migration.sql if the table already existed). Ensure SUPABASE_SERVICE_ROLE_KEY is set for reliable saves.",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Analysis failed";
    console.error("[AgentForge] analyzeProspectReplyAction", e);
    return { ok: false, error: msg };
  }
}

/**
 * Saved Paste Reply rows for the signed-in user (newest first).
 */
export async function listProspectReplies(): Promise<PersistedReplyAnalysisRow[]> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return [];
  }
  const { data, error } = await queryReplyAnalysesForList(supabase, user.id);
  if (error) {
    console.error("[AgentForge] listProspectReplies", error.message);
    return [];
  }
  if (!data?.length) return [];
  const out: PersistedReplyAnalysisRow[] = [];
  for (const row of data) {
    const r = row as Record<string, unknown>;
    const analysis = mergeReplyRowIntoAnalysisPayload(r);
    if (!analysis) continue;
    const fullRaw = r.reply_full;
    const reply_full =
      typeof fullRaw === "string" && fullRaw.trim() ? fullRaw.trim() : null;
    out.push({
      id: String(r.id ?? ""),
      created_at: String(r.created_at ?? ""),
      thread_id: r.thread_id != null ? String(r.thread_id) : null,
      company: r.company != null ? String(r.company) : null,
      lead_name: r.lead_name != null ? String(r.lead_name) : null,
      prospect_email:
        r.prospect_email != null && String(r.prospect_email).trim()
          ? String(r.prospect_email).trim()
          : null,
      reply_preview: String(r.reply_preview ?? ""),
      reply_full,
      analysis,
    });
  }
  return out;
}

function buildAbTestComparisonsFromRows(
  rows: Record<string, unknown>[] | null | undefined,
  interestByThread: Map<string, number>,
): AbTestComparisonRow[] {
  if (!rows?.length) return [];
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const id = typeof r.ab_test_id === "string" ? r.ab_test_id : "";
    if (!id) continue;
    const v = String(r.ab_variant || "").toUpperCase();
    if (v !== "A" && v !== "B") continue;
    const list = groups.get(id) ?? [];
    list.push(r);
    groups.set(id, list);
  }
  const out: AbTestComparisonRow[] = [];
  for (const [abId, list] of groups) {
    const as = list.filter((r) => String(r.ab_variant || "").toUpperCase() === "A");
    const bs = list.filter((r) => String(r.ab_variant || "").toUpperCase() === "B");
    if (as.length === 0 || bs.length === 0) continue;

    if (as.length === 1 && bs.length === 1) {
      const pairA = as[0]!;
      const pairB = bs[0]!;
      const snapA = snapshotFromCampaignResults(pairA.results);
      const snapB = snapshotFromCampaignResults(pairB.results);
      if (!snapA || !snapB) continue;
      const ca = computeCampaignStrength(snapA);
      const cb = computeCampaignStrength(snapB);
      const tidA = String(pairA.thread_id ?? "");
      const tidB = String(pairB.thread_id ?? "");
      const ia = interestByThread.get(tidA) ?? null;
      const ib = interestByThread.get(tidB) ?? null;
      const oa = computeAutoOptimizationScore({ snapshot: snapA, replyInterest0to10: ia });
      const ob = computeAutoOptimizationScore({ snapshot: snapB, replyInterest0to10: ib });
      const winner = pickAbWinner(oa, ob);
      const rec = autoOptimizationRecommendation(
        winner,
        oa,
        ob,
        snapA.lead ? voiceLabelForLead(snapA.lead) : "Variant A",
        snapB.lead ? voiceLabelForLead(snapB.lead) : "Variant B",
      );
      out.push({
        ab_test_id: abId,
        lead_name: String(pairA.lead_name ?? pairB.lead_name ?? "Lead"),
        completed_at: String(pairB.completed_at ?? pairA.completed_at ?? ""),
        variantA: {
          thread_id: tidA,
          composite: ca.composite,
          qual: ca.qual,
          icp: ca.icp,
          voice_label: snapA.lead ? voiceLabelForLead(snapA.lead) : "—",
        },
        variantB: {
          thread_id: tidB,
          composite: cb.composite,
          qual: cb.qual,
          icp: cb.icp,
          voice_label: snapB.lead ? voiceLabelForLead(snapB.lead) : "—",
        },
        optimization_score_a: oa,
        optimization_score_b: ob,
        winner_variant: winner,
        winner_recommendation: rec,
        reply_interest_a: ia,
        reply_interest_b: ib,
        meeting_signal_a: meetingSchedulingSignal(snapA),
        meeting_signal_b: meetingSchedulingSignal(snapB),
      });
      continue;
    }

    const campaignRows = list.map((r) => ({
      ab_variant: String(r.ab_variant ?? ""),
      thread_id: String(r.thread_id ?? ""),
      results: r.results,
    }));
    const agg = aggregateBatchAbOptimization(campaignRows, interestByThread);
    const firstA = as[0]!;
    const firstB = bs[0]!;
    const snapA = snapshotFromCampaignResults(firstA.results);
    const snapB = snapshotFromCampaignResults(firstB.results);
    if (!snapA || !snapB) continue;
    const rec = autoOptimizationRecommendation(
      agg.winner,
      agg.meanA,
      agg.meanB,
      `Variant A (${as.length} runs)`,
      `Variant B (${bs.length} runs)`,
    );
    out.push({
      ab_test_id: abId,
      lead_name: `A/B batch · ${as.length}×A / ${bs.length}×B`,
      completed_at: String(
        bs[bs.length - 1]!.completed_at ?? as[as.length - 1]!.completed_at ?? "",
      ),
      is_batch: true,
      batch_pair_count: Math.min(as.length, bs.length),
      variantA: {
        thread_id: `(batch ${as.length})`,
        composite: Math.round(agg.meanA),
        qual: null,
        icp: null,
        voice_label: `A · ${as.length} runs`,
      },
      variantB: {
        thread_id: `(batch ${bs.length})`,
        composite: Math.round(agg.meanB),
        qual: null,
        icp: null,
        voice_label: `B · ${bs.length} runs`,
      },
      optimization_score_a: agg.meanA,
      optimization_score_b: agg.meanB,
      winner_variant: agg.winner,
      winner_recommendation: rec,
      reply_interest_a: null,
      reply_interest_b: null,
      meeting_signal_a: meetingSchedulingSignal(snapA),
      meeting_signal_b: meetingSchedulingSignal(snapB),
    });
  }
  out.sort((a, b) => b.completed_at.localeCompare(a.completed_at));
  return out.slice(0, 24);
}

const EMPTY_ANALYTICS: DashboardAnalyticsSummary = {
  campaignCount: 0,
  avgCompositeScore: null,
  replyAnalyzedCount: 0,
  avgReplyInterest: null,
  strengthBuckets: [
    { label: "0–39", count: 0, pct: 0 },
    { label: "40–59", count: 0, pct: 0 },
    { label: "60–79", count: 0, pct: 0 },
    { label: "80–100", count: 0, pct: 0 },
  ],
  liveSignalsFeed: [],
  estimatedPipelineValueUsd: 0,
  estimatedRoiMultiplier: 0,
  avgInboxHealthScore: null,
  deliverabilitySampleCount: 0,
  warmupEmailsLast7Days: 0,
  avgWarmupPlacementScore: null,
  warmupEnabled: false,
  abTestComparisons: [],
  forecastWeightedPipelineUsd: 0,
  forecastTotalPipelineUsd: 0,
  forecastAvgWinProbability: null,
  forecastDealCount: 0,
  forecastTrend: [],
  leadPriorityLeaderboard: [],
  leadPrioritySummary: null,
  qualificationInsights: [],
  replyObjectionCards: [],
};

/**
 * Campaign + reply aggregates for the Analytics page (Prompt 50).
 */
export async function getDashboardAnalytics(): Promise<DashboardAnalyticsSummary> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return EMPTY_ANALYTICS;
  }
  await ensurePersonalWorkspaceMembership(supabase, user.id);
  const ws = await resolveWorkspaceContext(supabase, {
    id: user.id,
    email: user.email ?? null,
  });
  const memberIds = ws.memberUserIds;
  const sr = getServiceRoleSupabaseOrNull();
  const campaignsReader = sr ?? supabase;

  const today = new Date();
  const sevenAgo = new Date(today);
  sevenAgo.setDate(sevenAgo.getDate() - 7);
  const isoSeven = sevenAgo.toISOString().slice(0, 10);
  const isoToday = today.toISOString().slice(0, 10);

  const campSelectFull =
    "results, thread_id, completed_at, predicted_revenue, win_probability, lead_name, company, email, qualification_score";
  const campSelectMid =
    "results, thread_id, completed_at, predicted_revenue, win_probability, lead_name, company, email";
  const campSelectNarrow =
    "results, thread_id, completed_at, predicted_revenue, win_probability";
  const campSelectMin = "results, thread_id, completed_at";

  let campRes = await campaignsReader
    .from("campaigns")
    .select(campSelectFull)
    .in("user_id", memberIds)
    .limit(500);
  if (campRes.error && isMissingColumnOrSchemaError(campRes.error.message)) {
    campRes = (await campaignsReader
      .from("campaigns")
      .select(campSelectMid)
      .in("user_id", memberIds)
      .limit(500)) as typeof campRes;
  }
  if (campRes.error && isMissingColumnOrSchemaError(campRes.error.message)) {
    campRes = (await campaignsReader
      .from("campaigns")
      .select(campSelectNarrow)
      .in("user_id", memberIds)
      .limit(500)) as typeof campRes;
  }
  if (campRes.error && isMissingColumnOrSchemaError(campRes.error.message)) {
    campRes = (await campaignsReader
      .from("campaigns")
      .select(campSelectMin)
      .in("user_id", memberIds)
      .limit(500)) as typeof campRes;
  }

  const [replyRows, replyThreadRes, replyObjectionRows, liveSignalsFeed, spamRowsRes, prefsRes, warmup7Res, abTestRes] =
    await Promise.all([
      queryReplyRowsForAnalytics(campaignsReader, memberIds),
      campaignsReader
        .from("reply_analyses")
        .select("thread_id, prospect_email, interest_score, analysis")
        .in("user_id", memberIds)
        .limit(3000),
      queryReplyObjectionRowsForAnalytics(campaignsReader, memberIds),
      queryCampaignSignalsFeed(campaignsReader, memberIds),
      campaignsReader
        .from("campaigns")
        .select("spam_score")
        .in("user_id", memberIds)
        .limit(500),
      campaignsReader
        .from("user_deliverability_prefs")
        .select("warmup_enabled")
        .eq("user_id", ws.workspaceId)
        .maybeSingle(),
      campaignsReader
        .from("email_warmup_logs")
        .select("emails_sent, inbox_placement_score")
        .in("user_id", memberIds)
        .gte("log_date", isoSeven)
        .lte("log_date", isoToday),
      campaignsReader
        .from("campaigns")
        .select("ab_test_id, ab_variant, thread_id, lead_name, results, completed_at")
        .in("user_id", memberIds)
        .not("ab_test_id", "is", null)
        .order("completed_at", { ascending: false })
        .limit(400),
    ]);

  if (campRes.error) {
    console.error("[AgentForge] getDashboardAnalytics campaigns", campRes.error.message);
  }
  if (spamRowsRes.error) {
    console.warn("[AgentForge] getDashboardAnalytics spam_score", spamRowsRes.error.message);
  }
  if (prefsRes.error) {
    console.warn("[AgentForge] getDashboardAnalytics deliverability_prefs", prefsRes.error.message);
  }
  if (warmup7Res.error) {
    console.warn("[AgentForge] getDashboardAnalytics warmup_logs", warmup7Res.error.message);
  }
  if (abTestRes.error && !isMissingColumnOrSchemaError(abTestRes.error.message)) {
    console.warn("[AgentForge] getDashboardAnalytics ab_tests", abTestRes.error.message);
  }
  if (replyThreadRes.error && !isMissingColumnOrSchemaError(replyThreadRes.error.message)) {
    console.warn("[AgentForge] getDashboardAnalytics reply thread map", replyThreadRes.error.message);
  }

  const replyRowsForInterest = replyThreadRes.error
    ? []
    : ((replyThreadRes.data ?? []) as Record<string, unknown>[]);
  const interestByThread = buildReplyInterestByThreadMap(replyRowsForInterest);
  const interestByEmail = buildReplyInterestByEmailMap(replyRowsForInterest);

  const abTestComparisons = abTestRes.error
    ? []
    : buildAbTestComparisonsFromRows(
        (abTestRes.data ?? []) as Record<string, unknown>[],
        interestByThread,
      );

  const spamScores: number[] = [];
  for (const row of spamRowsRes.data ?? []) {
    const n = (row as { spam_score?: unknown }).spam_score;
    if (typeof n === "number" && !Number.isNaN(n)) spamScores.push(n);
  }
  const deliverabilitySampleCount = spamScores.length;
  const avgInboxHealthScore =
    deliverabilitySampleCount > 0
      ? Math.round(spamScores.reduce((a, b) => a + b, 0) / deliverabilitySampleCount)
      : null;

  let warmupEmailsLast7Days = 0;
  const placements: number[] = [];
  for (const row of warmup7Res.data ?? []) {
    const r = row as { emails_sent?: unknown; inbox_placement_score?: unknown };
    const es = typeof r.emails_sent === "number" ? r.emails_sent : 0;
    warmupEmailsLast7Days += es;
    if (es > 0 && typeof r.inbox_placement_score === "number") {
      placements.push(r.inbox_placement_score);
    }
  }
  const avgWarmupPlacementScore =
    placements.length > 0
      ? Math.round(placements.reduce((a, b) => a + b, 0) / placements.length)
      : null;

  const warmupEnabled =
    prefsRes.data != null &&
    typeof (prefsRes.data as { warmup_enabled?: unknown }).warmup_enabled === "boolean"
      ? Boolean((prefsRes.data as { warmup_enabled: boolean }).warmup_enabled)
      : false;

  const composites: number[] = [];
  const buckets = [0, 0, 0, 0];
  let forecastWeightedPipelineUsd = 0;
  let forecastTotalPipelineUsd = 0;
  let forecastWinSum = 0;
  let forecastDealCount = 0;
  const weekMap = new Map<string, { weighted: number; count: number }>();

  for (const row of campRes.data ?? []) {
    const snap = snapshotFromPersistedResults(
      (row as { results?: unknown }).results,
    );
    if (!snap) continue;
    const c = computeCampaignStrength(snap).composite;
    composites.push(c);
    if (c < 40) buckets[0] += 1;
    else if (c < 60) buckets[1] += 1;
    else if (c < 80) buckets[2] += 1;
    else buckets[3] += 1;

    const r = row as {
      thread_id?: unknown;
      completed_at?: unknown;
      predicted_revenue?: unknown;
      win_probability?: unknown;
    };
    const tid = typeof r.thread_id === "string" ? r.thread_id : "";
    const replyInt = tid ? interestByThread.get(tid) : undefined;
    const pr = r.predicted_revenue;
    const wp = r.win_probability;
    let winP: number;
    let rev: number;
    if (
      typeof pr === "number" &&
      Number.isFinite(pr) &&
      typeof wp === "number" &&
      Number.isFinite(wp)
    ) {
      winP = Math.min(100, Math.max(0, wp));
      rev = Math.max(0, pr);
    } else {
      const fc = computeForecastFromSnapshot(snap, { replyInterest0to10: replyInt ?? null });
      winP = fc.winProbability;
      rev = fc.predictedRevenueUsd;
    }
    forecastWeightedPipelineUsd += rev * (winP / 100);
    forecastTotalPipelineUsd += rev;
    forecastWinSum += winP;
    forecastDealCount += 1;

    if (typeof r.completed_at === "string") {
      const wk = mondayWeekStartUtc(r.completed_at);
      const prev = weekMap.get(wk) ?? { weighted: 0, count: 0 };
      prev.weighted += rev * (winP / 100);
      prev.count += 1;
      weekMap.set(wk, prev);
    }
  }

  const leadPriorityList: LeadPriorityLeaderboardRow[] = [];
  for (const row of campRes.data ?? []) {
    const snap = snapshotFromPersistedResults((row as { results?: unknown }).results);
    if (!snap || snap.final_status === "failed") continue;
    const r = row as {
      thread_id?: unknown;
      completed_at?: unknown;
      lead_name?: unknown;
      company?: unknown;
      email?: unknown;
    };
    const tid = String(r.thread_id ?? snap.thread_id ?? "");
    if (!tid) continue;
    const email = String(r.email ?? snap.lead?.email ?? "");
    const leadName = String(r.lead_name ?? snap.lead?.name ?? "Lead");
    const company = String(r.company ?? snap.lead?.company ?? "");
    const completed =
      r.completed_at != null ? String(r.completed_at) : snap.campaign_completed_at ?? null;
    const replyI = resolveReplyInterestForLead(tid, email, interestByThread, interestByEmail);
    const scored = scoreLeadForPriority(snap, {
      replyInterest0to10: replyI,
      leadDisplayName: leadName,
    });
    leadPriorityList.push({
      thread_id: tid,
      lead_name: leadName,
      company,
      email,
      completed_at: completed,
      composite_score: scored.composite,
      priority_tier: scored.tier,
      tier_label: priorityTierLabel(scored.tier),
      dimensions: scored.dimensions,
      ai_recommendation: scored.priority_reason,
    });
  }
  leadPriorityList.sort((a, b) => b.composite_score - a.composite_score);
  const leadPriorityLeaderboard = leadPriorityList.slice(0, 35);
  const leadPrioritySummary = buildLeadPriorityQueueSummary(
    leadPriorityLeaderboard.slice(0, 3).map((row) => ({
      lead_name: row.lead_name,
      composite_score: row.composite_score,
      tier: row.priority_tier,
    })),
  );

  const qualificationInsightsRaw: QualificationInsightRow[] = [];
  for (const row of campRes.data ?? []) {
    const snap = snapshotFromPersistedResults((row as { results?: unknown }).results);
    if (!snap || snap.final_status === "failed") continue;
    const r = row as {
      thread_id?: unknown;
      completed_at?: unknown;
      lead_name?: unknown;
      company?: unknown;
      email?: unknown;
      qualification_score?: unknown;
    };
    const tid = String(r.thread_id ?? snap.thread_id ?? "");
    if (!tid) continue;
    const email = String(r.email ?? snap.lead?.email ?? "");
    const leadName = String(r.lead_name ?? snap.lead?.name ?? "Lead");
    const company = String(r.company ?? snap.lead?.company ?? "");
    const completed =
      r.completed_at != null ? String(r.completed_at) : snap.campaign_completed_at ?? null;
    const replyI = resolveReplyInterestForLead(tid, email, interestByThread, interestByEmail);
    const disp = computeDisplayQualificationScore(snap, replyI);
    const colScore =
      typeof r.qualification_score === "number" && Number.isFinite(r.qualification_score)
        ? Math.round(r.qualification_score)
        : null;
    if (
      disp.base == null &&
      disp.refined == null &&
      disp.next_best_action == null &&
      colScore == null &&
      snap.qualification_detail == null
    ) {
      continue;
    }
    const base = disp.base ?? colScore;
    const refined = disp.refined ?? disp.base ?? colScore;
    qualificationInsightsRaw.push({
      thread_id: tid,
      lead_name: leadName,
      company,
      qualification_base: base,
      qualification_refined: refined,
      next_best_action: disp.next_best_action,
      completed_at: completed,
    });
  }
  qualificationInsightsRaw.sort((a, b) => {
    const ar = a.qualification_refined ?? -1;
    const br = b.qualification_refined ?? -1;
    return br - ar;
  });
  const qualificationInsights = qualificationInsightsRaw.slice(0, 28);

  const replyObjectionCards: ReplyObjectionCardRow[] = [];
  for (const raw of replyObjectionRows) {
    const r = raw as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id : String(r.id ?? "");
    if (!id) continue;
    const card = buildReplyObjectionCardFromRow({
      id,
      thread_id: typeof r.thread_id === "string" ? r.thread_id : null,
      lead_name: typeof r.lead_name === "string" ? r.lead_name : null,
      company: typeof r.company === "string" ? r.company : null,
      reply_preview: typeof r.reply_preview === "string" ? r.reply_preview : "",
      analysis: r.analysis,
      created_at: String(r.created_at ?? ""),
    });
    if (
      card.detected_patterns.length === 0 &&
      card.analyzer_objections.length === 0 &&
      card.reply_preview.trim().length < 8
    ) {
      continue;
    }
    replyObjectionCards.push(card);
  }
  const replyObjectionCardsTrimmed = replyObjectionCards.slice(0, 22);

  const forecastAvgWinProbability =
    forecastDealCount > 0 ? Math.round(forecastWinSum / forecastDealCount) : null;

  const sortedWeeks = [...weekMap.keys()].sort();
  const lastWeeks = sortedWeeks.slice(-8);
  const forecastTrend: ForecastTrendPoint[] = lastWeeks.map((weekStart) => {
    const v = weekMap.get(weekStart)!;
    const d = new Date(`${weekStart}T00:00:00.000Z`);
    return {
      weekStart,
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }),
      weightedPipelineUsd: Math.round(v.weighted),
      dealCount: v.count,
    };
  });

  const interests: number[] = [];
  for (const row of replyRows) {
    const scoreRaw = row.interest_score;
    const fromCol = coerceInterestScoreColumn(scoreRaw, NaN);
    if (!Number.isNaN(fromCol)) {
      interests.push(fromCol);
      continue;
    }
    const a = row.analysis;
    if (isRecord(a) && typeof a.interest_level_0_to_10 === "number") {
      const n = Math.min(10, Math.max(0, Math.round(a.interest_level_0_to_10)));
      interests.push(n);
    }
  }

  const nCamp = composites.length;
  const avgComposite =
    nCamp > 0 ? Math.round(composites.reduce((s, x) => s + x, 0) / nCamp) : null;
  const nRep = replyRows.length;
  const avgInterest =
    interests.length > 0
      ? Math.round((interests.reduce((s, x) => s + x, 0) / interests.length) * 10) / 10
      : null;

  const maxB = Math.max(1, ...buckets);
  const labels = ["0–39", "40–59", "60–79", "80–100"] as const;
  const strengthBuckets = buckets.map((count, i) => ({
    label: labels[i],
    count,
    pct: Math.round((count / maxB) * 100),
  }));

  /** Prompt 70 — placeholder ROI math (replace with CRM integration later). */
  const estimatedPipelineValueUsd =
    nCamp > 0 ? Math.round(nCamp * (avgComposite ?? 62) * 420) : 0;
  const estimatedRoiMultiplier =
    nCamp > 0 && avgComposite != null
      ? Math.round((avgComposite / 55) * 10) / 10
      : 0;

  return {
    campaignCount: nCamp,
    avgCompositeScore: avgComposite,
    replyAnalyzedCount: nRep,
    avgReplyInterest: avgInterest,
    strengthBuckets,
    liveSignalsFeed,
    estimatedPipelineValueUsd,
    estimatedRoiMultiplier,
    avgInboxHealthScore,
    deliverabilitySampleCount,
    warmupEmailsLast7Days,
    avgWarmupPlacementScore,
    warmupEnabled,
    abTestComparisons,
    forecastWeightedPipelineUsd: Math.round(forecastWeightedPipelineUsd),
    forecastTotalPipelineUsd: Math.round(forecastTotalPipelineUsd),
    forecastAvgWinProbability,
    forecastDealCount,
    forecastTrend,
    leadPriorityLeaderboard,
    leadPrioritySummary,
    qualificationInsights,
    replyObjectionCards: replyObjectionCardsTrimmed,
  };
}

export type UploadBrandingLogoResult =
  | { ok: true; publicUrl: string }
  | { ok: false; error: string };

const BRANDING_MAX_BYTES = 2_000_000;

/**
 * Upload a logo image to Supabase Storage (`branding-logos` bucket).
 * Run `supabase/branding-storage.sql` in the Supabase SQL editor first.
 */
export async function uploadBrandingLogoAction(
  formData: FormData,
): Promise<UploadBrandingLogoResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "Unauthorized" };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose an image file." };
  }
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "Only image uploads are allowed." };
  }
  if (file.size > BRANDING_MAX_BYTES) {
    return { ok: false, error: "Image must be 2MB or smaller." };
  }

  const ext =
    file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) ||
    "png";
  const path = `${user.id}/${Date.now()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from("branding-logos")
    .upload(path, buf, {
      contentType: file.type,
      upsert: true,
    });

  if (upErr) {
    console.error("[AgentForge] uploadBrandingLogo", upErr.message);
    return {
      ok: false,
      error:
        upErr.message.includes("Bucket not found") || upErr.message.includes("not found")
          ? "Storage bucket missing — run supabase/branding-storage.sql in Supabase."
          : upErr.message,
    };
  }

  const { data: pub } = supabase.storage.from("branding-logos").getPublicUrl(path);
  const publicUrl = pub.publicUrl;

  const { data: wlRow } = await supabase
    .from("white_label_settings")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (wlRow) {
    await supabase
      .from("white_label_settings")
      .update({ logo_url: publicUrl, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);
  } else {
    await supabase.from("white_label_settings").insert({
      user_id: user.id,
      logo_url: publicUrl,
    });
  }

  return { ok: true, publicUrl };
}

const whiteLabelSaveSchema = z.object({
  app_name: z.string().max(120).optional(),
  company_name: z.string().max(120).optional(),
  primary_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Primary color must be #RRGGBB"),
  secondary_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Secondary color must be #RRGGBB"),
  support_email: z.union([z.string().email(), z.literal("")]).optional(),
  logo_url: z.string().max(2048).optional(),
});

export type SaveWhiteLabelSettingsResult = { ok: true } | { ok: false; error: string };

/** Prompt 79 — persist white-label row (Supabase). */
export async function saveWhiteLabelSettingsAction(
  raw: z.input<typeof whiteLabelSaveSchema>,
): Promise<SaveWhiteLabelSettingsResult> {
  const parsed = whiteLabelSaveSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: Object.values(parsed.error.flatten().fieldErrors)
        .flat()
        .filter(Boolean)
        .join(", "),
    };
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Unauthorized" };
  }

  const app_name = (parsed.data.app_name ?? "").trim().slice(0, 120);
  const company_name = (parsed.data.company_name ?? "").trim().slice(0, 120);
  const support_email = (parsed.data.support_email ?? "").trim();
  const logo_url = (parsed.data.logo_url ?? "").trim().slice(0, 2048);

  const { error } = await supabase.from("white_label_settings").upsert(
    {
      user_id: user.id,
      app_name,
      company_name,
      primary_color: parsed.data.primary_color,
      secondary_color: parsed.data.secondary_color,
      support_email,
      logo_url,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("[AgentForge] saveWhiteLabelSettingsAction", error.message);
    return {
      ok: false,
      error:
        error.message.includes("white_label_settings") || error.code === "42P01"
          ? "Run supabase/white_label_settings.sql in Supabase, then try again."
          : error.message,
    };
  }

  revalidatePath("/");
  return { ok: true };
}

const betaSignupSchema = z.object({
  full_name: z.string().trim().min(1, "Full name is required.").max(200),
  company: z.string().trim().min(1, "Company is required.").max(200),
  role: z.string().trim().min(1, "Role is required.").max(120),
  linkedin_url: z
    .string()
    .max(500)
    .transform((s) => s.trim())
    .transform((s) => (s === "" ? null : s))
    .refine(
      (v) => v === null || z.string().url().safeParse(v).success,
      "Enter a valid URL or leave blank.",
    ),
  motivation: z
    .string()
    .trim()
    .min(10, "Please share a bit more (at least 10 characters).")
    .max(4000),
});

export type SubmitBetaSignupResult = { ok: true } | { ok: false; error: string };

/**
 * Prompt 75 — saves beta interest to `beta_signups` (upsert per user). Run `supabase/beta_signups.sql` first.
 */
export async function submitBetaSignupAction(
  raw: z.input<typeof betaSignupSchema>,
): Promise<SubmitBetaSignupResult> {
  const parsed = betaSignupSchema.safeParse(raw);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const msg =
      Object.values(flat.fieldErrors).flat()[0] ??
      flat.formErrors[0] ??
      "Check your entries.";
    return { ok: false, error: msg };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Sign in to join the beta." };
  }

  const { error } = await supabase.from("beta_signups").upsert(
    {
      user_id: user.id,
      full_name: parsed.data.full_name,
      company: parsed.data.company,
      role: parsed.data.role,
      linkedin_url: parsed.data.linkedin_url,
      motivation: parsed.data.motivation,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("[AgentForge] beta_signups", error.message);
    return {
      ok: false,
      error:
        error.message.includes("relation") || error.message.includes("does not exist")
          ? "Beta signup table missing — run supabase/beta_signups.sql in Supabase."
          : error.message,
    };
  }

  revalidatePath("/");
  return { ok: true };
}

const hubSpotTokenSchema = z.object({
  access_token: z.string().trim().min(20).max(2048),
});

export type SaveHubSpotTokenResult = { ok: true } | { ok: false; error: string };

/**
 * Stores HubSpot Private App access token (service role only — see supabase/hubspot_credentials.sql).
 */
export async function saveHubSpotAccessTokenAction(
  raw: z.input<typeof hubSpotTokenSchema>,
): Promise<SaveHubSpotTokenResult> {
  const parsed = hubSpotTokenSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Paste a valid HubSpot private app access token." };
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Unauthorized" };
  }
  const sr = getServiceRoleSupabaseOrNull();
  if (!sr) {
    return { ok: false, error: "Server missing SUPABASE_SERVICE_ROLE_KEY — cannot store CRM credentials." };
  }
  const { error } = await sr.from("user_hubspot_credentials").upsert(
    {
      user_id: user.id,
      access_token: parsed.data.access_token,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    console.error("[AgentForge] hubspot save", error.message);
    return {
      ok: false,
      error:
        error.message.includes("relation") || error.message.includes("does not exist")
          ? "HubSpot table missing — run supabase/hubspot_credentials.sql in Supabase."
          : error.message,
    };
  }
  revalidatePath("/");
  return { ok: true };
}

export async function disconnectHubSpotAction(): Promise<SaveHubSpotTokenResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Unauthorized" };
  }
  const sr = getServiceRoleSupabaseOrNull();
  if (!sr) {
    return { ok: false, error: "Server misconfigured." };
  }
  const { error } = await sr.from("user_hubspot_credentials").delete().eq("user_id", user.id);
  if (error) {
    return { ok: false, error: error.message };
  }
  revalidatePath("/");
  return { ok: true };
}

const exportHubSpotSchema = z.object({
  thread_id: z.string().min(1).max(260),
});

export type ExportCampaignToHubSpotResult =
  | { ok: true; dealId: string }
  | { ok: false; error: string };

/**
 * Full campaign → HubSpot: contact, deal, insights note, PDF note+attachment, reply analysis text.
 */
export async function exportCampaignToHubSpotAction(
  raw: z.input<typeof exportHubSpotSchema>,
): Promise<ExportCampaignToHubSpotResult> {
  const parsed = exportHubSpotSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Invalid campaign." };
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Unauthorized" };
  }
  const sr = getServiceRoleSupabaseOrNull();
  if (!sr) {
    return { ok: false, error: "Server missing service role — cannot load HubSpot credentials." };
  }
  await ensurePersonalWorkspaceMembership(supabase, user.id);
  const ws = await resolveWorkspaceContext(supabase, {
    id: user.id,
    email: user.email ?? null,
  });
  const memberIds = ws.memberUserIds;

  const { data: cred, error: credErr } = await sr
    .from("user_hubspot_credentials")
    .select("access_token")
    .eq("user_id", user.id)
    .maybeSingle();
  if (credErr || !cred?.access_token) {
    return { ok: false, error: "Connect HubSpot first (dashboard)." };
  }

  const { data: row, error: rowError } = await sr
    .from("campaigns")
    .select("results")
    .eq("thread_id", parsed.data.thread_id)
    .in("user_id", memberIds)
    .maybeSingle();

  if (rowError || row?.results == null) {
    return { ok: false, error: "Campaign not found." };
  }

  const snap = row.results as CampaignClientSnapshot;
  if (snap.final_status === "failed" || snap.final_status === "running") {
    return { ok: false, error: "Finish a successful campaign before exporting to HubSpot." };
  }

  let replyAnalysisText: string | null = null;
  const { data: replyRow } = await sr
    .from("reply_analyses")
    .select("reply_preview, reply_full, analysis, sentiment, interest_score")
    .in("user_id", memberIds)
    .eq("thread_id", parsed.data.thread_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (replyRow && typeof replyRow === "object") {
    const r = replyRow as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof r.sentiment === "string") parts.push(`Sentiment: ${r.sentiment}`);
    if (r.interest_score != null) parts.push(`Interest: ${String(r.interest_score)}`);
    if (typeof r.reply_preview === "string" && r.reply_preview.trim()) {
      parts.push(`Reply preview: ${r.reply_preview.trim()}`);
    }
    if (typeof r.reply_full === "string" && r.reply_full.trim()) {
      parts.push(`Reply (excerpt): ${r.reply_full.trim().slice(0, 4000)}`);
    }
    if (r.analysis != null) {
      try {
        parts.push(`Analysis JSON: ${JSON.stringify(r.analysis).slice(0, 8000)}`);
      } catch {
        parts.push("Analysis: (present)");
      }
    }
    replyAnalysisText = parts.length > 0 ? parts.join("\n\n") : null;
  }

  const wl = await fetchWhiteLabelSettings(supabase, ws.workspaceId);

  let pdfBytes: ArrayBuffer;
  let pdfFilename: string;
  try {
    const pdfOpts = await buildCampaignPdfExportOptionsFromWhiteLabel(wl);
    const gen = await generateCampaignPdfArrayBuffer(snap, pdfOpts);
    pdfBytes = gen.data;
    pdfFilename = gen.filename;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "PDF generation failed";
    console.error("[AgentForge] HubSpot PDF", e);
    return { ok: false, error: msg };
  }

  const sync = await syncCampaignToHubSpot({
    accessToken: cred.access_token,
    snapshot: snap,
    pdfBytes,
    pdfFilename,
    replyAnalysisText,
    productDisplayName: snap.brand_display_name?.trim() || wl.brandSignoff,
  });

  if (!sync.ok) {
    return { ok: false, error: sync.error };
  }

  return { ok: true, dealId: sync.dealId };
}

const customVoiceCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().min(1, "Description is required").max(2000),
  examples: z
    .array(z.string().trim().min(1).max(2000))
    .min(2, "Add at least 2 example messages")
    .max(3),
  tone_instructions: z.string().trim().min(1, "Tone instructions are required").max(8000),
});

export type CreateCustomVoiceResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Prompt 78 — list saved custom voices for the signed-in user.
 */
export async function listCustomVoicesAction(): Promise<CustomVoiceRow[]> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return [];
  }
  const { data, error } = await supabase
    .from("custom_voices")
    .select("id, name, description, examples, tone_instructions, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[AgentForge] listCustomVoicesAction", error.message);
    return [];
  }
  return (data ?? []) as CustomVoiceRow[];
}

/**
 * Prompt 78 — create a custom SDR voice (RLS-scoped).
 */
export async function createCustomVoiceAction(
  raw: z.input<typeof customVoiceCreateSchema>,
): Promise<CreateCustomVoiceResult> {
  const parsed = customVoiceCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: Object.values(parsed.error.flatten().fieldErrors)
        .flat()
        .filter(Boolean)
        .join(", "),
    };
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Unauthorized" };
  }
  const { data, error } = await supabase
    .from("custom_voices")
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      description: parsed.data.description,
      examples: parsed.data.examples,
      tone_instructions: parsed.data.tone_instructions,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    console.error("[AgentForge] createCustomVoiceAction", error.message);
    return {
      ok: false,
      error:
        error.message.includes("relation") || error.message.includes("does not exist")
          ? "Custom voices table missing — run supabase/custom_voices.sql in Supabase."
          : error.message,
    };
  }
  revalidatePath("/");
  return { ok: true, id: String(data?.id ?? "") };
}

const deleteCustomVoiceSchema = z.object({
  id: z.string().uuid(),
});

export type DeleteCustomVoiceResult = { ok: true } | { ok: false; error: string };

export async function deleteCustomVoiceAction(
  raw: z.input<typeof deleteCustomVoiceSchema>,
): Promise<DeleteCustomVoiceResult> {
  const parsed = deleteCustomVoiceSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Invalid voice." };
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Unauthorized" };
  }
  const { error } = await supabase
    .from("custom_voices")
    .delete()
    .eq("id", parsed.data.id)
    .eq("user_id", user.id);
  if (error) {
    return { ok: false, error: error.message };
  }
  revalidatePath("/");
  return { ok: true };
}

/* ─── Prompt 86 — Advanced reporting & scheduled email reports ─── */

const reportFiltersSchema = z.object({
  dateFrom: z.string().nullable().optional(),
  dateTo: z.string().nullable().optional(),
  voice: z.string().default("all"),
  memberUserId: z.string().default("all"),
});

const generateAdvancedReportSchema = z.object({
  format: z.enum(["pdf", "csv"]),
  filters: reportFiltersSchema,
});

export type GenerateAdvancedReportResult =
  | {
      ok: true;
      format: "csv";
      csv: string;
      filename: string;
      metrics: ReportMetricsSummary;
    }
  | {
      ok: true;
      format: "pdf";
      pdfBase64: string;
      filename: string;
      metrics: ReportMetricsSummary;
    }
  | { ok: false; error: string };

export async function generateAdvancedReportAction(
  raw: z.input<typeof generateAdvancedReportSchema>,
): Promise<GenerateAdvancedReportResult> {
  const parsed = generateAdvancedReportSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Invalid report request." };
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Unauthorized" };
  }
  await ensurePersonalWorkspaceMembership(supabase, user.id);
  const ctx = await resolveWorkspaceContext(supabase, {
    id: user.id,
    email: user.email ?? null,
  });
  const memberIds = ctx.memberUserIds;
  const sr = getServiceRoleSupabaseOrNull();
  const sb = sr ?? supabase;
  const filters: ReportFiltersPayload = {
    ...defaultReportFilters(),
    ...parseReportFilters(parsed.data.filters),
  };
  const bundle = await fetchReportBundle(sb, memberIds, filters);
  const metrics = buildReportMetrics(bundle);
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `agentforge-report-${stamp}`;

  if (parsed.data.format === "csv") {
    return {
      ok: true,
      format: "csv",
      csv: buildCsvReport(bundle),
      filename: `${base}.csv`,
      metrics,
    };
  }
  const wl = await fetchWhiteLabelSettings(supabase, user.id);
  const title = wl.appName.trim() || "AgentForge";
  const pdfBuf = buildAggregatePdfBuffer(bundle, metrics, `${title} — Advanced report`);
  const pdfBase64 = Buffer.from(pdfBuf).toString("base64");
  return {
    ok: true,
    format: "pdf",
    pdfBase64,
    filename: `${base}.pdf`,
    metrics,
  };
}

const saveScheduledReportSchema = z.object({
  recipient_email: z.string().email(),
  cadence: z.enum(["daily", "weekly"]),
  hour_utc: z.number().int().min(0).max(23),
  weekday_utc: z.number().int().min(0).max(6).nullable().optional(),
  filters: reportFiltersSchema,
});

export async function listScheduledReportsAction(): Promise<ScheduledReportRow[]> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return [];
  }
  await ensurePersonalWorkspaceMembership(supabase, user.id);
  const ctx = await resolveWorkspaceContext(supabase, {
    id: user.id,
    email: user.email ?? null,
  });

  const { data, error } = await supabase
    .from("scheduled_reports")
    .select(
      "id, workspace_id, user_id, recipient_email, cadence, hour_utc, weekday_utc, filters, enabled, last_run_at, next_run_at, created_at",
    )
    .eq("workspace_id", ctx.workspaceId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    if (!isMissingColumnOrSchemaError(error.message)) {
      console.warn("[AgentForge] listScheduledReports", error.message);
    }
    return [];
  }

  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id ?? ""),
      workspace_id: String(r.workspace_id ?? ""),
      user_id: String(r.user_id ?? ""),
      recipient_email: String(r.recipient_email ?? ""),
      cadence: r.cadence === "weekly" ? "weekly" : "daily",
      hour_utc: typeof r.hour_utc === "number" ? r.hour_utc : 0,
      weekday_utc: typeof r.weekday_utc === "number" ? r.weekday_utc : null,
      filters: isRecord(r.filters) ? r.filters : {},
      enabled: Boolean(r.enabled),
      last_run_at: r.last_run_at != null ? String(r.last_run_at) : null,
      next_run_at: r.next_run_at != null ? String(r.next_run_at) : null,
      created_at: String(r.created_at ?? ""),
    };
  });
}

export async function saveScheduledReportAction(
  raw: z.input<typeof saveScheduledReportSchema>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = saveScheduledReportSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Check schedule fields." };
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Unauthorized" };
  }
  await ensurePersonalWorkspaceMembership(supabase, user.id);
  const ctx = await resolveWorkspaceContext(supabase, {
    id: user.id,
    email: user.email ?? null,
  });

  const filters = parseReportFilters({
    ...defaultReportFilters(),
    ...parsed.data.filters,
  });
  const next = computeNextRunUtc(
    parsed.data.cadence,
    parsed.data.hour_utc,
    parsed.data.cadence === "weekly" ? (parsed.data.weekday_utc ?? 1) : null,
  );

  const insertRow = {
    workspace_id: ctx.workspaceId,
    user_id: user.id,
    recipient_email: parsed.data.recipient_email.trim(),
    cadence: parsed.data.cadence,
    hour_utc: parsed.data.hour_utc,
    weekday_utc: parsed.data.cadence === "weekly" ? (parsed.data.weekday_utc ?? 1) : null,
    filters,
    enabled: true,
    next_run_at: next.toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from("scheduled_reports").insert(insertRow).select("id").single();

  if (error) {
    return {
      ok: false,
      error: error.message.includes("scheduled_reports")
        ? "Schedule table missing — run supabase/scheduled_reports_p86.sql."
        : error.message,
    };
  }
  revalidatePath("/");
  return { ok: true, id: String((data as { id?: unknown }).id ?? "") };
}

export async function deleteScheduledReportAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sid = z.string().uuid().safeParse(id);
  if (!sid.success) {
    return { ok: false, error: "Invalid id." };
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Unauthorized" };
  }
  await ensurePersonalWorkspaceMembership(supabase, user.id);
  const ctx = await resolveWorkspaceContext(supabase, {
    id: user.id,
    email: user.email ?? null,
  });

  const { error } = await supabase
    .from("scheduled_reports")
    .delete()
    .eq("id", sid.data)
    .eq("workspace_id", ctx.workspaceId);

  if (error) {
    return { ok: false, error: error.message };
  }
  revalidatePath("/");
  return { ok: true };
}

/**
 * Called by cron — processes due schedules (PDF + metrics email).
 * Exported for tests; prefer hitting `/api/cron/scheduled-reports`.
 */
export async function runScheduledReportsCronJob(): Promise<{ processed: number; errors: string[] }> {
  const sr = getServiceRoleSupabaseOrNull();
  if (!sr) {
    return { processed: 0, errors: ["Service role unavailable"] };
  }

  const nowIso = new Date().toISOString();
  const { data: due, error } = await sr
    .from("scheduled_reports")
    .select("*")
    .eq("enabled", true)
    .lte("next_run_at", nowIso)
    .limit(25);

  if (error) {
    if (isMissingColumnOrSchemaError(error.message)) {
      return { processed: 0, errors: [] };
    }
    return { processed: 0, errors: [error.message] };
  }

  const errors: string[] = [];
  let processed = 0;

  for (const row of due ?? []) {
    const r = row as Record<string, unknown>;
    const id = String(r.id ?? "");
    const workspaceId = String(r.workspace_id ?? "");
    const userId = String(r.user_id ?? "");
    const recipient = String(r.recipient_email ?? "");
    const cadence = r.cadence === "weekly" ? "weekly" : "daily";
    const prevNext = String(r.next_run_at ?? nowIso);

    try {
      const { data: members } = await sr
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspaceId)
        .eq("status", "active");
      const memberIds = (members ?? [])
        .map((m) => (m as { user_id?: string }).user_id)
        .filter((x): x is string => typeof x === "string" && x.length > 0);
      if (memberIds.length === 0) {
        errors.push(`Schedule ${id}: no members`);
        continue;
      }

      const filters = parseReportFilters(r.filters);
      const bundle = await fetchReportBundle(sr, memberIds, filters);
      const metrics = buildReportMetrics(bundle);
      const { data: wlRow } = await sr
        .from("white_label_settings")
        .select("app_name")
        .eq("user_id", userId)
        .maybeSingle();
      const appName =
        wlRow && typeof (wlRow as { app_name?: unknown }).app_name === "string"
          ? (wlRow as { app_name: string }).app_name.trim()
          : "AgentForge";
      const title = `${appName} — Scheduled report`;
      const pdfBuf = buildAggregatePdfBuffer(bundle, metrics, title);
      const { data: prof } = await sr.from("profiles").select("full_name").eq("id", userId).maybeSingle();
      const fromName =
        prof && typeof (prof as { full_name?: unknown }).full_name === "string"
          ? (prof as { full_name: string }).full_name.trim()
          : null;
      const from = buildDynamicFromEmail(fromName);
      const html = buildScheduledReportEmailHtml(metrics, title);
      const subject = `${appName} — ${cadence === "daily" ? "Daily" : "Weekly"} report`;

      const send = await sendTransactionalEmail({
        to: recipient,
        from,
        subject,
        html,
        attachments: [{ filename: `report-${new Date().toISOString().slice(0, 10)}.pdf`, content: Buffer.from(pdfBuf) }],
      });

      if (!send.ok) {
        errors.push(`Schedule ${id}: ${send.error}`);
        continue;
      }

      const nextRun = advanceScheduledNextRun(prevNext, cadence);
      await sr
        .from("scheduled_reports")
        .update({
          last_run_at: nowIso,
          next_run_at: nextRun,
          updated_at: nowIso,
        })
        .eq("id", id);

      processed += 1;
    } catch (e) {
      errors.push(`Schedule ${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { processed, errors };
}
