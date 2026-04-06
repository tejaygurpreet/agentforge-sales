import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  downloadRecordingBuffer,
  extractInsightsFromTranscript,
  transcribeAudioWithGroq,
} from "@/lib/call-transcription";
import { mergeObjectionsIntoLibrary } from "@/lib/objection-library";
import { getServiceRoleSupabaseOrNull } from "@/lib/supabase-server";
import { normalizePhoneE164, type EnvTwilioVoiceConfig } from "@/lib/twilio";
import { resolveWorkspaceContext } from "@/lib/workspace";

export type InboundVoiceRecordingParams = {
  CallSid: string;
  RecordingUrl?: string;
  RecordingDuration?: string;
  From?: string;
  To?: string;
};

function prospectEmailFromCaller(from: string): string {
  const digits = from.replace(/\D/g, "").slice(0, 15);
  return `voice-${digits || "unknown"}@inbound.voice.local`;
}

async function ensureInboxSchemaRpc(sr: SupabaseClient): Promise<void> {
  const { error } = await sr.rpc("ensure_inbox_schema");
  if (error && !/does not exist|404/i.test(error.message ?? "")) {
    console.warn("[AgentForge] twilio_inbound:ensure_inbox_schema", error.message);
  }
}

/**
 * If this caller was dialed from a campaign, reuse the inbox thread tied to that campaign thread.
 */
async function resolveLinkedInboxThreadForInbound(
  sr: SupabaseClient,
  userId: string,
  fromE164: string,
): Promise<{ inboxThreadId: string; callTranscriptThreadKey: string } | null> {
  const norm = normalizePhoneE164(fromE164);
  if (!norm) return null;

  const { data: log } = await sr
    .from("campaign_phone_logs")
    .select("thread_id")
    .eq("user_id", userId)
    .eq("to_phone_e164", norm)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const ctid =
    log && typeof (log as { thread_id?: string }).thread_id === "string"
      ? (log as { thread_id: string }).thread_id.trim()
      : "";
  if (!ctid) return null;

  const { data: inboxT } = await sr
    .from("inbox_threads")
    .select("id")
    .eq("user_id", userId)
    .eq("campaign_thread_id", ctid)
    .maybeSingle();

  const inboxId =
    inboxT && typeof (inboxT as { id?: string }).id === "string"
      ? (inboxT as { id: string }).id
      : "";
  if (!inboxId) return null;

  return { inboxThreadId: inboxId, callTranscriptThreadKey: ctid };
}

async function findOrCreateVoiceInboxThread(
  sr: SupabaseClient,
  userId: string,
  prospectEmail: string,
  callerLabel: string,
): Promise<string> {
  const { data: existing } = await sr
    .from("inbox_threads")
    .select("id")
    .eq("user_id", userId)
    .eq("prospect_email", prospectEmail)
    .maybeSingle();

  const existingId = existing && typeof (existing as { id?: string }).id === "string" ? (existing as { id: string }).id : "";
  if (existingId) return existingId;

  const now = new Date().toISOString();
  const { data: ins, error } = await sr
    .from("inbox_threads")
    .insert({
      user_id: userId,
      prospect_email: prospectEmail,
      subject: `Voice · ${callerLabel}`,
      snippet: "Inbound call",
      last_message_at: now,
      updated_at: now,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[AgentForge] twilio_inbound:thread_insert", error.message);
    throw new Error(error.message);
  }
  const tid = ins && typeof (ins as { id?: string }).id === "string" ? (ins as { id: string }).id : "";
  if (!tid) throw new Error("inbox_threads insert returned no id");
  return tid;
}

/**
 * Prompt 162 — Inbound Twilio recording (env credentials): Groq Whisper + LLM extract, `call_transcripts`,
 * `inbox_messages.direction = inbound_voice`, objection library merge.
 */
export async function runEnvInboundVoiceRecording(
  params: InboundVoiceRecordingParams,
  config: EnvTwilioVoiceConfig,
): Promise<void> {
  const callSid = params.CallSid?.trim();
  const recUrl = params.RecordingUrl?.trim();
  if (!callSid || !recUrl) {
    console.warn("[AgentForge] twilio_inbound:missing_sid_or_recording");
    return;
  }

  const supabase = getServiceRoleSupabaseOrNull();
  if (!supabase) {
    console.warn("[AgentForge] twilio_inbound:no_service_role");
    return;
  }

  await ensureInboxSchemaRpc(supabase);

  const userId = config.inboundOwnerUserId;
  const from = params.From?.trim() ?? "+unknown";
  const to = params.To?.trim() ?? "";

  let durationSec: number | null = null;
  const durRaw = params.RecordingDuration?.trim();
  if (durRaw && /^\d+$/.test(durRaw)) {
    durationSec = parseInt(durRaw, 10);
  }

  const creds = {
    accountSid: config.accountSid,
    authToken: config.authToken,
    fromPhoneE164: config.phoneNumberE164,
    userPhoneE164: null as string | null,
  };

  let transcriptText = "";
  const buf = await downloadRecordingBuffer(creds, recUrl);
  if (buf && buf.length > 0) {
    const lower = recUrl.toLowerCase();
    const ext = lower.includes(".wav") ? "wav" : "mp3";
    transcriptText = await transcribeAudioWithGroq(buf, `inbound.${ext}`);
  }

  if (!transcriptText.trim()) {
    transcriptText =
      "(No audio transcribed — check GROQ_API_KEY and Twilio recording format.)";
  }

  const extracted = await extractInsightsFromTranscript(transcriptText);
  const { workspaceId } = await resolveWorkspaceContext(supabase, { id: userId, email: null });

  const insightsJson = extracted.insights ?? [];
  const objectionsJson = extracted.objections ?? [];
  const rawLlm = {
    sentiment: extracted.sentiment,
    summary: extracted.summary,
    objections: objectionsJson,
    insights: insightsJson,
  };

  const prospectEmail = prospectEmailFromCaller(from);

  let inboxThreadId = "";
  let transcriptThreadKey = "";
  const linked = await resolveLinkedInboxThreadForInbound(supabase, userId, from);
  if (linked) {
    inboxThreadId = linked.inboxThreadId;
    transcriptThreadKey = linked.callTranscriptThreadKey;
  } else {
    try {
      inboxThreadId = await findOrCreateVoiceInboxThread(supabase, userId, prospectEmail, from);
      transcriptThreadKey = inboxThreadId;
    } catch (e) {
      console.error("[AgentForge] twilio_inbound:thread", e);
      inboxThreadId = "";
      transcriptThreadKey = "";
    }
  }

  const { data: inserted, error: insErr } = await supabase
    .from("call_transcripts")
    .upsert(
      {
        workspace_id: workspaceId,
        user_id: userId,
        thread_id: transcriptThreadKey || "",
        twilio_call_sid: callSid,
        transcript: transcriptText,
        sentiment: extracted.sentiment ?? null,
        summary: extracted.summary ?? null,
        insights: insightsJson,
        objections: objectionsJson,
        raw_llm: rawLlm,
        recording_duration_sec: durationSec,
      },
      { onConflict: "twilio_call_sid" },
    )
    .select("id")
    .maybeSingle();

  if (insErr) {
    console.error("[AgentForge] twilio_inbound:call_transcripts", insErr.message);
    return;
  }

  let transcriptId =
    inserted && typeof (inserted as { id?: string }).id === "string"
      ? (inserted as { id: string }).id
      : null;
  if (!transcriptId) {
    const { data: existingRow } = await supabase
      .from("call_transcripts")
      .select("id")
      .eq("twilio_call_sid", callSid)
      .maybeSingle();
    if (existingRow && typeof (existingRow as { id?: string }).id === "string") {
      transcriptId = (existingRow as { id: string }).id;
    }
  }

  if (inboxThreadId) {
    const { error: msgErr } = await supabase.from("inbox_messages").insert({
      thread_id: inboxThreadId,
      user_id: userId,
      direction: "inbound_voice",
      from_email: prospectEmail,
      to_email: "inbox@voice.local",
      subject: "Inbound voice message",
      body_text: transcriptText,
      body_html: null,
      provider_message_id: callSid,
      raw: {
        source: "twilio_inbound",
        twilio_call_sid: callSid,
        recording_url: recUrl,
        from_e164: from,
        to_e164: to,
        recording_duration_sec: durationSec,
        summary: extracted.summary ?? null,
      },
      is_read: false,
      received_at: new Date().toISOString(),
    });

    if (msgErr) {
      console.warn("[AgentForge] twilio_inbound:inbox_messages", msgErr.message);
    } else {
      const snippet = transcriptText.slice(0, 220);
      await supabase
        .from("inbox_threads")
        .update({
          snippet,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", inboxThreadId)
        .eq("user_id", userId);
    }
  }

  if (transcriptId && objectionsJson.length > 0) {
    await mergeObjectionsIntoLibrary(supabase, workspaceId, transcriptId, objectionsJson);
  }

  console.log("[AgentForge] twilio_inbound:ok", callSid, workspaceId);
}
