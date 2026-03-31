"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import {
  runCampaignGraph,
  serializeCampaignStateForClient,
} from "@/agents/graph";
import type { SequenceRecommendationSnapshot } from "@/agents/types";
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
import {
  getDashboardEnvWarnings,
  hasLlmProviderConfigured,
  warnIfResendNotConfigured,
} from "@/lib/env";
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
import { computeDealQualificationClose } from "@/lib/qualification-engine";
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
  DeliverabilityCoachInsightsDTO,
  DeliverabilitySuitePayload,
  ForecastTrendPoint,
  LeadPriorityLeaderboardRow,
  LiveSignalFeedItem,
  PersistedCampaignRow,
  PersistedReplyAnalysisRow,
  ProspectReplyAnalysisPayload,
  QualificationInsightRow,
  ReplyObjectionCardRow,
  DealCloseQualificationRow,
  KnowledgeBaseEntryRow,
  PlaybookRow,
  ReportFiltersPayload,
  ScheduledReportRow,
  WorkspaceMemberDTO,
  WorkspaceMemberRole,
  PersonalizedDemoScriptDTO,
  SalesCoachingPayloadDTO,
  SdrManagerPayloadDTO,
} from "@/types";
import { computeCampaignStrength } from "@/lib/campaign-strength";
import {
  computeThreadUnread,
  threadIsArchived,
  threadIsSnoozed,
} from "@/lib/inbox-filters";
import { mergeTemplatePayloadIntoLeadForm } from "@/lib/campaign-templates-merge";
import { computeForecastFromSnapshot } from "@/lib/forecast";
import { buildDashboardOptimizerFeedFromRows } from "@/lib/optimizer";
import {
  buildSequenceRecommendation,
  historicSampleFromResultsRow,
  type HistoricCampaignSample,
} from "@/lib/recommendation-engine";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { withTimeout } from "@/lib/async-timeout";
import { fetchCustomVoiceProfileForUser } from "@/lib/custom-voices";
import { sdrVoiceLabel, voiceLabelForLead } from "@/lib/sdr-voice";
import { generateCampaignPdfArrayBuffer } from "@/lib/campaign-pdf";
import {
  generateSalesPlaybookWithAi,
  renderSalesPlaybookPdfBytes,
  salesPlaybookSchema,
} from "@/lib/playbook-generator";
import {
  generateProposalPdfInputWithAi,
  isProposalEligible,
  renderProposalPdfBytes,
} from "@/lib/proposal-generator";
import { syncCampaignToHubSpot } from "@/lib/hubspot";
import {
  buildDynamicFromEmail,
  extractBareEmailFromFromHeader,
  sendTransactionalEmail,
} from "@/lib/resend";
import {
  ensureInboxSchemaReady,
  getOrSyncInboxLocalPart,
  isInboxOptionalColumnOrSchemaError,
  isInboxRelationMissingError,
  isOptionalInboxThreadColumnMissingError,
  normalizeComposeRecipientEmail,
  normalizeEmail,
  plainTextToEmailHtml,
  recordNewComposeMessageInInbox,
  snippetFromBodyText,
  linkInboxThreadToCampaignIfKnown,
  upsertInboxThreadAfterOutreachSend,
  type InboxDraftRow,
  type InboxMessageRow,
  type InboxThreadRow,
} from "@/lib/inbox";
import {
  analyzeDeliverability,
  inboxPlacementFromWarmupVolume,
  placementScoreForDailyLog,
} from "@/lib/deliverability";
import {
  buildCoachInsightsFromSuite,
  computeNextSuggestedSendIso,
  generateAiCoachLayer,
  mergeCoachWithCache,
  scheduleTagForUtcNow,
  type DeliverabilityWarmupMetricsInput,
} from "@/lib/deliverability-coach";
import {
  buildSystemHealthStatus,
  computeExecutiveMetrics,
  formatExecutiveReportMarkdown,
  generateExecutiveReportWithAi,
} from "@/lib/sdr-manager";
import {
  buildCampaignPdfExportOptionsFromWhiteLabel,
  fetchWhiteLabelSettings,
} from "@/lib/white-label";
import { ensurePersonalWorkspaceMembership, resolveWorkspaceContext } from "@/lib/workspace";
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
import { isPersonalizedDemoEligible } from "@/lib/demo-eligibility";
import {
  buildDeterministicCoachingPreview,
  computeVoiceCoachingStats,
  generateSalesCoachingWithAi,
} from "@/lib/coaching-engine";
import {
  buildDemoEventTitle,
  formatDemoScriptForCalendarDescription,
  generatePersonalizedDemoScriptWithAi,
  parseStoredDemoScript,
} from "@/lib/demo-generator";

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
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const sr = getServiceRoleSupabaseOrNull();
  const clients: SupabaseClient[] = sr ? [sr, userScoped] : [userScoped];
  let lastMessage = "Could not save reply analysis.";
  for (const client of clients) {
    let ins = await client.from("reply_analyses").insert(fullRow).select("id").single();
    if (!ins.error && ins.data && typeof (ins.data as { id?: string }).id === "string") {
      return { ok: true, id: (ins.data as { id: string }).id };
    }
    lastMessage = ins.error?.message ?? lastMessage;
    if (ins.error && isMissingColumnOrSchemaError(ins.error.message)) {
      ins = await client.from("reply_analyses").insert(minimalRow).select("id").single();
      if (!ins.error && ins.data && typeof (ins.data as { id?: string }).id === "string") {
        return { ok: true, id: (ins.data as { id: string }).id };
      }
      lastMessage = ins.error?.message ?? lastMessage;
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

const sequenceRecommendationSnapshotSchema = z.object({
  engine_version: z.literal("p95-v1"),
  computed_at: z.string(),
  recommended_sequence_id: z.string().uuid().nullable(),
  recommended_sequence_name: z.string().nullable(),
  confidence_0_to_100: z.number().min(0).max(100),
  sdr_voice_tone: z.enum(SDR_VOICE_TONE_VALUES),
  custom_voice_id: z.string().uuid().nullable(),
  custom_voice_name: z.string().max(200).nullable(),
  first_message_hint: z.string().max(1400),
  why_this_sequence: z.string().max(4000),
  signals_used: z.array(z.string()).max(24),
});

const campaignRunOptionsSchema = z.object({
  ab_test_id: z.string().uuid().optional(),
  ab_variant: z.enum(["A", "B"]).optional(),
  template_id: z.string().uuid().optional(),
  template_voice_note: z.string().max(2000).optional(),
  /** Prompt 88 — optional saved sequence for display + milestone progress in the UI. */
  sequence_id: z.string().uuid().optional(),
  /** Prompt 95 — optional metadata from the recommendation engine (does not alter pipeline nodes). */
  sequence_recommendation_snapshot: sequenceRecommendationSnapshotSchema.optional(),
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

/** Prompt 95 — best-effort audit row when a run includes recommendation metadata. */
async function persistSequenceRecommendationLog(
  workspaceId: string,
  userId: string,
  company: string,
  email: string,
  snap: SequenceRecommendationSnapshot,
): Promise<void> {
  const sb = getServiceRoleSupabaseOrNull();
  if (!sb) return;
  const { error } = await sb.from("sequence_recommendation_log").insert({
    workspace_id: workspaceId,
    user_id: userId,
    company: company.trim().slice(0, 240),
    prospect_email: email.trim().slice(0, 240),
    recommended_sequence_id: snap.recommended_sequence_id,
    confidence: snap.confidence_0_to_100,
    payload: snap as unknown as Record<string, unknown>,
  });
  if (error && !/sequence_recommendation_log|column|schema/i.test(error.message ?? "")) {
    console.warn("[AgentForge] persistSequenceRecommendationLog", error.message);
  }
}

const sequenceRecommendationRequestSchema = z.object({
  company: z.string().min(1).max(400),
  email: z.string().email(),
  notes: z.string().max(8000).optional(),
});

/**
 * Prompt 95 — heuristic sequence / voice / opener recommendation (no extra LLM round-trip).
 */
export async function getSequenceRecommendationAction(
  raw: z.input<typeof sequenceRecommendationRequestSchema>,
): Promise<
  | { ok: true; recommendation: SequenceRecommendationSnapshot }
  | { ok: false; error: string }
> {
  const parsed = sequenceRecommendationRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Enter a company and valid email to get a recommendation." };
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
  const sr = getServiceRoleSupabaseOrNull();
  const campaignsReader = sr ?? supabase;

  const { data: seqRows, error: seqErr } = await supabase
    .from("campaign_sequences")
    .select("id, name, steps, created_at, updated_at")
    .eq("workspace_id", ws.workspaceId)
    .order("updated_at", { ascending: false })
    .limit(80);

  if (seqErr && !isMissingColumnOrSchemaError(seqErr.message)) {
    console.warn("[AgentForge] getSequenceRecommendationAction sequences", seqErr.message);
  }

  const sequences: CampaignSequenceRow[] = (seqRows ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      steps: parseSequenceStepsFromJson(row.steps),
      created_at: String(row.created_at ?? ""),
      updated_at: String(row.updated_at ?? ""),
    };
  });

  const { data: campRows, error: campErr } = await campaignsReader
    .from("campaigns")
    .select("results, company")
    .in("user_id", memberIds)
    .limit(220);

  if (campErr && !isMissingColumnOrSchemaError(campErr.message)) {
    console.warn("[AgentForge] getSequenceRecommendationAction campaigns", campErr.message);
  }

  const historicSamples: HistoricCampaignSample[] = [];
  for (const row of campRows ?? []) {
    const r = row as { results?: unknown; company?: unknown };
    const co = typeof r.company === "string" ? r.company : "";
    const h = historicSampleFromResultsRow(r.results, co);
    if (h) historicSamples.push(h);
  }

  const customVoices = await listCustomVoicesAction();

  const recommendation = buildSequenceRecommendation({
    company: parsed.data.company.trim(),
    email: parsed.data.email.trim(),
    notes: parsed.data.notes,
    sequences,
    historicSamples,
    customVoices: customVoices.map((v) => ({ id: v.id, name: v.name })),
  });

  return { ok: true, recommendation };
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
        sequence_recommendation_snapshot: options?.sequence_recommendation_snapshot ?? null,
      }),
      START_CAMPAIGN_MAX_MS,
      "startCampaign.runCampaignGraph",
    );
    const snapshot = serializeCampaignStateForClient(finalState);

    if (options?.sequence_recommendation_snapshot) {
      void persistSequenceRecommendationLog(
        ws.workspaceId,
        user.id,
        formLead.company,
        formLead.email,
        options.sequence_recommendation_snapshot,
      ).catch(() => {});
    }

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
  /** Prompt 100 — demo-specific calendar event (same provider APIs). */
  event_kind: z.enum(["standard", "demo"]).optional(),
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
    (parsed.data.event_kind === "demo"
      ? `Product demo — ${parsed.data.thread_id.slice(0, 8)} (AgentForge)`
      : `Meeting — ${parsed.data.thread_id.slice(0, 8)} (AgentForge)`);
  const bodyText =
    parsed.data.body?.trim() ||
    (parsed.data.event_kind === "demo"
      ? `Personalized demo — AgentForge Sales.\nThread: ${parsed.data.thread_id}`
      : `Scheduled via AgentForge Sales.\nThread: ${parsed.data.thread_id}`);

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

const demoThreadSchema = z.object({
  thread_id: z.string().min(1).max(280),
});

const bookPersonalizedDemoSchema = z.object({
  thread_id: z.string().min(1).max(280),
  provider: z.enum(["google", "microsoft"]),
  start_iso: z.string().min(12).max(44),
  end_iso: z.string().min(12).max(44),
});

const recordDemoOutcomeSchema = z.object({
  thread_id: z.string().min(1).max(280),
  outcome: z.enum(["completed", "no_show", "cancelled"]),
  notes: z.string().max(2000).optional(),
});

export type GeneratePersonalizedDemoScriptResult =
  | { ok: true; script: PersonalizedDemoScriptDTO; demo_status: string }
  | { ok: false; error: string };

/**
 * Prompt 100 — AI personalized demo script; persists `demo_script` + `demo_status` when columns exist.
 */
export async function generatePersonalizedDemoScriptAction(
  raw: z.input<typeof demoThreadSchema>,
): Promise<GeneratePersonalizedDemoScriptResult> {
  const parsed = demoThreadSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "Unauthorized" };

  const { data: row, error: qErr } = await supabase
    .from("campaigns")
    .select("user_id, results")
    .eq("thread_id", parsed.data.thread_id)
    .maybeSingle();
  if (qErr || !row || (row as { user_id?: string }).user_id !== user.id) {
    return { ok: false, error: "Campaign not found for this thread." };
  }
  const snap = snapshotFromPersistedResults((row as { results?: unknown }).results);
  if (!snap) return { ok: false, error: "Campaign snapshot is missing." };
  if (!isPersonalizedDemoEligible(snap)) {
    return {
      ok: false,
      error: "Demo unlocks when qualification is strong (score ≥70) or the lead is Qualified.",
    };
  }

  const script = await generatePersonalizedDemoScriptWithAi(snap);
  const scriptJson = { ...script, generated_at: new Date().toISOString() };
  const { error: upErr } = await supabase
    .from("campaigns")
    .update({
      demo_script: scriptJson as unknown as Record<string, unknown>,
      demo_status: "script_ready",
    })
    .eq("thread_id", parsed.data.thread_id)
    .eq("user_id", user.id);

  if (upErr) {
    if (!isMissingColumnOrSchemaError(upErr.message)) {
      return { ok: false, error: upErr.message };
    }
  }

  revalidatePath("/");
  return { ok: true, script, demo_status: "script_ready" };
}

export type BookPersonalizedDemoResult =
  | {
      ok: true;
      html_link?: string;
      event_id: string;
      provider: CalendarProvider;
    }
  | { ok: false; error: string };

/**
 * Prompt 100 — ensure demo script, create calendar event with script body, store booking metadata.
 */
export async function bookPersonalizedDemoAction(
  raw: z.input<typeof bookPersonalizedDemoSchema>,
): Promise<BookPersonalizedDemoResult> {
  const parsed = bookPersonalizedDemoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid booking payload." };
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "Unauthorized" };

  const { data: row, error: qErr } = await supabase
    .from("campaigns")
    .select("user_id, results, demo_script, company, lead_name, email")
    .eq("thread_id", parsed.data.thread_id)
    .maybeSingle();
  if (qErr || !row || (row as { user_id?: string }).user_id !== user.id) {
    return { ok: false, error: "Campaign not found for this thread." };
  }

  const snap = snapshotFromPersistedResults((row as { results?: unknown }).results);
  if (!snap) return { ok: false, error: "Campaign snapshot is missing." };
  if (!isPersonalizedDemoEligible(snap)) {
    return { ok: false, error: "Lead is not in the demo-eligible band yet." };
  }

  let script: PersonalizedDemoScriptDTO | null = parseStoredDemoScript(
    (row as { demo_script?: unknown }).demo_script,
  );
  if (!script) {
    script = await generatePersonalizedDemoScriptWithAi(snap);
    const scriptJson = { ...script, generated_at: new Date().toISOString() };
    await supabase
      .from("campaigns")
      .update({
        demo_script: scriptJson as unknown as Record<string, unknown>,
        demo_status: "script_ready",
      })
      .eq("thread_id", parsed.data.thread_id)
      .eq("user_id", user.id);
  }

  const company =
    (row as { company?: string }).company?.trim() || snap.lead.company?.trim() || "Account";
  const leadEmail = (row as { email?: string }).email?.trim() || snap.lead.email?.trim();

  const title = buildDemoEventTitle(script, company);
  const bodyCore = formatDemoScriptForCalendarDescription(script);
  const bodyText = `${bodyCore}\n\n---\n${script.invite_email_paragraph}\n\n${script.booking_cta}`;

  const tok = await getValidAccessTokenForUser(supabase, user.id, parsed.data.provider);
  if (!tok) {
    return { ok: false, error: "Connect your calendar first (Google or Microsoft)." };
  }

  try {
    const bookedAt = new Date().toISOString();
    let eventId: string;
    let htmlLink: string | undefined;

    if (parsed.data.provider === "google") {
      const ev = await createGoogleCalendarEvent(tok.accessToken, {
        summary: title,
        description: bodyText.slice(0, 12000),
        startIso: parsed.data.start_iso,
        endIso: parsed.data.end_iso,
        attendeeEmail: leadEmail,
      });
      eventId = ev.id;
      htmlLink = ev.htmlLink;
    } else {
      const ev = await createMicrosoftCalendarEvent(tok.accessToken, {
        summary: title,
        description: bodyText.slice(0, 12000),
        startIso: parsed.data.start_iso,
        endIso: parsed.data.end_iso,
        attendeeEmail: leadEmail,
      });
      eventId = ev.id;
      htmlLink = ev.webLink;
    }

    const outcomePayload = {
      last_booking: {
        booked_at: bookedAt,
        event_id: eventId,
        provider: parsed.data.provider,
        calendar_link: htmlLink ?? null,
        slot_start: parsed.data.start_iso,
        slot_end: parsed.data.end_iso,
      },
    };

    const { error: upErr } = await supabase
      .from("campaigns")
      .update({
        demo_status: "scheduled",
        demo_outcome: outcomePayload as unknown as Record<string, unknown>,
      })
      .eq("thread_id", parsed.data.thread_id)
      .eq("user_id", user.id);

    if (upErr && !isMissingColumnOrSchemaError(upErr.message)) {
      console.warn("[AgentForge] bookPersonalizedDemoAction demo_outcome", upErr.message);
    }

    revalidatePath("/");
    return {
      ok: true,
      event_id: eventId,
      html_link: htmlLink,
      provider: parsed.data.provider,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Calendar API failed";
    return { ok: false, error: msg };
  }
}

export type RecordDemoOutcomeResult = { ok: true } | { ok: false; error: string };

/**
 * Prompt 100 — append a recorded outcome to `demo_outcome` for playbook improvement.
 */
export async function recordDemoOutcomeAction(
  raw: z.input<typeof recordDemoOutcomeSchema>,
): Promise<RecordDemoOutcomeResult> {
  const parsed = recordDemoOutcomeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid outcome payload." };
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "Unauthorized" };

  const { data: row, error: qErr } = await supabase
    .from("campaigns")
    .select("user_id, demo_outcome")
    .eq("thread_id", parsed.data.thread_id)
    .maybeSingle();
  if (qErr || !row || (row as { user_id?: string }).user_id !== user.id) {
    return { ok: false, error: "Campaign not found for this thread." };
  }

  const prev =
    (row as { demo_outcome?: unknown }).demo_outcome != null &&
    typeof (row as { demo_outcome?: unknown }).demo_outcome === "object" &&
    !Array.isArray((row as { demo_outcome?: unknown }).demo_outcome)
      ? ((
          row as {
            demo_outcome?: Record<string, unknown>;
          }
        ).demo_outcome as Record<string, unknown>)
      : {};

  const statusMap = {
    completed: "completed",
    no_show: "no_show",
    cancelled: "cancelled",
  } as const;

  const nextOutcome = {
    ...prev,
    recorded_session: {
      outcome: parsed.data.outcome,
      notes: parsed.data.notes?.trim() || null,
      recorded_at: new Date().toISOString(),
    },
  };

  const { error: upErr } = await supabase
    .from("campaigns")
    .update({
      demo_status: statusMap[parsed.data.outcome],
      demo_outcome: nextOutcome as unknown as Record<string, unknown>,
    })
    .eq("thread_id", parsed.data.thread_id)
    .eq("user_id", user.id);

  if (upErr) {
    if (!isMissingColumnOrSchemaError(upErr.message)) {
      return { ok: false, error: upErr.message };
    }
  }

  revalidatePath("/");
  return { ok: true };
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
  const selectWithDeal = `${selectWithQual}, close_probability, qualification_factors`;
  /** Prompt 98 — optional proposal columns (backward-compatible select fallback). */
  const selectWithProposal = `${selectWithDeal}, proposal_status, generated_proposal_url`;
  /** Prompt 100 — optional demo booking columns. */
  const selectWithDemo = `${selectWithProposal}, demo_status, demo_script, demo_outcome`;
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

  let result = await runSelect(selectWithDemo);
  if (result.error && isMissingColumnOrSchemaError(result.error.message)) {
    result = await runSelect(selectWithProposal);
  }
  if (result.error && isMissingColumnOrSchemaError(result.error.message)) {
    result = await runSelect(selectWithDeal);
  }
  if (result.error && isMissingColumnOrSchemaError(result.error.message)) {
    result = await runSelect(selectWithQual);
  }
  if (result.error && isMissingColumnOrSchemaError(result.error.message)) {
    result = await runSelect(selectWithScore);
  }
  if (result.error && isMissingColumnOrSchemaError(result.error.message)) {
    result = await runSelect(selectFull);
  }
  if (result.error && isMissingColumnOrSchemaError(result.error.message)) {
    result = await runSelect(selectMin);
  }
  data = (result.data ?? null) as Record<string, unknown>[] | null;
  error = result.error;

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
      close_probability?: unknown;
      qualification_factors?: unknown;
      proposal_status?: unknown;
      generated_proposal_url?: unknown;
      demo_status?: unknown;
      demo_script?: unknown;
      demo_outcome?: unknown;
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
      close_probability:
        typeof r.close_probability === "number" && Number.isFinite(r.close_probability)
          ? Math.round(r.close_probability)
          : null,
      qualification_factors:
        r.qualification_factors != null ? r.qualification_factors : undefined,
      proposal_status:
        typeof r.proposal_status === "string" && r.proposal_status.trim()
          ? r.proposal_status.trim()
          : null,
      generated_proposal_url:
        typeof r.generated_proposal_url === "string" && r.generated_proposal_url.trim()
          ? r.generated_proposal_url.trim()
          : null,
      demo_status:
        typeof r.demo_status === "string" && r.demo_status.trim() ? r.demo_status.trim() : null,
      demo_script:
        r.demo_script != null && typeof r.demo_script === "object" && !Array.isArray(r.demo_script)
          ? (r.demo_script as Record<string, unknown>)
          : null,
      demo_outcome:
        r.demo_outcome != null && typeof r.demo_outcome === "object" && !Array.isArray(r.demo_outcome)
          ? (r.demo_outcome as Record<string, unknown>)
          : null,
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
  await getOrSyncInboxLocalPart(supabase, user.id, senderName || "User");
  const { data: profInbox } = await supabase
    .from("profiles")
    .select("inbox_local_part")
    .eq("id", user.id)
    .maybeSingle();
  const inboxPart =
    profInbox &&
    typeof (profInbox as { inbox_local_part?: string }).inbox_local_part === "string" &&
    (profInbox as { inbox_local_part: string }).inbox_local_part.trim()
      ? (profInbox as { inbox_local_part: string }).inbox_local_part.trim()
      : null;
  const fromHeader = buildDynamicFromEmail(senderName || null, inboxPart);
  const replyBare = extractBareEmailFromFromHeader(fromHeader);
  if (!replyBare && !userSignupEmail) {
    return { ok: false, error: "Account email missing — cannot set Reply-To." };
  }
  const send = await sendTransactionalEmail({
    to: snap.lead.email,
    subject: oo.subject,
    html: oo.email_body,
    from: fromHeader,
    reply_to: replyBare ?? userSignupEmail!,
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

  const inboxSync = await upsertInboxThreadAfterOutreachSend({
    supabase,
    userId: user.id,
    campaignThreadId: parsed.data.thread_id,
    prospectEmail: snap.lead.email,
    subject: oo.subject,
    htmlBody: oo.email_body,
    fromEmail: replyBare ?? userSignupEmail!,
  });
  if (!inboxSync.ok) {
    console.warn("[AgentForge] upsertInboxThreadAfterOutreachSend", inboxSync.error);
  }

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

function isSupabaseMissingColumnError(err: { code?: string; message?: string }): boolean {
  return err.code === "42703" || /column .* does not exist/i.test(err.message ?? "");
}

type UserDeliverabilityPrefsRow = {
  warmupEnabled: boolean;
  last_coach_json: unknown;
  next_suggested_send_at: string | null;
  last_coach_at: string | null;
};

/**
 * Prompt 99 — extended prefs when `supabase/deliverability_coach_p99.sql` is applied; falls back to warmup flag only.
 */
async function fetchUserDeliverabilityPrefs(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserDeliverabilityPrefsRow | null> {
  const ext = await supabase
    .from("user_deliverability_prefs")
    .select(
      "warmup_enabled, deliverability_health_score, last_coach_json, next_suggested_send_at, last_coach_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (!ext.error) {
    if (!ext.data) {
      return {
        warmupEnabled: false,
        last_coach_json: undefined,
        next_suggested_send_at: null,
        last_coach_at: null,
      };
    }
    const r = ext.data as Record<string, unknown>;
    return {
      warmupEnabled: Boolean(r.warmup_enabled),
      last_coach_json: r.last_coach_json,
      next_suggested_send_at:
        typeof r.next_suggested_send_at === "string" ? r.next_suggested_send_at : null,
      last_coach_at: typeof r.last_coach_at === "string" ? r.last_coach_at : null,
    };
  }

  if (ext.error && !isSupabaseMissingColumnError(ext.error)) {
    console.warn("[AgentForge] fetchUserDeliverabilityPrefs extended", ext.error.message);
  }

  const basic = await supabase
    .from("user_deliverability_prefs")
    .select("warmup_enabled")
    .eq("user_id", userId)
    .maybeSingle();

  if (basic.error) {
    console.warn("[AgentForge] fetchUserDeliverabilityPrefs basic", basic.error.message);
    return null;
  }

  const r = basic.data as { warmup_enabled?: unknown } | null;
  return {
    warmupEnabled: Boolean(r?.warmup_enabled),
    last_coach_json: undefined,
    next_suggested_send_at: null,
    last_coach_at: null,
  };
}

async function loadDeliverabilityWarmupMetrics(
  supabase: SupabaseClient,
  userId: string,
  prefsWarmup: boolean,
): Promise<DeliverabilityWarmupMetricsInput> {
  const today = new Date();
  const isoToday = today.toISOString().slice(0, 10);
  const fourteen = new Date(today);
  fourteen.setDate(fourteen.getDate() - 14);
  const iso14 = fourteen.toISOString().slice(0, 10);
  const seven = new Date(today);
  seven.setDate(seven.getDate() - 7);
  const isoSeven = seven.toISOString().slice(0, 10);

  const [logsRes, logs7Res, todayRes] = await Promise.all([
    supabase
      .from("email_warmup_logs")
      .select("log_date, emails_sent, inbox_placement_score")
      .eq("user_id", userId)
      .gte("log_date", iso14)
      .order("log_date", { ascending: true }),
    supabase
      .from("email_warmup_logs")
      .select("emails_sent, inbox_placement_score")
      .eq("user_id", userId)
      .gte("log_date", isoSeven)
      .lte("log_date", isoToday),
    supabase
      .from("email_warmup_logs")
      .select("emails_sent, inbox_placement_score")
      .eq("user_id", userId)
      .eq("log_date", isoToday)
      .maybeSingle(),
  ]);

  if (logsRes.error) {
    console.warn("[AgentForge] loadDeliverabilityWarmupMetrics logs", logsRes.error.message);
  }

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
    warmupEnabled: prefsWarmup,
    logs14d,
    emailsSentLast7Days,
    avgPlacementLast7d,
    todayEmails,
    todayPlacement,
  };
}

/**
 * Prompt 80 — full warm-up + chart payload for the Deliverability tab.
 * Prompt 99 — coach insights + next-send window (backward-compatible if coach columns missing).
 */
export async function getDeliverabilitySuiteAction(): Promise<DeliverabilitySuitePayload | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const prefs = await fetchUserDeliverabilityPrefs(supabase, user.id);
  const warmupEnabled = prefs?.warmupEnabled ?? false;

  const metrics = await loadDeliverabilityWarmupMetrics(supabase, user.id, warmupEnabled);

  const baseCoach = buildCoachInsightsFromSuite(metrics);
  const { insights: coach, cachedCoachAt } = mergeCoachWithCache(
    baseCoach,
    prefs?.last_coach_json,
    prefs?.last_coach_at ?? null,
  );

  const nextSuggestedSendAt =
    prefs?.next_suggested_send_at ?? computeNextSuggestedSendIso();

  return {
    ...metrics,
    coach,
    cachedCoachAt,
    nextSuggestedSendAt,
  };
}

export type RefreshDeliverabilityCoachResult =
  | { ok: true; coach: DeliverabilityCoachInsightsDTO; cachedAt: string | null }
  | { ok: false; error: string };

/**
 * Prompt 99 — refresh AI coach layer + persist prefs / health snapshot (no outbound mail).
 */
export async function refreshDeliverabilityCoachAction(): Promise<RefreshDeliverabilityCoachResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "Unauthorized" };

  const prefs = await fetchUserDeliverabilityPrefs(supabase, user.id);
  const warmupEnabled = prefs?.warmupEnabled ?? false;
  const metrics = await loadDeliverabilityWarmupMetrics(supabase, user.id, warmupEnabled);
  const base = buildCoachInsightsFromSuite(metrics);
  const ai = await generateAiCoachLayer(base);
  const nowIso = new Date().toISOString();
  const coachJson = {
    suggestions: [...ai.suggestions, ...ai.pattern_notes].slice(0, 10),
    subject_line_ideas: ai.subject_line_ideas,
    pattern_notes: ai.pattern_notes,
    cached_at: nowIso,
  };
  const nextSend = computeNextSuggestedSendIso();

  const upsertBody = {
    user_id: user.id,
    deliverability_health_score: base.healthScore,
    last_coach_json: coachJson,
    last_coach_at: nowIso,
    next_suggested_send_at: nextSend,
    updated_at: nowIso,
  };

  const up = await supabase.from("user_deliverability_prefs").upsert(upsertBody, {
    onConflict: "user_id",
  });
  if (up.error) {
    if (!isSupabaseMissingColumnError(up.error)) {
      console.error("[AgentForge] refreshDeliverabilityCoachAction prefs", up.error.message);
      return { ok: false, error: up.error.message };
    }
    const basicUp = await supabase.from("user_deliverability_prefs").upsert(
      {
        user_id: user.id,
        warmup_enabled: warmupEnabled,
        updated_at: nowIso,
      },
      { onConflict: "user_id" },
    );
    if (basicUp.error) {
      return { ok: false, error: basicUp.error.message };
    }
  }

  const snap = await supabase.from("deliverability_health_snapshots").insert({
    user_id: user.id,
    composite_health: base.healthScore,
    placement_prediction: base.placementPrediction,
    coaching_json: coachJson,
  });
  if (snap.error && snap.error.code !== "42P01" && !/deliverability_health_snapshots/i.test(snap.error.message)) {
    console.warn("[AgentForge] refreshDeliverabilityCoachAction snapshot", snap.error.message);
  }

  const merged = mergeCoachWithCache(base, coachJson, nowIso);

  revalidatePath("/");
  revalidatePath("/analytics");
  return { ok: true, coach: merged.insights, cachedAt: merged.cachedCoachAt };
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

  const withTag = {
    user_id: user.id,
    log_date: isoToday,
    emails_sent: next,
    inbox_placement_score,
    schedule_tag: scheduleTagForUtcNow(),
  };
  let error = (
    await supabase.from("email_warmup_logs").upsert(withTag, { onConflict: "user_id,log_date" })
  ).error;

  if (error && isSupabaseMissingColumnError(error)) {
    error = (
      await supabase
        .from("email_warmup_logs")
        .upsert(
          {
            user_id: user.id,
            log_date: isoToday,
            emails_sent: next,
            inbox_placement_score,
          },
          { onConflict: "user_id,log_date" },
        )
    ).error;
  }

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
  /** Prompt 115 — link analysis row to inbox message after save. */
  inbox_message_id: z.string().uuid().optional(),
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
      if (parsed.data.inbox_message_id) {
        await supabase
          .from("inbox_messages")
          .update({
            reply_analysis_id: inserted.id,
            analyzed_at: new Date().toISOString(),
          })
          .eq("id", parsed.data.inbox_message_id)
          .eq("user_id", user.id);
      }
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

export type ListInboxThreadsOptions = {
  /** Prompt 119 — list only archived threads (otherwise archived are excluded). */
  includeArchived?: boolean;
  /** Prompt 132 — `sent` = threads whose latest message is outbound. */
  folder?: "inbox" | "sent";
};

/**
 * Prompt 115 — Inbox threads for the signed-in user (newest activity first).
 * Prompt 119 — Optional archive/snooze columns + view filter.
 */
export async function listInboxThreadsAction(
  search?: string,
  opts?: ListInboxThreadsOptions,
): Promise<InboxThreadRow[]> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return [];
  await ensureInboxSchemaReady();
  const baseSelect =
    "id, user_id, prospect_email, subject, snippet, last_message_at, campaign_thread_id, created_at";
  const extendedSelect = `${baseSelect}, user_last_read_at`;
  const fullSelect = `${extendedSelect}, archived_at, snoozed_until, labels`;

  const term = search?.trim();
  const esc = term
    ? term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
    : "";

  const runQuery = async (selectStr: string) => {
    let qq = supabase
      .from("inbox_threads")
      .select(selectStr)
      .eq("user_id", user.id)
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (term) {
      qq = qq.or(`subject.ilike.%${esc}%,snippet.ilike.%${esc}%,prospect_email.ilike.%${esc}%`);
    }
    return qq;
  };

  let { data, error } = await runQuery(fullSelect);
  let hasReadColumn = true;
  let hasArchiveCols = true;
  if (error && isInboxOptionalColumnOrSchemaError(error.message)) {
    hasArchiveCols = false;
    const second = await runQuery(extendedSelect);
    data = second.data;
    error = second.error;
  }
  if (error && isInboxOptionalColumnOrSchemaError(error.message)) {
    hasReadColumn = false;
    const third = await runQuery(baseSelect);
    data = third.data;
    error = third.error;
  }
  if (error) {
    if (isInboxRelationMissingError(error.message) || isInboxOptionalColumnOrSchemaError(error.message)) {
      return [];
    }
    console.error("[AgentForge] listInboxThreadsAction", error.message);
    return [];
  }
  let threads = (data ?? []) as unknown as InboxThreadRow[];
  if (threads.length === 0) return threads;

  const { data: pendingRows, error: pendErr } = await supabase
    .from("inbox_messages")
    .select("thread_id")
    .eq("user_id", user.id)
    .eq("direction", "inbound")
    .is("reply_analysis_id", null);
  if (pendErr) {
    if (!isInboxOptionalColumnOrSchemaError(pendErr.message)) {
      console.error("[AgentForge] listInboxThreadsAction needs_review", pendErr.message);
    }
    threads = threads.map((t) => ({
      ...t,
      has_unread: hasReadColumn ? computeThreadUnread(t.last_message_at, t.user_last_read_at ?? null) : false,
      needs_review: false,
    }));
  } else {
    const needsReview = new Set(
      (pendingRows ?? [])
        .map((r) => (r as { thread_id?: string }).thread_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    );
    threads = threads.map((t) => ({
      ...t,
      has_unread: hasReadColumn ? computeThreadUnread(t.last_message_at, t.user_last_read_at ?? null) : false,
      needs_review: needsReview.has(t.id),
    }));
  }

  if (hasArchiveCols) {
    const wantArchived = opts?.includeArchived === true;
    threads = threads.filter((t) => (wantArchived ? threadIsArchived(t) : !threadIsArchived(t)));
    threads = threads.filter((t) => !threadIsSnoozed(t));
  }

  if (opts?.folder === "sent" && threads.length > 0) {
    const { data: msgRows } = await supabase
      .from("inbox_messages")
      .select("thread_id, direction, received_at")
      .eq("user_id", user.id)
      .order("received_at", { ascending: false })
      .limit(1000);
    const seen = new Set<string>();
    const sentIds = new Set<string>();
    for (const r of msgRows ?? []) {
      const row = r as { thread_id?: string; direction?: string };
      const tid = row.thread_id;
      if (!tid || seen.has(tid)) continue;
      seen.add(tid);
      if (row.direction === "outbound") sentIds.add(tid);
    }
    threads = threads.filter((t) => sentIds.has(t.id));
  }

  return threads;
}

const inboxDraftUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  to_email: z.string().max(320),
  subject: z.string().max(500),
  body_text: z.string().max(50_000),
});

/**
 * Prompt 129 — Create or update a compose draft (auto-save).
 */
export async function upsertInboxDraftAction(
  raw: z.input<typeof inboxDraftUpsertSchema>,
): Promise<{ ok: true; draft: InboxDraftRow } | { ok: false; error: string }> {
  const parsed = inboxDraftUpsertSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid draft." };
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "Unauthorized" };
  await ensureInboxSchemaReady();
  const now = new Date().toISOString();
  const { id, to_email, subject, body_text } = parsed.data;

  if (id) {
    const { data, error } = await supabase
      .from("inbox_drafts")
      .update({
        to_email,
        subject,
        body_text,
        updated_at: now,
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id, user_id, to_email, subject, body_text, updated_at, created_at")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Draft not found." };
    return { ok: true, draft: data as InboxDraftRow };
  }

  const { data, error } = await supabase
    .from("inbox_drafts")
    .insert({
      user_id: user.id,
      to_email,
      subject,
      body_text,
      updated_at: now,
    })
    .select("id, user_id, to_email, subject, body_text, updated_at, created_at")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, draft: data as InboxDraftRow };
}

/**
 * Prompt 129 — List compose drafts (newest first).
 */
export async function listInboxDraftsAction(): Promise<InboxDraftRow[]> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return [];
  await ensureInboxSchemaReady();
  const { data, error } = await supabase
    .from("inbox_drafts")
    .select("id, user_id, to_email, subject, body_text, updated_at, created_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  if (error) {
    if (isInboxRelationMissingError(error.message)) return [];
    console.error("[AgentForge] listInboxDraftsAction", error.message);
    return [];
  }
  return (data ?? []) as InboxDraftRow[];
}

const inboxDraftIdSchema = z.object({ id: z.string().uuid() });

/**
 * Prompt 129 — Single draft for compose restore.
 */
export async function getInboxDraftByIdAction(
  raw: z.input<typeof inboxDraftIdSchema>,
): Promise<{ ok: true; draft: InboxDraftRow } | { ok: false; error: string }> {
  const parsed = inboxDraftIdSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid draft." };
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "Unauthorized" };
  await ensureInboxSchemaReady();
  const { data, error } = await supabase
    .from("inbox_drafts")
    .select("id, user_id, to_email, subject, body_text, updated_at, created_at")
    .eq("id", parsed.data.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Draft not found." };
  return { ok: true, draft: data as InboxDraftRow };
}

/**
 * Prompt 129 — Delete one draft (from list or after successful send).
 */
export async function deleteInboxDraftAction(
  raw: z.input<typeof inboxDraftIdSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = inboxDraftIdSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid draft." };
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "Unauthorized" };
  await ensureInboxSchemaReady();
  const { error } = await supabase
    .from("inbox_drafts")
    .delete()
    .eq("id", parsed.data.id)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Prompt 129 — Badge count for header + compose button.
 */
export async function getInboxDraftCountAction(): Promise<number> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return 0;
  await ensureInboxSchemaReady();
  const { count, error } = await supabase
    .from("inbox_drafts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (error) {
    if (isInboxRelationMissingError(error.message)) return 0;
    return 0;
  }
  return count ?? 0;
}

/**
 * Prompt 119 — Unread count for tab badge + notifications (excludes snoozed threads).
 */
export async function getInboxUnreadCountAction(): Promise<number> {
  const threads = await listInboxThreadsAction();
  return threads.filter((t) => t.has_unread === true && !threadIsSnoozed(t)).length;
}

const archiveInboxThreadSchema = z.object({
  thread_id: z.string().uuid(),
  archived: z.boolean(),
});

/** Prompt 119 — Archive or restore a thread. */
export async function archiveInboxThreadAction(
  raw: z.input<typeof archiveInboxThreadSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = archiveInboxThreadSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid thread." };
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "Unauthorized" };
  await ensureInboxSchemaReady();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("inbox_threads")
    .update({
      archived_at: parsed.data.archived ? now : null,
      updated_at: now,
    })
    .eq("id", parsed.data.thread_id)
    .eq("user_id", user.id);
  if (error) {
    if (isOptionalInboxThreadColumnMissingError(error.message)) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath("/");
  return { ok: true };
}

const snoozeInboxThreadSchema = z.object({
  thread_id: z.string().uuid(),
  /** `null` clears snooze. */
  hours: z.union([z.literal(1), z.literal(24), z.literal(168)]).nullable(),
});

/** Prompt 119 — Snooze thread (1h, 24h, 7d) or clear snooze. */
export async function snoozeInboxThreadAction(
  raw: z.input<typeof snoozeInboxThreadSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = snoozeInboxThreadSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid snooze." };
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "Unauthorized" };
  await ensureInboxSchemaReady();
  let until: string | null = null;
  if (parsed.data.hours != null) {
    until = new Date(Date.now() + parsed.data.hours * 3600 * 1000).toISOString();
  }
  const { error } = await supabase
    .from("inbox_threads")
    .update({
      snoozed_until: until,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.thread_id)
    .eq("user_id", user.id);
  if (error) {
    if (isOptionalInboxThreadColumnMissingError(error.message)) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath("/");
  return { ok: true };
}

const setInboxLabelsSchema = z.object({
  thread_id: z.string().uuid(),
  labels: z.array(z.string().max(48)).max(12),
});

/** Prompt 119 — Replace thread labels (normalized slugs). */
export async function setInboxThreadLabelsAction(
  raw: z.input<typeof setInboxLabelsSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = setInboxLabelsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid labels." };
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "Unauthorized" };
  const normalized = [
    ...new Set(
      parsed.data.labels
        .map((s) =>
          s
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9\s_-]/g, "")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 32),
        )
        .filter((s) => s.length > 0),
    ),
  ].slice(0, 8);
  await ensureInboxSchemaReady();
  const { error } = await supabase
    .from("inbox_threads")
    .update({
      labels: normalized,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.thread_id)
    .eq("user_id", user.id);
  if (error) {
    if (isOptionalInboxThreadColumnMissingError(error.message)) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath("/");
  return { ok: true };
}

/**
 * Prompt 115 — Messages in a thread (oldest first for reading order).
 */
export async function listInboxMessagesAction(threadId: string): Promise<InboxMessageRow[]> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return [];
  if (!threadId.trim()) return [];
  await ensureInboxSchemaReady();
  const { data, error } = await supabase
    .from("inbox_messages")
    .select(
      "id, thread_id, user_id, direction, from_email, to_email, subject, body_text, body_html, received_at, reply_analysis_id, analyzed_at, created_at",
    )
    .eq("user_id", user.id)
    .eq("thread_id", threadId.trim())
    .order("received_at", { ascending: true })
    .limit(200);
  if (error) {
    if (isInboxRelationMissingError(error.message) || isInboxOptionalColumnOrSchemaError(error.message)) {
      return [];
    }
    console.error("[AgentForge] listInboxMessagesAction", error.message);
    return [];
  }
  const messages = (data ?? []) as InboxMessageRow[];
  const analysisIds = [
    ...new Set(
      messages.map((m) => m.reply_analysis_id).filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  if (analysisIds.length === 0) return messages;

  const { data: raRows, error: raErr } = await supabase
    .from("reply_analyses")
    .select("id, analysis, sentiment, interest_score, suggested_voice, next_step, objections")
    .eq("user_id", user.id)
    .in("id", analysisIds);
  if (raErr || !raRows?.length) {
    if (raErr && !isMissingColumnOrSchemaError(raErr.message)) {
      console.error("[AgentForge] listInboxMessagesAction reply_analyses", raErr.message);
    }
    return messages;
  }
  const byId = new Map<string, ProspectReplyAnalysisPayload>();
  for (const row of raRows) {
    const id = (row as { id?: string }).id;
    if (typeof id !== "string") continue;
    const merged = mergeReplyRowIntoAnalysisPayload(row as Record<string, unknown>);
    if (merged) byId.set(id, merged);
  }
  return messages.map((m) => ({
    ...m,
    analysis: m.reply_analysis_id ? (byId.get(m.reply_analysis_id) ?? null) : null,
  }));
}

/**
 * Prompt 115 — Run reply analyzer on an inbox message (links row on success).
 */
export async function analyzeInboxMessageAction(
  messageId: string,
): Promise<AnalyzeProspectReplyResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Unauthorized" };
  }
  if (!messageId.trim()) {
    return { ok: false, error: "Missing message." };
  }
  const { data: msg, error: msgErr } = await supabase
    .from("inbox_messages")
    .select("id, thread_id, body_text, user_id")
    .eq("id", messageId.trim())
    .eq("user_id", user.id)
    .maybeSingle();
  if (msgErr || !msg) {
    return { ok: false, error: "Message not found." };
  }
  const m = msg as { thread_id: string; body_text?: string };
  const { data: th } = await supabase
    .from("inbox_threads")
    .select("prospect_email, campaign_thread_id")
    .eq("id", m.thread_id)
    .eq("user_id", user.id)
    .maybeSingle();
  const t = th as { prospect_email?: string; campaign_thread_id?: string | null } | null;
  return analyzeProspectReplyAction({
    text: String((m as { body_text?: string }).body_text ?? ""),
    thread_id: t?.campaign_thread_id?.trim() || undefined,
    prospect_email: t?.prospect_email?.trim() || undefined,
    inbox_message_id: messageId.trim(),
  });
}

/**
 * Prompt 117 — Mark thread as read (sidebar unread dot + filter).
 */
export async function markInboxThreadReadAction(threadId: string): Promise<{ ok: boolean }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false };
  const tid = threadId.trim();
  if (!tid) return { ok: false };
  await ensureInboxSchemaReady();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("inbox_threads")
    .update({ user_last_read_at: now, updated_at: now })
    .eq("id", tid)
    .eq("user_id", user.id);
  if (error) {
    if (isOptionalInboxThreadColumnMissingError(error.message)) return { ok: true };
    console.error("[AgentForge] markInboxThreadReadAction", error.message);
    return { ok: false };
  }
  revalidatePath("/");
  return { ok: true };
}

const sendInboxReplySchema = z.object({
  thread_id: z.string().uuid(),
  body: z.string().min(1).max(50_000),
  subject: z.string().max(500).optional(),
});

/**
 * Prompt 118 — Send inbox reply via Resend; persist outbound row + refresh thread snippet.
 * Prompt 122 — After send, `linkInboxThreadToCampaignIfKnown` syncs `campaign_thread_id` when a campaign exists.
 */
export async function sendInboxReplyAction(
  raw: z.input<typeof sendInboxReplySchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = sendInboxReplySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Enter a message (up to ~50k characters)." };
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Unauthorized" };
  }
  await ensureInboxSchemaReady();

  const { data: th, error: thErr } = await supabase
    .from("inbox_threads")
    .select("id, prospect_email, subject, user_id")
    .eq("id", parsed.data.thread_id.trim())
    .eq("user_id", user.id)
    .maybeSingle();
  if (thErr || !th) {
    return { ok: false, error: "Thread not found." };
  }
  const row = th as { id: string; prospect_email: string; subject: string };
  const prospectEmail = normalizeEmail(row.prospect_email);
  if (!prospectEmail.includes("@")) {
    return { ok: false, error: "Invalid prospect address." };
  }

  const baseSubject = row.subject?.trim() || "(no subject)";
  const subj = parsed.data.subject?.trim();
  const subject =
    subj && subj.length > 0
      ? subj
      : /^\s*re:/i.test(baseSubject)
        ? baseSubject
        : `Re: ${baseSubject}`;

  let senderName = "";
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

  await getOrSyncInboxLocalPart(supabase, user.id, senderName || "User");
  const { data: profInbox } = await supabase
    .from("profiles")
    .select("inbox_local_part")
    .eq("id", user.id)
    .maybeSingle();
  const inboxPart =
    profInbox &&
    typeof (profInbox as { inbox_local_part?: string }).inbox_local_part === "string" &&
    (profInbox as { inbox_local_part: string }).inbox_local_part.trim()
      ? (profInbox as { inbox_local_part: string }).inbox_local_part.trim()
      : null;

  const fromHeader = buildDynamicFromEmail(senderName || null, inboxPart);
  const replyBare = extractBareEmailFromFromHeader(fromHeader);
  const userSignupEmail =
    typeof user.email === "string" && user.email.trim().length > 0 ? user.email.trim() : null;
  if (!replyBare && !userSignupEmail) {
    return { ok: false, error: "Account email missing — cannot set Reply-To." };
  }

  warnIfResendNotConfigured();
  const html = plainTextToEmailHtml(parsed.data.body);
  const send = await sendTransactionalEmail({
    to: prospectEmail,
    subject,
    html,
    from: fromHeader,
    reply_to: replyBare ?? userSignupEmail!,
  });
  if (!send.ok) {
    return { ok: false, error: send.error };
  }

  const now = new Date().toISOString();
  const snippet = snippetFromBodyText(parsed.data.body, 220);
  const fromAddr = replyBare ?? userSignupEmail ?? "";

  const { error: insErr } = await supabase.from("inbox_messages").insert({
    thread_id: row.id,
    user_id: user.id,
    direction: "outbound",
    from_email: fromAddr,
    to_email: prospectEmail,
    subject,
    body_text: parsed.data.body.slice(0, 50_000),
    body_html: null,
    received_at: now,
    raw: { source: "inbox_reply_composer" },
  });
  if (insErr) {
    console.error("[AgentForge] sendInboxReplyAction insert", insErr.message);
    return { ok: false, error: "Email sent but failed to save to thread." };
  }

  let upErr = (
    await supabase
      .from("inbox_threads")
      .update({
        last_message_at: now,
        snippet,
        updated_at: now,
        user_last_read_at: now,
      })
      .eq("id", row.id)
      .eq("user_id", user.id)
  ).error;
  if (upErr && isOptionalInboxThreadColumnMissingError(upErr.message)) {
    upErr = (
      await supabase
        .from("inbox_threads")
        .update({
          last_message_at: now,
          snippet,
          updated_at: now,
        })
        .eq("id", row.id)
        .eq("user_id", user.id)
    ).error;
  }
  if (upErr) {
    console.error("[AgentForge] sendInboxReplyAction thread update", upErr.message);
  }

  await linkInboxThreadToCampaignIfKnown(supabase, {
    userId: user.id,
    inboxThreadId: row.id,
    prospectEmail,
  });

  revalidatePath("/");
  revalidatePath("/replies");
  return { ok: true };
}

const sendNewInboxEmailSchema = z.object({
  to: z.string().trim().min(3).max(320).email(),
  subject: z.string().trim().min(1).max(500),
  body: z.string().min(1).max(50_000),
});

/**
 * Prompt 124 — Send a brand-new message from the inbox composer (dynamic From + same Reply-To as replies).
 */
export async function sendNewInboxEmailAction(
  raw: z.input<typeof sendNewInboxEmailSchema>,
): Promise<{ ok: true; threadId: string } | { ok: false; error: string }> {
  const parsed = sendNewInboxEmailSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid recipient, subject, and message (up to ~50k characters)." };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Unauthorized" };
  }
  await ensureInboxSchemaReady();

  const prospectEmail = normalizeComposeRecipientEmail(parsed.data.to);
  if (!prospectEmail.includes("@")) {
    return { ok: false, error: "Invalid recipient address." };
  }

  const subjectLine = parsed.data.subject.trim();

  let senderName = "";
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

  await getOrSyncInboxLocalPart(supabase, user.id, senderName || "User");
  const { data: profInbox } = await supabase
    .from("profiles")
    .select("inbox_local_part")
    .eq("id", user.id)
    .maybeSingle();
  const inboxPart =
    profInbox &&
    typeof (profInbox as { inbox_local_part?: string }).inbox_local_part === "string" &&
    (profInbox as { inbox_local_part: string }).inbox_local_part.trim()
      ? (profInbox as { inbox_local_part: string }).inbox_local_part.trim()
      : null;

  const fromHeader = buildDynamicFromEmail(senderName || null, inboxPart);
  const replyBare = extractBareEmailFromFromHeader(fromHeader);
  const userSignupEmail =
    typeof user.email === "string" && user.email.trim().length > 0 ? user.email.trim() : null;
  if (!replyBare && !userSignupEmail) {
    return { ok: false, error: "Account email missing — cannot set Reply-To." };
  }

  warnIfResendNotConfigured();
  const html = plainTextToEmailHtml(parsed.data.body);
  const send = await sendTransactionalEmail({
    to: prospectEmail,
    subject: subjectLine,
    html,
    from: fromHeader,
    reply_to: replyBare ?? userSignupEmail!,
  });
  if (!send.ok) {
    return { ok: false, error: send.error };
  }

  const now = new Date().toISOString();
  const fromAddr = replyBare ?? userSignupEmail ?? "";

  const rec = await recordNewComposeMessageInInbox(supabase, {
    userId: user.id,
    prospectEmail,
    subject: subjectLine,
    bodyText: parsed.data.body,
    fromBareForStorage: fromAddr,
    now,
  });
  if (!rec.ok) {
    return { ok: false, error: rec.error };
  }

  await linkInboxThreadToCampaignIfKnown(supabase, {
    userId: user.id,
    inboxThreadId: rec.threadId,
    prospectEmail,
  });

  revalidatePath("/");
  revalidatePath("/inbox");
  revalidatePath("/replies");
  return { ok: true, threadId: rec.threadId };
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
  dealCloseQualifications: [],
  avgCloseProbability: null,
  optimizerFeed: [],
  coachingPreview: null,
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
    "results, thread_id, completed_at, predicted_revenue, win_probability, lead_name, company, email, qualification_score, ab_variant";
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

  const campRowsAll = campRes.data ?? [];
  const workspaceHistoricalCompleted = campRowsAll.filter((row) => {
    const s = snapshotFromPersistedResults((row as { results?: unknown }).results);
    return s?.final_status === "completed" || s?.final_status === "completed_with_errors";
  }).length;

  const dealCloseQualificationsRaw: DealCloseQualificationRow[] = [];
  for (const row of campRowsAll) {
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
    const engine = computeDealQualificationClose(snap, {
      replyInterest0to10: replyI,
      workspaceHistoricalCompletedCount: workspaceHistoricalCompleted,
    });
    dealCloseQualificationsRaw.push({
      thread_id: tid,
      lead_name: leadName,
      company,
      close_probability: engine.close_probability,
      confidence: engine.confidence,
      factors: engine.factors,
      suggested_actions: engine.suggested_actions,
      completed_at: completed,
    });
  }
  dealCloseQualificationsRaw.sort((a, b) => b.close_probability - a.close_probability);
  const dealCloseQualifications = dealCloseQualificationsRaw.slice(0, 28);
  const avgCloseProbability =
    dealCloseQualificationsRaw.length > 0
      ? Math.round(
          dealCloseQualificationsRaw.reduce((s, x) => s + x.close_probability, 0) /
            dealCloseQualificationsRaw.length,
        )
      : null;

  const optimizerFeed = buildDashboardOptimizerFeedFromRows(
    campRowsAll as Record<string, unknown>[],
    interestByThread,
    interestByEmail,
  );

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

  const voiceStats = computeVoiceCoachingStats(campRowsAll);
  const coachingPreview = buildDeterministicCoachingPreview({
    voiceStats,
    abTestComparisons,
    forecastTrend,
    avgReplyInterest: avgInterest,
    avgCompositeScore: avgComposite,
    avgWarmupPlacementScore,
    replyAnalyzedCount: nRep,
    campaignCount: nCamp,
  });

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
    dealCloseQualifications,
    avgCloseProbability,
    optimizerFeed,
    coachingPreview,
  };
}

function isCoachingCacheStale(cachedAt: string | null): boolean {
  if (!cachedAt) return true;
  const t = new Date(cachedAt).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() - t > 3 * 86400000;
}

function parseCoachingNotesPayload(raw: unknown): {
  ai: SalesCoachingPayloadDTO["ai"];
  cachedAt: string | null;
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ai: null, cachedAt: null };
  }
  const o = raw as Record<string, unknown>;
  const cachedAt = typeof o.cached_at === "string" ? o.cached_at : null;
  const tips = Array.isArray(o.personalized_tips)
    ? o.personalized_tips.filter((x): x is string => typeof x === "string")
    : [];
  const focus = Array.isArray(o.focus_areas)
    ? o.focus_areas.filter((x): x is string => typeof x === "string")
    : [];
  const seq = Array.isArray(o.sequence_tips)
    ? o.sequence_tips.filter((x): x is string => typeof x === "string")
    : [];
  const vtRaw = Array.isArray(o.voice_tips) ? o.voice_tips : [];
  const voice_tips = vtRaw
    .map((x) => {
      if (!x || typeof x !== "object") return null;
      const v = x as Record<string, unknown>;
      const voice = typeof v.voice === "string" ? v.voice.trim() : "";
      const tip = typeof v.tip === "string" ? v.tip.trim() : "";
      return voice && tip ? { voice, tip } : null;
    })
    .filter((x): x is { voice: string; tip: string } => x != null);
  const team = typeof o.team_insight === "string" ? o.team_insight.trim() : null;
  if (
    tips.length === 0 &&
    focus.length === 0 &&
    seq.length === 0 &&
    voice_tips.length === 0 &&
    !team
  ) {
    return { ai: null, cachedAt };
  }
  return {
    ai: {
      personalized_tips: tips,
      focus_areas: focus,
      voice_tips,
      sequence_tips: seq,
      team_insight: team || null,
    },
    cachedAt,
  };
}

/**
 * Prompt 101 — AI coaching + cached profile notes; pass `analytics` from the dashboard to avoid a second query.
 */
export async function getSalesCoachingPayloadAction(
  analytics?: DashboardAnalyticsSummary,
): Promise<SalesCoachingPayloadDTO> {
  const empty: SalesCoachingPayloadDTO = {
    preview: null,
    ai: null,
    cachedAt: null,
    weeklyEmailEnabled: false,
    performanceMetrics: null,
  };
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return empty;

  const a = analytics ?? (await getDashboardAnalytics());
  const preview = a.coachingPreview;

  const ext = await supabase
    .from("profiles")
    .select("coaching_notes, performance_metrics, coaching_weekly_email_enabled")
    .eq("id", user.id)
    .maybeSingle();

  let coachingNotes: unknown;
  let performanceMetrics: Record<string, unknown> | null = null;
  let weeklyEmailEnabled = false;

  if (!ext.error && ext.data) {
    const r = ext.data as Record<string, unknown>;
    coachingNotes = r.coaching_notes;
    performanceMetrics =
      r.performance_metrics != null && typeof r.performance_metrics === "object" && !Array.isArray(r.performance_metrics)
        ? (r.performance_metrics as Record<string, unknown>)
        : null;
    weeklyEmailEnabled = Boolean(r.coaching_weekly_email_enabled);
  } else if (ext.error && !isMissingColumnOrSchemaError(ext.error.message)) {
    console.warn("[AgentForge] getSalesCoachingPayloadAction profiles", ext.error.message);
  }

  const parsed = parseCoachingNotesPayload(coachingNotes);
  let ai = parsed.ai;
  let cachedAt = parsed.cachedAt;

  const shouldRefresh =
    preview != null && (isCoachingCacheStale(cachedAt) || !ai?.personalized_tips?.length);

  if (shouldRefresh && preview) {
    const generated = await generateSalesCoachingWithAi({ analytics: a, preview });
    const payloadJson = {
      ...generated,
      cached_at: new Date().toISOString(),
    };
    const perfSnap = {
      voice_stats: preview.voiceStats,
      momentum: preview.momentum,
      updated_at: new Date().toISOString(),
    };
    ai = {
      personalized_tips: generated.personalized_tips,
      focus_areas: generated.focus_areas,
      voice_tips: generated.voice_tips,
      sequence_tips: generated.sequence_tips,
      team_insight: generated.team_insight,
    };
    cachedAt = payloadJson.cached_at;
    performanceMetrics = perfSnap as unknown as Record<string, unknown>;
    const { error: upErr } = await supabase
      .from("profiles")
      .update({
        coaching_notes: payloadJson as unknown as Record<string, unknown>,
        performance_metrics: perfSnap as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    if (upErr && !isMissingColumnOrSchemaError(upErr.message)) {
      console.warn("[AgentForge] getSalesCoachingPayloadAction cache write", upErr.message);
    }
  }

  return {
    preview,
    ai,
    cachedAt,
    weeklyEmailEnabled,
    performanceMetrics,
  };
}

const weeklyCoachingEmailSchema = z.object({
  enabled: z.boolean(),
});

export type SetWeeklyCoachingEmailResult = { ok: true } | { ok: false; error: string };

/** Prompt 101 — weekly summary email opt-in (delivery via scheduled job). */
export async function setWeeklyCoachingEmailAction(
  raw: z.input<typeof weeklyCoachingEmailSchema>,
): Promise<SetWeeklyCoachingEmailResult> {
  const parsed = weeklyCoachingEmailSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "Unauthorized" };

  const { error } = await supabase
    .from("profiles")
    .update({
      coaching_weekly_email_enabled: parsed.data.enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    if (!isMissingColumnOrSchemaError(error.message)) {
      return { ok: false, error: error.message };
    }
  }
  revalidatePath("/");
  return { ok: true };
}

/** Prompt 101 — force refresh AI coaching (same persistence as payload). */
export async function refreshSalesCoachingAction(
  analytics?: DashboardAnalyticsSummary,
): Promise<SalesCoachingPayloadDTO> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  const empty: SalesCoachingPayloadDTO = {
    preview: null,
    ai: null,
    cachedAt: null,
    weeklyEmailEnabled: false,
    performanceMetrics: null,
  };
  if (authError || !user) return empty;

  const a = analytics ?? (await getDashboardAnalytics());
  const preview = a.coachingPreview;
  if (!preview) {
    return getSalesCoachingPayloadAction(a);
  }

  const generated = await generateSalesCoachingWithAi({ analytics: a, preview });
  const payloadJson = {
    ...generated,
    cached_at: new Date().toISOString(),
  };
  const perfSnap = {
    voice_stats: preview.voiceStats,
    momentum: preview.momentum,
    updated_at: new Date().toISOString(),
  };

  const { error: upErr } = await supabase
    .from("profiles")
    .update({
      coaching_notes: payloadJson as unknown as Record<string, unknown>,
      performance_metrics: perfSnap as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (upErr && !isMissingColumnOrSchemaError(upErr.message)) {
    console.warn("[AgentForge] refreshSalesCoachingAction", upErr.message);
  }

  let weeklyEmailEnabled = false;
  const wk = await supabase
    .from("profiles")
    .select("coaching_weekly_email_enabled")
    .eq("id", user.id)
    .maybeSingle();
  if (!wk.error && wk.data) {
    weeklyEmailEnabled = Boolean(
      (wk.data as { coaching_weekly_email_enabled?: unknown }).coaching_weekly_email_enabled,
    );
  }

  revalidatePath("/");
  return {
    preview,
    ai: {
      personalized_tips: generated.personalized_tips,
      focus_areas: generated.focus_areas,
      voice_tips: generated.voice_tips,
      sequence_tips: generated.sequence_tips,
      team_insight: generated.team_insight,
    },
    cachedAt: payloadJson.cached_at,
    weeklyEmailEnabled,
    performanceMetrics: perfSnap as unknown as Record<string, unknown>,
  };
}

/**
 * Prompt 102 — executive metrics + health + cached executive report (`profiles.executive_metrics`,
 * `profiles.system_health_status`).
 */
export async function getSdrManagerPayloadAction(args: {
  analytics: DashboardAnalyticsSummary;
  deliverabilitySuite: DeliverabilitySuitePayload | null;
  calendarStatus: CalendarConnectionStatusDTO;
  hubspotConnected: boolean;
  envWarningCount: number;
  workspaceMemberCount: number;
  coachingPayload?: SalesCoachingPayloadDTO | null;
}): Promise<SdrManagerPayloadDTO> {
  const metrics = computeExecutiveMetrics({
    analytics: args.analytics,
    teamMemberCount: Math.max(1, args.workspaceMemberCount),
  });
  const health = buildSystemHealthStatus({
    analytics: args.analytics,
    deliverabilitySuite: args.deliverabilitySuite,
    calendarStatus: args.calendarStatus,
    hubspotConnected: args.hubspotConnected,
    envWarningCount: args.envWarningCount,
  });

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    let aiRecommendations: string[] = [];
    if (args.coachingPayload?.ai?.personalized_tips?.length) {
      aiRecommendations = args.coachingPayload.ai.personalized_tips.slice(0, 8);
    }
    return {
      metrics,
      health,
      cachedExecutiveReportMarkdown: null,
      cachedReportAt: null,
      aiRecommendations,
    };
  }

  const ext = await supabase
    .from("profiles")
    .select("executive_metrics, system_health_status")
    .eq("id", user.id)
    .maybeSingle();

  let cachedExecutiveReportMarkdown: string | null = null;
  let cachedReportAt: string | null = null;
  let aiRecommendations: string[] = [];

  if (!ext.error && ext.data) {
    const row = ext.data as Record<string, unknown>;
    const em = row.executive_metrics;
    if (em && typeof em === "object" && !Array.isArray(em)) {
      const o = em as Record<string, unknown>;
      if (typeof o.last_report_markdown === "string") {
        cachedExecutiveReportMarkdown = o.last_report_markdown;
      }
      if (typeof o.last_report_at === "string") {
        cachedReportAt = o.last_report_at;
      }
      if (Array.isArray(o.ai_recommendations)) {
        aiRecommendations = o.ai_recommendations.map(String).filter(Boolean);
      }
    }
  } else if (ext.error && !isMissingColumnOrSchemaError(ext.error.message)) {
    console.warn("[AgentForge] getSdrManagerPayloadAction profiles", ext.error.message);
  }

  if (!aiRecommendations.length && args.coachingPayload?.ai?.personalized_tips?.length) {
    aiRecommendations = args.coachingPayload.ai.personalized_tips.slice(0, 8);
  }

  const executiveMetricsJson: Record<string, unknown> = {
    snapshot: metrics,
    snapshot_at: new Date().toISOString(),
    last_report_markdown: cachedExecutiveReportMarkdown,
    last_report_at: cachedReportAt,
    ai_recommendations: aiRecommendations,
  };

  const { error: upErr } = await supabase
    .from("profiles")
    .update({
      executive_metrics: executiveMetricsJson,
      system_health_status: health as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (upErr && !isMissingColumnOrSchemaError(upErr.message)) {
    console.warn("[AgentForge] getSdrManagerPayloadAction persist", upErr.message);
  }

  return {
    metrics,
    health,
    cachedExecutiveReportMarkdown,
    cachedReportAt,
    aiRecommendations,
  };
}

export type GenerateExecutiveReportResult =
  | { ok: true; markdown: string; generatedAt: string }
  | { ok: false; error: string };

/** Prompt 102 — one-click AI executive report; persists to `profiles.executive_metrics`. */
export async function generateExecutiveReportAction(): Promise<GenerateExecutiveReportResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "Unauthorized" };

  const envWarningCount = getDashboardEnvWarnings().length;

  const [analytics, deliverabilitySuite, calendarStatus, ws] = await Promise.all([
    getDashboardAnalytics(),
    getDeliverabilitySuiteAction(),
    getCalendarConnectionStatusAction(),
    getWorkspaceMembersAction(),
  ]);

  const sr = getServiceRoleSupabaseOrNull();
  let hubspotConnected = false;
  if (sr) {
    const { data: hs } = await sr
      .from("user_hubspot_credentials")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    hubspotConnected = !!hs;
  }

  const workspaceMemberCount = Math.max(1, ws?.members?.length ?? 1);

  const metrics = computeExecutiveMetrics({
    analytics,
    teamMemberCount: workspaceMemberCount,
  });
  const health = buildSystemHealthStatus({
    analytics,
    deliverabilitySuite,
    calendarStatus,
    hubspotConnected,
    envWarningCount,
  });

  const analyticsSnippet = {
    campaignCount: analytics.campaignCount,
    forecastWeightedPipelineUsd: analytics.forecastWeightedPipelineUsd,
    avgCompositeScore: analytics.avgCompositeScore,
    leadPrioritySummary: analytics.leadPrioritySummary,
    coachingMomentum: analytics.coachingPreview?.momentum,
  };

  const report = await generateExecutiveReportWithAi({ metrics, health, analyticsSnippet });
  const markdown = formatExecutiveReportMarkdown(report);
  const generatedAt = new Date().toISOString();

  const executive_metrics = {
    snapshot: metrics,
    snapshot_at: generatedAt,
    last_report_markdown: markdown,
    last_report_at: generatedAt,
    ai_recommendations: report.ai_recommendations,
  };

  const { error: upErr } = await supabase
    .from("profiles")
    .update({
      executive_metrics: executive_metrics as unknown as Record<string, unknown>,
      system_health_status: health as unknown as Record<string, unknown>,
      updated_at: generatedAt,
    })
    .eq("id", user.id);

  if (upErr && !isMissingColumnOrSchemaError(upErr.message)) {
    console.warn("[AgentForge] generateExecutiveReportAction", upErr.message);
    return { ok: false, error: upErr.message };
  }

  revalidatePath("/");
  return { ok: true, markdown, generatedAt };
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
      const { data: prof } = await sr
        .from("profiles")
        .select("full_name, inbox_local_part")
        .eq("id", userId)
        .maybeSingle();
      const fromName =
        prof && typeof (prof as { full_name?: unknown }).full_name === "string"
          ? (prof as { full_name: string }).full_name.trim()
          : null;
      const inboxLp =
        prof &&
        typeof (prof as { inbox_local_part?: unknown }).inbox_local_part === "string" &&
        (prof as { inbox_local_part: string }).inbox_local_part.trim()
          ? (prof as { inbox_local_part: string }).inbox_local_part.trim()
          : null;
      const from = buildDynamicFromEmail(fromName, inboxLp);
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

/** Prompt 97 — list saved playbooks for the active workspace. */
export async function listPlaybooksForWorkspaceAction(): Promise<PlaybookRow[]> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return [];
  await ensurePersonalWorkspaceMembership(supabase, user.id);
  const ws = await resolveWorkspaceContext(supabase, {
    id: user.id,
    email: user.email ?? null,
  });
  const { data, error } = await supabase
    .from("playbooks")
    .select("id, workspace_id, thread_id, lead_name, company, title, playbook_body, created_at")
    .eq("workspace_id", ws.workspaceId)
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) {
    if (!isMissingColumnOrSchemaError(error.message)) {
      console.warn("[AgentForge] listPlaybooksForWorkspace", error.message);
    }
    return [];
  }
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      workspace_id: String(row.workspace_id ?? ""),
      thread_id: row.thread_id != null ? String(row.thread_id) : null,
      lead_name: String(row.lead_name ?? ""),
      company: String(row.company ?? ""),
      title: String(row.title ?? ""),
      playbook_body:
        row.playbook_body && typeof row.playbook_body === "object" && !Array.isArray(row.playbook_body)
          ? (row.playbook_body as Record<string, unknown>)
          : {},
      created_at: String(row.created_at ?? ""),
    };
  });
}

/** Prompt 97 — recent knowledge base rows for the workspace. */
export async function listKnowledgeBaseEntriesAction(): Promise<KnowledgeBaseEntryRow[]> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return [];
  await ensurePersonalWorkspaceMembership(supabase, user.id);
  const ws = await resolveWorkspaceContext(supabase, {
    id: user.id,
    email: user.email ?? null,
  });
  const { data, error } = await supabase
    .from("knowledge_base_entries")
    .select("id, entry_type, title, body, tags, source_thread_id, created_at")
    .eq("workspace_id", ws.workspaceId)
    .order("created_at", { ascending: false })
    .limit(120);
  if (error) {
    if (!isMissingColumnOrSchemaError(error.message)) {
      console.warn("[AgentForge] listKnowledgeBaseEntries", error.message);
    }
    return [];
  }
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      entry_type: String(row.entry_type ?? "account"),
      title: String(row.title ?? ""),
      body: String(row.body ?? ""),
      tags: Array.isArray(row.tags) ? row.tags.filter((t): t is string => typeof t === "string") : [],
      source_thread_id: row.source_thread_id != null ? String(row.source_thread_id) : null,
      created_at: String(row.created_at ?? ""),
    };
  });
}

/** Prompt 97 — generate + persist a playbook from a completed campaign snapshot. */
export async function generatePlaybookForThreadAction(
  threadId: string,
): Promise<{ ok: true; playbookId: string } | { ok: false; error: string }> {
  const tid = threadId.trim();
  if (!tid) return { ok: false, error: "Missing thread id." };
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "Unauthorized" };
  await ensurePersonalWorkspaceMembership(supabase, user.id);
  const ws = await resolveWorkspaceContext(supabase, {
    id: user.id,
    email: user.email ?? null,
  });
  const sr = getServiceRoleSupabaseOrNull();
  const q = sr
    ? sr
        .from("campaigns")
        .select("results, lead_name, company, thread_id, user_id")
        .eq("thread_id", tid)
        .in("user_id", ws.memberUserIds)
    : supabase
        .from("campaigns")
        .select("results, lead_name, company, thread_id, user_id")
        .eq("thread_id", tid)
        .eq("user_id", user.id);
  const { data: row, error } = await q.maybeSingle();
  if (error || !row) {
    return { ok: false, error: "Campaign not found or inaccessible." };
  }
  const snap = snapshotFromPersistedResults(
    (row as { results?: unknown }).results,
  );
  if (!snap) return { ok: false, error: "No campaign snapshot to synthesize." };
  let playbook;
  try {
    playbook = await generateSalesPlaybookWithAi(snap);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg.slice(0, 240) };
  }
  const { data: ins, error: insErr } = await supabase
    .from("playbooks")
    .insert({
      workspace_id: ws.workspaceId,
      user_id: user.id,
      thread_id: tid,
      lead_name: String((row as { lead_name?: string }).lead_name ?? snap.lead.name ?? ""),
      company: String((row as { company?: string }).company ?? snap.lead.company ?? ""),
      title: playbook.title.slice(0, 200),
      playbook_body: playbook as unknown as Record<string, unknown>,
    })
    .select("id")
    .single();
  if (insErr || !ins) {
    const hint = insErr?.message.includes("playbooks")
      ? " Run supabase/playbooks_knowledge_p97.sql."
      : "";
    return { ok: false, error: (insErr?.message ?? "Insert failed.") + hint };
  }
  revalidatePath("/");
  return { ok: true, playbookId: String((ins as { id: string }).id) };
}

/** Prompt 97 — PDF export for a saved playbook (base64 for client download). */
export async function getPlaybookPdfBase64Action(
  playbookId: string,
): Promise<
  | { ok: true; base64: string; filename: string }
  | { ok: false; error: string }
> {
  const id = playbookId.trim();
  if (!id) return { ok: false, error: "Missing id." };
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "Unauthorized" };
  await ensurePersonalWorkspaceMembership(supabase, user.id);
  const ws = await resolveWorkspaceContext(supabase, {
    id: user.id,
    email: user.email ?? null,
  });
  const { data: row, error } = await supabase
    .from("playbooks")
    .select("workspace_id, thread_id, company, playbook_body")
    .eq("id", id)
    .maybeSingle();
  if (error || !row) return { ok: false, error: "Playbook not found." };
  if (String((row as { workspace_id?: string }).workspace_id) !== ws.workspaceId) {
    return { ok: false, error: "Access denied." };
  }
  const parsed = salesPlaybookSchema.safeParse(
    (row as { playbook_body?: unknown }).playbook_body,
  );
  if (!parsed.success) return { ok: false, error: "Invalid playbook payload." };
  const bytes = renderSalesPlaybookPdfBytes(parsed.data, {
    company: String((row as { company?: string }).company ?? "Account"),
    threadId: String((row as { thread_id?: string | null }).thread_id ?? ""),
    exportedAt: new Date().toISOString(),
  });
  return {
    ok: true,
    base64: Buffer.from(bytes).toString("base64"),
    filename: `sales-playbook-${id.slice(0, 8)}.pdf`,
  };
}

/** Prompt 98 — proposal status + URL from persisted campaign row. */
export async function getCampaignProposalStatusAction(threadId: string): Promise<{
  proposal_status: string | null;
  generated_proposal_url: string | null;
}> {
  const tid = threadId.trim();
  if (!tid) return { proposal_status: null, generated_proposal_url: null };
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { proposal_status: null, generated_proposal_url: null };
  }
  await ensurePersonalWorkspaceMembership(supabase, user.id);
  const ws = await resolveWorkspaceContext(supabase, {
    id: user.id,
    email: user.email ?? null,
  });
  const sr = getServiceRoleSupabaseOrNull();
  const q = sr
    ? sr
        .from("campaigns")
        .select("proposal_status, generated_proposal_url")
        .eq("thread_id", tid)
        .in("user_id", ws.memberUserIds)
    : supabase
        .from("campaigns")
        .select("proposal_status, generated_proposal_url")
        .eq("thread_id", tid)
        .eq("user_id", user.id);
  const { data, error } = await q.maybeSingle();
  if (error || !data) {
    return { proposal_status: null, generated_proposal_url: null };
  }
  const row = data as { proposal_status?: unknown; generated_proposal_url?: unknown };
  return {
    proposal_status:
      typeof row.proposal_status === "string" && row.proposal_status.trim()
        ? row.proposal_status.trim()
        : null,
    generated_proposal_url:
      typeof row.generated_proposal_url === "string" && row.generated_proposal_url.trim()
        ? row.generated_proposal_url.trim()
        : null,
  };
}

/** Prompt 98 — AI proposal / quote PDF + optional Storage URL. */
export async function generateCampaignProposalAction(threadId: string): Promise<
  | { ok: true; proposalUrl: string | null; proposal_status: "ready" }
  | { ok: false; error: string }
> {
  const tid = threadId.trim();
  if (!tid) return { ok: false, error: "Missing thread id." };
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "Unauthorized" };
  await ensurePersonalWorkspaceMembership(supabase, user.id);
  const ws = await resolveWorkspaceContext(supabase, {
    id: user.id,
    email: user.email ?? null,
  });
  const sr = getServiceRoleSupabaseOrNull();
  const q = sr
    ? sr
        .from("campaigns")
        .select("results, user_id")
        .eq("thread_id", tid)
        .in("user_id", ws.memberUserIds)
    : supabase
        .from("campaigns")
        .select("results, user_id")
        .eq("thread_id", tid)
        .eq("user_id", user.id);
  const { data: row, error } = await q.maybeSingle();
  if (error || !row) return { ok: false, error: "Campaign not found or inaccessible." };
  const snap = snapshotFromPersistedResults((row as { results?: unknown }).results);
  if (!snap) return { ok: false, error: "No campaign snapshot — run must be saved first." };
  if (!isProposalEligible(snap)) {
    return {
      ok: false,
      error:
        "Proposal unlocks when the lead is Qualified, qualification score is strong, or a Next Best Action is present.",
    };
  }

  const patchStatus = async (status: string, url?: string | null) => {
    if (!sr) return;
    const payload: Record<string, unknown> = { proposal_status: status };
    if (url !== undefined) payload.generated_proposal_url = url;
    const { error: pe } = await sr
      .from("campaigns")
      .update(payload)
      .eq("thread_id", tid)
      .in("user_id", ws.memberUserIds);
    if (pe && !/proposal_status|generated_proposal_url|column|schema/i.test(`${pe.message}`)) {
      console.warn("[AgentForge] proposal status patch", pe.message);
    }
  };

  await patchStatus("generating");

  try {
    const input = await generateProposalPdfInputWithAi(snap, snap.brand_display_name ?? null);
    const bytes = renderProposalPdfBytes(input);
    let publicUrl: string | null = null;
    if (sr) {
      const path = `${user.id}/${tid}/proposal.pdf`;
      const { error: upErr } = await sr.storage.from("campaign-proposals").upload(path, bytes, {
        contentType: "application/pdf",
        upsert: true,
      });
      if (!upErr) {
        const { data: pub } = sr.storage.from("campaign-proposals").getPublicUrl(path);
        publicUrl = pub.publicUrl;
      }
    }
    await patchStatus("ready", publicUrl);
    revalidatePath("/");
    return { ok: true, proposalUrl: publicUrl, proposal_status: "ready" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await patchStatus("failed");
    return { ok: false, error: msg.slice(0, 280) };
  }
}
