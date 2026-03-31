import "server-only";

/**
 * Prompt 119–120 — Real-time, webhooks & notifications (architecture):
 *
 * - **Inbound (Resend):** `app/api/inbound/resend/route.ts` POST receives `email.received` webhooks;
 *   verify with `verifyWebhookSharedSecret` + `WEBHOOK_SECRET`. Payload shape: `unwrapResendEmailReceivedPayload`.
 * - **Supabase Realtime:** `hooks/use-inbox-realtime.ts` subscribes to `public.inbox_messages` and
 *   `public.inbox_threads` with `filter: user_id=eq.{userId}`. Inbound replies are stored under the
 *   original sender’s `user_id`, so only that user sees the thread in-app.
 * - **Polling:** Client backup interval uses `INBOX_NOTIFICATIONS_POLL_MS` (`lib/inbox-shared.ts`) aligned
 *   with inbox list refresh for efficient updates when Realtime is unavailable.
 * - **Prompt 123 — Header badge:** `getInboxUnreadCountAction()` (server) seeds `InboxUnreadProvider`; the
 *   header `InboxNotificationsBridge` refreshes the same count for the mail icon on `/inbox` and elsewhere.
 * - **Prompt 121 — Performance:** `INBOX_SEARCH_DEBOUNCE_MS` limits list refetch churn; `INBOX_REALTIME_DEBOUNCE_MS`
 *   batches websocket-triggered refreshes. Parsing helpers below stay pure for predictable server work.
 * - **Campaign link:** `upsertInboxThreadAfterOutreachSend` runs after a successful Workspace outreach
 *   send so `campaign_thread_id` and the outbound message appear in the inbox before the first reply.
 * - **Prompt 122 — Composer parity:** `linkInboxThreadToCampaignIfKnown` attaches `campaign_thread_id` when
 *   the user replies from the inbox first but a matching `campaigns` row exists (same user + lead email).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { slugifyLocalPartFromName } from "@/lib/resend";
import { getServiceRoleSupabaseOrNull } from "@/lib/supabase-server";

import type { ProspectReplyAnalysisPayload } from "@/types";

export type InboxThreadRow = {
  id: string;
  user_id: string;
  prospect_email: string;
  subject: string;
  snippet: string;
  last_message_at: string;
  campaign_thread_id: string | null;
  created_at: string;
  /** Prompt 116 — true if any inbound message in the thread lacks a saved analysis. */
  needs_review?: boolean;
  /** Prompt 117 — last time the user opened this thread in the app (SQL column optional). */
  user_last_read_at?: string | null;
  /** Prompt 117 — derived: new activity since `user_last_read_at`. */
  has_unread?: boolean;
  /** Prompt 119 — when set, thread is hidden from main list until restored. */
  archived_at?: string | null;
  /** Prompt 119 — hide thread in main list until this UTC time. */
  snoozed_until?: string | null;
  /** Prompt 119 — user labels (lowercase). */
  labels?: string[] | null;
};

export type InboxMessageRow = {
  id: string;
  thread_id: string;
  user_id: string;
  direction: "inbound" | "outbound";
  from_email: string;
  to_email: string;
  subject: string;
  body_text: string;
  body_html: string | null;
  received_at: string;
  reply_analysis_id: string | null;
  analyzed_at: string | null;
  created_at: string;
  /** Prompt 116 — populated when `reply_analysis_id` points at a saved row (for inline UI). */
  analysis?: ProspectReplyAnalysisPayload | null;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Prompt 124 — Normalize the “To” field for compose (single address).
 */
export function normalizeComposeRecipientEmail(raw: string): string {
  return normalizeEmail(raw);
}

export { isLikelyValidRecipientEmail } from "@/lib/inbox-shared";

/**
 * Computes a unique `inbox_local_part` and persists to `profiles` (Prompt 115).
 * Uses service role for cross-user uniqueness check when available.
 */
export async function syncInboxLocalPartForUser(
  userScoped: SupabaseClient,
  userId: string,
  fullName: string,
): Promise<string | null> {
  const baseRaw = slugifyLocalPartFromName(fullName || "User");
  const base = baseRaw.length > 0 ? baseRaw : "user";
  const shortId = userId.replace(/-/g, "").slice(0, 8);

  const sr = getServiceRoleSupabaseOrNull();
  const checker = sr ?? userScoped;
  let candidate = base;
  const { data: taken } = await checker
    .from("profiles")
    .select("id")
    .eq("inbox_local_part", base)
    .neq("id", userId)
    .maybeSingle();
  if ((taken as { id?: string } | null)?.id) {
    candidate = `${base}-${shortId}`;
    const { data: taken2 } = await checker
      .from("profiles")
      .select("id")
      .eq("inbox_local_part", candidate)
      .neq("id", userId)
      .maybeSingle();
    if ((taken2 as { id?: string } | null)?.id) {
      candidate = `u${shortId}`;
    }
  }

  const { error } = await userScoped
    .from("profiles")
    .update({ inbox_local_part: candidate, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) {
    if (error.message.includes("inbox_local_part") || error.message.includes("column")) {
      return null;
    }
    console.error("[AgentForge] syncInboxLocalPartForUser", error.message);
    return null;
  }
  return candidate;
}

/**
 * Reads `inbox_local_part` after optional sync (no write if column missing).
 */
export async function getOrSyncInboxLocalPart(
  userScoped: SupabaseClient,
  userId: string,
  fullName: string,
): Promise<string | null> {
  const { data: row, error } = await userScoped
    .from("profiles")
    .select("full_name, inbox_local_part")
    .eq("id", userId)
    .maybeSingle();

  if (error) return null;

  const prof = row as { full_name?: string; inbox_local_part?: string | null } | null;
  const name = (prof?.full_name?.trim() || fullName || "").trim();
  const existing = typeof prof?.inbox_local_part === "string" ? prof.inbox_local_part.trim() : "";

  if (existing.length > 0) return existing;

  return syncInboxLocalPartForUser(userScoped, userId, name || fullName || "User");
}

/**
 * Webhook: resolve `user_id` from inbound `local@domain` local-part.
 */
export async function findUserIdByInboxLocalPart(localPart: string): Promise<string | null> {
  const part = localPart.trim().toLowerCase();
  if (!part) return null;
  const sr = getServiceRoleSupabaseOrNull();
  if (!sr) return null;
  const { data, error } = await sr
    .from("profiles")
    .select("id")
    .eq("inbox_local_part", part)
    .maybeSingle();
  if (error || !data) return null;
  const id = (data as { id?: string }).id;
  return typeof id === "string" ? id : null;
}

/**
 * Match `campaigns` row by lead email for thread enrichment (optional).
 */
export async function findCampaignThreadIdForProspect(
  sr: SupabaseClient,
  userId: string,
  prospectEmail: string,
): Promise<string | null> {
  const email = normalizeEmail(prospectEmail);
  if (!email.includes("@")) return null;

  const { data, error } = await sr
    .from("campaigns")
    .select("thread_id")
    .eq("user_id", userId)
    .ilike("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!error && data && typeof (data as { thread_id?: string }).thread_id === "string") {
    return (data as { thread_id: string }).thread_id;
  }

  return null;
}

/**
 * Prompt 122 — When an inbox thread exists without `campaign_thread_id` (e.g. first touch was inbound or
 * composer-only), resolve the latest matching `campaigns.thread_id` by lead email and attach it.
 * No-op if already linked or no campaign row exists. RLS: uses the caller’s `supabase` (signed-in user).
 */
export async function linkInboxThreadToCampaignIfKnown(
  supabase: SupabaseClient,
  params: { userId: string; inboxThreadId: string; prospectEmail: string },
): Promise<void> {
  const campaignTid = await findCampaignThreadIdForProspect(
    supabase,
    params.userId,
    params.prospectEmail,
  );
  if (!campaignTid) return;

  const { data: th, error: selErr } = await supabase
    .from("inbox_threads")
    .select("campaign_thread_id")
    .eq("id", params.inboxThreadId)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (selErr || !th) return;

  const cur = (th as { campaign_thread_id?: string | null }).campaign_thread_id;
  if (cur != null && String(cur).trim() !== "") return;

  const { error } = await supabase
    .from("inbox_threads")
    .update({
      campaign_thread_id: campaignTid,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.inboxThreadId)
    .eq("user_id", params.userId);

  if (error && !isMissingInboxColumnMessage(error.message)) {
    console.warn("[AgentForge] linkInboxThreadToCampaignIfKnown", error.message);
  }
}

function isMissingInboxColumnMessage(msg: string): boolean {
  return /column|does not exist|schema cache/i.test(msg);
}

/**
 * Prompt 120 — Resend `email.received` bodies may nest under `data`, `record`, or top-level.
 */
export function unwrapResendEmailReceivedPayload(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") return {};
  const o = body as Record<string, unknown>;
  if (o.type === "email.received" && o.data && typeof o.data === "object") {
    return o.data as Record<string, unknown>;
  }
  if (o.record && typeof o.record === "object") return o.record as Record<string, unknown>;
  return o;
}

/**
 * Prompt 120 — Shared secret for POST `/api/inbound/resend` (Bearer, `x-webhook-secret`, or `?secret=`).
 */
export function verifyWebhookSharedSecret(request: Request, secret: string | undefined): boolean {
  const s = secret?.trim();
  if (!s) return false;
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${s}`) return true;
  if (request.headers.get("x-webhook-secret") === s) return true;
  try {
    const u = new URL(request.url);
    if (u.searchParams.get("secret") === s) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Prompt 120 — Strip tags for snippet / stored plain body when ingesting HTML (campaign sends).
 */
export function approximatePlainTextFromHtml(html: string): string {
  const t = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t;
}

export type UpsertInboxAfterOutreachParams = {
  supabase: SupabaseClient;
  userId: string;
  campaignThreadId: string;
  prospectEmail: string;
  subject: string;
  htmlBody: string;
  fromEmail: string;
};

/**
 * Prompt 120 — After a successful Workspace outreach send: ensure `inbox_threads` carries `campaign_thread_id`,
 * and record the outbound message so the Professional Inbox shows full threading with campaign flows.
 */
export async function upsertInboxThreadAfterOutreachSend(
  params: UpsertInboxAfterOutreachParams,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = normalizeEmail(params.prospectEmail);
  if (!email.includes("@")) return { ok: false, error: "Invalid prospect email." };

  const plain = approximatePlainTextFromHtml(params.htmlBody);
  const snippet = snippetFromBodyText(plain || "(Campaign email sent)", 220);
  const now = new Date().toISOString();

  const { data: existing, error: lookErr } = await params.supabase
    .from("inbox_threads")
    .select("id")
    .eq("user_id", params.userId)
    .eq("prospect_email", email)
    .maybeSingle();

  if (lookErr && !isMissingInboxColumnMessage(lookErr.message)) {
    return { ok: false, error: lookErr.message };
  }

  let threadId: string;
  const ex = existing as { id?: string } | null;
  if (ex?.id) {
    threadId = ex.id;
    let up = await params.supabase
      .from("inbox_threads")
      .update({
        subject: params.subject,
        snippet,
        last_message_at: now,
        updated_at: now,
        campaign_thread_id: params.campaignThreadId,
        user_last_read_at: now,
      })
      .eq("id", threadId)
      .eq("user_id", params.userId);
    if (up.error && isMissingInboxColumnMessage(up.error.message)) {
      up = await params.supabase
        .from("inbox_threads")
        .update({
          subject: params.subject,
          snippet,
          last_message_at: now,
          updated_at: now,
          campaign_thread_id: params.campaignThreadId,
        })
        .eq("id", threadId)
        .eq("user_id", params.userId);
    }
    if (up.error) return { ok: false, error: up.error.message };
  } else {
    const ins = await params.supabase
      .from("inbox_threads")
      .insert({
        user_id: params.userId,
        prospect_email: email,
        subject: params.subject,
        snippet,
        last_message_at: now,
        campaign_thread_id: params.campaignThreadId,
        user_last_read_at: now,
      })
      .select("id")
      .single();

    let row = ins;
    if (ins.error && isMissingInboxColumnMessage(ins.error.message)) {
      row = await params.supabase
        .from("inbox_threads")
        .insert({
          user_id: params.userId,
          prospect_email: email,
          subject: params.subject,
          snippet,
          last_message_at: now,
          campaign_thread_id: params.campaignThreadId,
        })
        .select("id")
        .single();
    }
    if (row.error || !row.data) {
      return { ok: false, error: row.error?.message ?? "Could not create inbox thread." };
    }
    threadId = String((row.data as { id: string }).id);
  }

  const msgIns = await params.supabase.from("inbox_messages").insert({
    thread_id: threadId,
    user_id: params.userId,
    direction: "outbound",
    from_email: params.fromEmail,
    to_email: email,
    subject: params.subject,
    body_text: plain.slice(0, 50_000),
    body_html: params.htmlBody.slice(0, 200_000),
    received_at: now,
    raw: { source: "campaign_outreach_send", campaign_thread_id: params.campaignThreadId },
  });

  if (msgIns.error) {
    if (isMissingInboxColumnMessage(msgIns.error.message)) {
      return { ok: false, error: "Inbox tables missing — run supabase/inbox_p115.sql" };
    }
    return { ok: false, error: msgIns.error.message };
  }

  return { ok: true };
}

export type RecordNewComposeMessageParams = {
  userId: string;
  prospectEmail: string;
  subject: string;
  bodyText: string;
  /** Bare mailbox for `inbox_messages.from_email` (matches reply composer). */
  fromBareForStorage: string;
  now: string;
};

/**
 * Prompt 124 — After Resend accepts a net-new compose, upsert the thread row and insert the outbound message.
 * Visibility remains per-user via RLS on `inbox_threads` / `inbox_messages`.
 */
export async function recordNewComposeMessageInInbox(
  supabase: SupabaseClient,
  params: RecordNewComposeMessageParams,
): Promise<{ ok: true; threadId: string } | { ok: false; error: string }> {
  const email = normalizeEmail(params.prospectEmail);
  if (!email.includes("@")) return { ok: false, error: "Invalid recipient address." };

  const snippet = snippetFromBodyText(params.bodyText, 220);
  const subj = params.subject.trim() || "(no subject)";

  const { data: existing, error: lookErr } = await supabase
    .from("inbox_threads")
    .select("id")
    .eq("user_id", params.userId)
    .eq("prospect_email", email)
    .maybeSingle();

  if (lookErr && !isMissingInboxColumnMessage(lookErr.message)) {
    return { ok: false, error: lookErr.message };
  }

  let threadId: string;
  const ex = existing as { id?: string } | null;
  if (ex?.id) {
    threadId = ex.id;
  } else {
    const ins = await supabase
      .from("inbox_threads")
      .insert({
        user_id: params.userId,
        prospect_email: email,
        subject: subj,
        snippet,
        last_message_at: params.now,
        user_last_read_at: params.now,
      })
      .select("id")
      .single();

    let row = ins;
    if (ins.error && isMissingInboxColumnMessage(ins.error.message)) {
      row = await supabase
        .from("inbox_threads")
        .insert({
          user_id: params.userId,
          prospect_email: email,
          subject: subj,
          snippet,
          last_message_at: params.now,
        })
        .select("id")
        .single();
    }
    if (row.error || !row.data) {
      return { ok: false, error: row.error?.message ?? "Could not create inbox thread." };
    }
    threadId = String((row.data as { id: string }).id);
  }

  const { error: insErr } = await supabase.from("inbox_messages").insert({
    thread_id: threadId,
    user_id: params.userId,
    direction: "outbound",
    from_email: params.fromBareForStorage,
    to_email: email,
    subject: subj,
    body_text: params.bodyText.slice(0, 50_000),
    body_html: null,
    received_at: params.now,
    raw: { source: "inbox_compose_new" },
  });

  if (insErr) {
    if (isMissingInboxColumnMessage(insErr.message)) {
      return { ok: false, error: "Inbox tables missing — run supabase/inbox_p115.sql" };
    }
    console.error("[AgentForge] recordNewComposeMessageInInbox insert", insErr.message);
    return { ok: false, error: "Email sent but failed to save to inbox." };
  }

  let upErr = (
    await supabase
      .from("inbox_threads")
      .update({
        last_message_at: params.now,
        snippet,
        subject: subj,
        updated_at: params.now,
        user_last_read_at: params.now,
      })
      .eq("id", threadId)
      .eq("user_id", params.userId)
  ).error;
  if (upErr && isMissingInboxColumnMessage(upErr.message)) {
    upErr = (
      await supabase
        .from("inbox_threads")
        .update({
          last_message_at: params.now,
          snippet,
          subject: subj,
          updated_at: params.now,
        })
        .eq("id", threadId)
        .eq("user_id", params.userId)
    ).error;
  }
  if (upErr) {
    console.error("[AgentForge] recordNewComposeMessageInInbox thread update", upErr.message);
  }

  return { ok: true, threadId };
}

export function parseToAddresses(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const o = payload as Record<string, unknown>;
  const raw =
    o.to ?? o.recipient ?? (o.data && typeof o.data === "object" ? (o.data as Record<string, unknown>).to : null);
  if (typeof raw === "string") return [raw];
  if (Array.isArray(raw)) {
    const out: string[] = [];
    for (const x of raw) {
      if (typeof x === "string") out.push(x);
      else if (x && typeof x === "object" && "email" in x && typeof (x as { email?: string }).email === "string") {
        out.push((x as { email: string }).email);
      }
    }
    return out;
  }
  return [];
}

export function parseFromAddress(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const o = payload as Record<string, unknown>;
  const raw =
    o.from ??
    (o.data && typeof o.data === "object" ? (o.data as Record<string, unknown>).from : null);
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && "email" in raw && typeof (raw as { email?: string }).email === "string") {
    return (raw as { email: string }).email;
  }
  return "";
}

export function parseInboundSubjectBody(payload: unknown): {
  subject: string;
  text: string;
  html: string | null;
} {
  if (!payload || typeof payload !== "object") {
    return { subject: "(no subject)", text: "", html: null };
  }
  const o = payload as Record<string, unknown>;
  const d =
    o.data && typeof o.data === "object" ? (o.data as Record<string, unknown>) : o;
  const subject = typeof d.subject === "string" ? d.subject : "(no subject)";
  const text =
    typeof d.text === "string"
      ? d.text
      : typeof d.body === "string"
        ? d.body
        : typeof d.body_plain === "string"
          ? d.body_plain
          : "";
  const html =
    typeof d.html === "string"
      ? d.html
      : typeof d.body_html === "string"
        ? d.body_html
        : null;
  return { subject, text, html };
}

export function extractLocalPartFromEmail(email: string): string | null {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at <= 0 || at >= e.length - 1) return null;
  return e.slice(0, at);
}

/**
 * Plain-text preview for thread snippets when storing inbound mail (webhook / ingest).
 */
export function snippetFromBodyText(text: string, maxLen = 140): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}

/**
 * Prompt 117 — Server/webhook: one conversation = one thread row per (user, prospect email).
 * Messages are ordered chronologically in `listInboxMessagesAction` (oldest → newest for reading).
 */
export function sortInboxMessagesChronological<T extends { received_at: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime(),
  );
}

/**
 * Prompt 118 — Escape text for HTML email bodies (composer → Resend).
 */
export function escapeHtmlForEmail(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Prompt 118 — Plain-text composer → minimal responsive HTML (paragraphs + line breaks).
 */
export function plainTextToEmailHtml(body: string): string {
  const trimmed = body.trimEnd();
  if (!trimmed) return "<p></p>";
  const blocks = trimmed.split(/\n{2,}/);
  return blocks
    .map((block) => {
      const inner = escapeHtmlForEmail(block).replace(/\n/g, "<br/>");
      return `<p style="margin:0 0 1em 0;line-height:1.55;">${inner}</p>`;
    })
    .join("");
}
