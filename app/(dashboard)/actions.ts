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
  type Lead,
  type LeadFormInput,
  type OutreachOutput,
  SDR_VOICE_TONE_VALUES,
  type SdrVoiceTone,
} from "@/agents/types";
import { getServiceRoleSupabaseOrNull } from "@/lib/supabase-server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { hasLlmProviderConfigured, warnIfResendNotConfigured } from "@/lib/env";
import {
  analyzeProspectReply,
  replyAnalysisWithLabels,
  type ReplyAnalysisWithLabels,
} from "@/lib/reply-analyzer";
import type {
  CampaignThreadRow,
  DashboardAnalyticsSummary,
  LiveSignalFeedItem,
  PersistedCampaignRow,
  PersistedReplyAnalysisRow,
  ProspectReplyAnalysisPayload,
} from "@/types";
import { computeCampaignStrength } from "@/lib/campaign-strength";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { withTimeout } from "@/lib/async-timeout";
import { sdrVoiceLabel } from "@/lib/sdr-voice";
import { buildDynamicFromEmail, sendTransactionalEmail } from "@/lib/resend";

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

  return {
    name: l.name.trim(),
    email: l.email.trim(),
    company: l.company.trim(),
    linkedin_url:
      typeof l.linkedin_url === "string" && l.linkedin_url.trim()
        ? l.linkedin_url.trim()
        : "",
    notes: typeof l.notes === "string" ? l.notes : "",
    status,
    sdr_voice_tone,
  };
}

/** Label for list UI — uses same lead shape as re-run parser. */
function parseSdrVoiceLabelFromResults(results: unknown): string | null {
  const lead = parseRerunLeadFromResults(results);
  if (!lead) return null;
  return sdrVoiceLabel(lead.sdr_voice_tone);
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
  lead?: { name?: string; company?: string; sdr_voice_tone?: string };
  current_agent?: string;
  outreach_sent?: boolean;
  outreach_output?: { email_sent?: boolean };
} {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return {};
  }
  const st = state as Record<string, unknown>;
  const rawLead = st.lead;
  let lead: { name?: string; company?: string; sdr_voice_tone?: string } | undefined;
  if (rawLead && typeof rawLead === "object" && !Array.isArray(rawLead)) {
    const l = rawLead as Record<string, unknown>;
    lead = {
      name: typeof l.name === "string" ? l.name : undefined,
      company: typeof l.company === "string" ? l.company : undefined,
      sdr_voice_tone:
        typeof l.sdr_voice_tone === "string" ? l.sdr_voice_tone : undefined,
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
  userId: string,
): Promise<LiveSignalFeedItem[]> {
  const { data, error } = await supabase
    .from("campaign_signals")
    .select("id, thread_id, signal_type, signal_text, created_at")
    .eq("user_id", userId)
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
  userId: string,
): Promise<Record<string, unknown>[]> {
  const full = await supabase
    .from("reply_analyses")
    .select("interest_score, analysis")
    .eq("user_id", userId)
    .limit(2000);
  if (!full.error) {
    return (full.data ?? []) as Record<string, unknown>[];
  }
  if (isMissingColumnOrSchemaError(full.error.message)) {
    const fb = await supabase
      .from("reply_analyses")
      .select("analysis")
      .eq("user_id", userId)
      .limit(2000);
    if (!fb.error) {
      return (fb.data ?? []) as Record<string, unknown>[];
    }
  }
  return [];
}

function voiceLabelFromCheckpointTone(tone: string | undefined): string | null {
  if (!tone || !SDR_VOICE_TONE_VALUES.includes(tone as SdrVoiceTone)) {
    return null;
  }
  return sdrVoiceLabel(tone as SdrVoiceTone);
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
    sdr_voice_label: voiceLabelFromCheckpointTone(st.lead?.sdr_voice_tone),
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
  notes: z.string().optional(),
  status: z
    .enum(["new", "contacted", "qualified", "nurtured", "closed"])
    .default("new"),
  sdr_voice_tone: z.enum(SDR_VOICE_TONE_VALUES).default("default"),
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

  const lead: Lead = {
    id: parsed.data.id ?? randomUUID(),
    name: parsed.data.name,
    email: parsed.data.email,
    company: parsed.data.company,
    linkedin_url: parsed.data.linkedin_url,
    notes: parsed.data.notes,
    status: parsed.data.status,
    sdr_voice_tone: parsed.data.sdr_voice_tone,
  };

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
    await deleteThreadCheckpoint(thread_id);
    const finalState = await withTimeout(
      runCampaignGraph({
        lead,
        thread_id,
        user_id: user.id,
        sender_signoff_name: senderSignoffName || undefined,
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

  const { data, error } = await supabase
    .from("campaigns")
    .select(
      "id, thread_id, lead_name, company, email, status, created_at, completed_at, results",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(25);

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
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (primary.error) {
      logCheckpointListError("primary (thread_id, updated_at, state)", primary.error);
      const fallback = await sb
        .from("agent_graph_checkpoints")
        .select("thread_id, updated_at")
        .eq("user_id", user.id)
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

const sendOutreachEmailSchema = z.object({
  thread_id: z.string().min(1).max(260),
});

export type SendOutreachEmailResult =
  | { ok: true; snapshot: CampaignClientSnapshot }
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

  const { data: row, error: rowError } = await supabase
    .from("campaigns")
    .select("results")
    .eq("thread_id", parsed.data.thread_id)
    .eq("user_id", user.id)
    .maybeSingle();

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
  });

  revalidatePath("/");
  revalidatePath("/analytics");

  return { ok: true, snapshot: snap2 };
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
    const core = await analyzeProspectReply(parsed.data.text);
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

  const [campRes, replyRows, liveSignalsFeed] = await Promise.all([
    supabase.from("campaigns").select("results").eq("user_id", user.id).limit(500),
    queryReplyRowsForAnalytics(supabase, user.id),
    queryCampaignSignalsFeed(supabase, user.id),
  ]);

  if (campRes.error) {
    console.error("[AgentForge] getDashboardAnalytics campaigns", campRes.error.message);
  }

  const composites: number[] = [];
  const buckets = [0, 0, 0, 0];
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
  }

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
  return { ok: true, publicUrl: pub.publicUrl };
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
