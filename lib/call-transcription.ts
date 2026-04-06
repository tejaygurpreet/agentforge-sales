import "server-only";

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { invokeWithGroqRateLimitResilience } from "@/lib/agent-model";
import { getServerEnv } from "@/lib/env";
import { mergeObjectionsIntoLibrary } from "@/lib/objection-library";
import { resolveWorkspaceContext } from "@/lib/workspace";
import { getServiceRoleSupabaseOrNull } from "@/lib/supabase-server";

type TwilioCreds = {
  accountSid: string;
  authToken: string;
  fromPhoneE164: string;
  userPhoneE164: string | null;
};

const extractionSchema = z.object({
  sentiment: z.string().max(120).optional(),
  summary: z.string().max(2_000).optional(),
  objections: z.array(z.string().max(500)).max(20).default([]),
  insights: z.array(z.string().max(500)).max(20).default([]),
});

export type TwilioCallCompletedPayload = {
  CallSid: string;
  CallStatus?: string;
  AccountSid?: string;
  RecordingUrl?: string;
  RecordingDuration?: string;
  /** Optional query param on status callback URL */
  workspaceIdHint?: string | null;
};

export async function downloadRecordingBuffer(
  creds: TwilioCreds,
  recordingUrl: string,
): Promise<Buffer | null> {
  const u = recordingUrl.trim();
  if (!u.startsWith("http")) return null;
  const auth = Buffer.from(`${creds.accountSid}:${creds.authToken}`, "utf8").toString(
    "base64",
  );
  let res = await fetch(u, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok && !/\.(mp3|wav)(\?|$)/i.test(u)) {
    res = await fetch(`${u}.mp3`, {
      headers: { Authorization: `Basic ${auth}` },
    });
  }
  if (!res.ok) {
    console.warn("[AgentForge] call_transcription:recording_fetch_failed", res.status);
    return null;
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

export async function transcribeAudioWithGroq(audio: Buffer, filename: string): Promise<string> {
  const env = getServerEnv();
  const key = env.GROQ_API_KEY?.trim();
  if (!key) {
    return "";
  }
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(audio)], { type: "application/octet-stream" }),
    filename,
  );
  form.append("model", "whisper-large-v3");
  form.append("response_format", "json");
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.warn("[AgentForge] call_transcription:groq_whisper_failed", res.status, t.slice(0, 200));
    return "";
  }
  const json = (await res.json()) as { text?: string };
  return typeof json.text === "string" ? json.text : "";
}

export async function extractInsightsFromTranscript(
  transcript: string,
): Promise<z.infer<typeof extractionSchema>> {
  const env = getServerEnv();
  if (!env.GROQ_API_KEY?.trim() && !env.ANTHROPIC_API_KEY?.trim()) {
    return extractionSchema.parse({
      sentiment: "unknown",
      summary: transcript.slice(0, 800),
      objections: [],
      insights: [],
    });
  }
  const prompt = `You analyze sales call transcripts. Return JSON only matching the schema.
Transcript:
"""
${transcript.slice(0, 14_000)}
"""
Extract: sentiment (one word or short phrase), summary (2-4 sentences), objections (buyer concerns, distinct), insights (deal-relevant for the seller).`;

  const { value } = await invokeWithGroqRateLimitResilience(
    "call_transcription_extract",
    0.2,
    (m) =>
      m
        .withStructuredOutput(extractionSchema, { name: "call_extract" })
        .invoke(prompt),
  );
  const parsed = extractionSchema.safeParse(value);
  if (!parsed.success) {
    return extractionSchema.parse({
      sentiment: "unknown",
      summary: transcript.slice(0, 800),
      objections: [],
      insights: [],
    });
  }
  return parsed.data;
}

async function resolveWorkspaceIdForPhoneLog(
  supabase: SupabaseClient,
  userId: string,
  hint: string | null | undefined,
): Promise<string> {
  const h = hint?.trim();
  if (h) {
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", h)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (member && typeof (member as { workspace_id?: string }).workspace_id === "string") {
      return (member as { workspace_id: string }).workspace_id;
    }
  }
  const ctx = await resolveWorkspaceContext(supabase, { id: userId, email: null });
  return ctx.workspaceId;
}

/**
 * Prompt 83 — after Twilio reports a completed call: transcribe, extract, persist.
 * Safe to call from a background task (e.g. Next.js `after()`).
 */
export async function runCallTranscriptionPipeline(
  payload: TwilioCallCompletedPayload,
): Promise<void> {
  const callSid = payload.CallSid?.trim();
  if (!callSid) {
    console.warn("[AgentForge] call_transcription:missing_CallSid");
    return;
  }
  const status = (payload.CallStatus ?? "").toLowerCase();
  if (status && status !== "completed") {
    return;
  }

  const supabase = getServiceRoleSupabaseOrNull();
  if (!supabase) {
    console.warn("[AgentForge] call_transcription:no_service_role");
    return;
  }

  const { data: logRow } = await supabase
    .from("campaign_phone_logs")
    .select("user_id, thread_id, twilio_call_sid")
    .eq("twilio_call_sid", callSid)
    .maybeSingle();

  let userId: string | null =
    logRow && typeof (logRow as { user_id?: string }).user_id === "string"
      ? (logRow as { user_id: string }).user_id
      : null;
  let threadId =
    logRow && typeof (logRow as { thread_id?: string }).thread_id === "string"
      ? (logRow as { thread_id: string }).thread_id
      : "";

  if (!userId && payload.AccountSid) {
    const { data: cred } = await supabase
      .from("user_twilio_credentials")
      .select("user_id")
      .eq("account_sid", payload.AccountSid)
      .maybeSingle();
    if (cred && typeof (cred as { user_id?: string }).user_id === "string") {
      userId = (cred as { user_id: string }).user_id;
    }
  }

  if (!userId) {
    console.warn("[AgentForge] call_transcription:no_user_for_call", callSid);
    return;
  }

  if (!threadId) {
    threadId = "";
  }

  const accountSid = payload.AccountSid?.trim() ?? "";
  const { data: credsRow } = await supabase
    .from("user_twilio_credentials")
    .select("account_sid, auth_token, from_phone_e164, user_phone_e164")
    .eq("user_id", userId)
    .maybeSingle();

  if (!credsRow || typeof (credsRow as { account_sid?: string }).account_sid !== "string") {
    console.warn("[AgentForge] call_transcription:no_twilio_creds", userId);
    return;
  }
  if (accountSid && (credsRow as { account_sid: string }).account_sid !== accountSid) {
    console.warn("[AgentForge] call_transcription:account_sid_mismatch");
    return;
  }

  const creds: TwilioCreds = {
    accountSid: (credsRow as { account_sid: string }).account_sid,
    authToken: String((credsRow as { auth_token: string }).auth_token),
    fromPhoneE164: String((credsRow as { from_phone_e164: string }).from_phone_e164),
    userPhoneE164:
      typeof (credsRow as { user_phone_e164?: string | null }).user_phone_e164 === "string"
        ? (credsRow as { user_phone_e164: string }).user_phone_e164
        : null,
  };

  let transcriptText = "";
  let durationSec: number | null = null;
  const durRaw = payload.RecordingDuration?.trim();
  if (durRaw && /^\d+$/.test(durRaw)) {
    durationSec = parseInt(durRaw, 10);
  }

  const recUrl = payload.RecordingUrl?.trim();
  if (recUrl) {
    const buf = await downloadRecordingBuffer(creds, recUrl);
    if (buf && buf.length > 0) {
      const lower = recUrl.toLowerCase();
      const ext = lower.includes(".wav")
        ? "wav"
        : lower.includes(".mp3") || lower.includes(".mpeg")
          ? "mp3"
          : "mp3";
      transcriptText = await transcribeAudioWithGroq(buf, `recording.${ext}`);
    }
  }

  if (!transcriptText.trim()) {
    transcriptText =
      "(No recording audio transcribed — ensure recording is enabled on the Twilio call or GROQ_API_KEY is set.)";
  }

  const extracted = await extractInsightsFromTranscript(transcriptText);
  const workspaceId = await resolveWorkspaceIdForPhoneLog(
    supabase,
    userId,
    payload.workspaceIdHint,
  );

  const insightsJson = extracted.insights ?? [];
  const objectionsJson = extracted.objections ?? [];

  const rawLlm = {
    sentiment: extracted.sentiment,
    summary: extracted.summary,
    objections: objectionsJson,
    insights: insightsJson,
  };

  const { data: inserted, error: insErr } = await supabase
    .from("call_transcripts")
    .upsert(
      {
        workspace_id: workspaceId,
        user_id: userId,
        thread_id: threadId,
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
    console.error("[AgentForge] call_transcripts:insert_failed", insErr.message);
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

  if (transcriptId && objectionsJson.length > 0) {
    await mergeObjectionsIntoLibrary(supabase, workspaceId, transcriptId, objectionsJson);
  }

  console.log("[AgentForge] call_transcription:ok", callSid, workspaceId);
}
