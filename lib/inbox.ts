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
 * - **Prompt 128 — Narrow schema detection (no false “inbox missing” on unrelated `column` errors) +
 *   `ensureInboxSchemaReady()` + `supabase/inbox_ensure_p128.sql` RPC when service role is available.
 * - **Prompt 129 — `inbox_drafts` for compose auto-save (localStorage + Supabase every 3s).
 */
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractBareEmailFromFromHeader, slugifyLocalPartFromName } from "@/lib/resend";
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

/** Prompt 129 — Saved compose drafts (`inbox_drafts`). */
export type InboxDraftRow = {
  id: string;
  user_id: string;
  to_email: string;
  subject: string;
  body_text: string;
  updated_at: string;
  created_at: string;
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

/** Bare mailbox for `inbox_messages.from_email` / `to_email` (handles `Name <a@b.com>` and plain `a@b.com`). */
export function normalizeMailboxForInboxStorage(raw: string): string {
  const t = (raw || "").trim();
  if (!t) return "";
  const bare =
    extractBareEmailFromFromHeader(t) ??
    extractBareEmailFromFromHeader(`<${t.replace(/^</, "").replace(/>$/, "")}>`) ??
    (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t : null);
  return bare ? normalizeEmail(bare) : normalizeEmail(t);
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

  if (error && !isOptionalInboxThreadColumnMissingError(error.message)) {
    console.warn("[AgentForge] linkInboxThreadToCampaignIfKnown", error.message);
  }
}

/** True when `inbox_threads` / `inbox_messages` is absent (PostgREST / Postgres). */
export function isInboxRelationMissingError(message: string): boolean {
  const m = (message || "").toLowerCase();
  if (m.includes("schema cache")) return true;
  if (/42p01|undefined_table/.test(m)) return true;
  if (
    (m.includes("inbox_threads") || m.includes("inbox_messages") || m.includes("inbox_drafts")) &&
    m.includes("does not exist")
  ) {
    return true;
  }
  if (
    m.includes("could not find the table") &&
    (m.includes("inbox_threads") || m.includes("inbox_messages") || m.includes("inbox_drafts"))
  ) {
    return true;
  }
  return false;
}

/**
 * True when a migration predates an optional column — safe to retry without it.
 * Does not match generic constraint errors that mention "column" in other contexts.
 */
export function isOptionalInboxThreadColumnMissingError(message: string): boolean {
  const m = (message || "").toLowerCase();
  if (!m.includes("does not exist") && !m.includes("could not find")) return false;
  const cols = [
    "user_last_read_at",
    "updated_at",
    "campaign_thread_id",
    "archived_at",
    "snoozed_until",
    "labels",
    "reply_analysis_id",
    "analyzed_at",
    "body_html",
    "snippet",
  ];
  return cols.some((c) => m.includes(c));
}

/**
 * Prompt 130 — Optional `inbox_messages` columns older schemas may lack.
 */
export function isOptionalInboxMessageColumnMissingError(message: string): boolean {
  const m = (message || "").toLowerCase();
  if (!m.includes("does not exist") && !m.includes("could not find")) return false;
  const cols = ["body_html", "raw", "provider_message_id", "reply_analysis_id", "analyzed_at", "created_at"];
  return cols.some((c) => m.includes(c));
}

function isUniqueViolation(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  const m = (err.message || "").toLowerCase();
  return m.includes("duplicate key") || m.includes("unique constraint");
}

/** Structured Supabase error logging for inbox post-send persistence debugging. */
export function logInboxDbError(
  scope: string,
  err: { message?: string; code?: string; details?: string; hint?: string } | null | undefined,
  extra?: Record<string, unknown>,
): void {
  if (!err?.message && !err?.code) return;
  console.error(
    `[AgentForge] ${scope}`,
    JSON.stringify({
      ...extra,
      message: err?.message,
      code: err?.code,
      details: err?.details,
      hint: err?.hint,
    }),
  );
}

/** Prompt 141 — Detailed `console.log` for post-send save debugging (user-requested). */
function inboxPostSendLog(step: string, detail?: Record<string, unknown>): void {
  if (detail != null) {
    console.log(`[AgentForge][inbox-post-send] ${step}`, JSON.stringify(detail));
  } else {
    console.log(`[AgentForge][inbox-post-send] ${step}`);
  }
}

/** Every post-send write: refresh schema via RPC so PostgREST cache matches DB (no process-wide skip). */
async function runEnsureInboxSchemaRpcEveryWrite(sr: SupabaseClient, stepPrefix: string): Promise<void> {
  inboxPostSendLog(`${stepPrefix}:schema_rpc_before`);
  const { error } = await sr.rpc("ensure_inbox_schema");
  if (error) {
    const msg = error.message ? error.message : "";
    if (/function .* does not exist|could not find the function|pgrst202|404/i.test(msg)) {
      inboxPostSendLog(`${stepPrefix}:schema_rpc_skip_no_fn`);
    } else {
      inboxPostSendLog(`${stepPrefix}:schema_rpc_warn`, { message: msg, code: error.code });
      console.warn("[AgentForge] runEnsureInboxSchemaRpcEveryWrite", msg);
    }
  } else {
    inboxPostSendLog(`${stepPrefix}:schema_rpc_ok`);
  }
}

/**
 * Confirm `inbox_threads` row exists before `inbox_messages.thread_id` insert (avoids FK 23503 / ghost ids).
 */
async function assertInboxThreadRowVisible(
  db: SupabaseClient,
  userId: string,
  threadId: string,
  stepPrefix: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tid = threadId.trim();
  if (tid.length === 0) {
    inboxPostSendLog(`${stepPrefix}:verify_thread_FAIL_empty_id`);
    return { ok: false, error: "thread_id is empty before inbox_messages insert." };
  }
  inboxPostSendLog(`${stepPrefix}:verify_thread_select`, { threadId: tid, userId });
  const { data, error } = await db
    .from("inbox_threads")
    .select("id")
    .eq("id", tid)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    const msg = error.message ? error.message : "inbox_threads verify failed";
    inboxPostSendLog(`${stepPrefix}:verify_thread_FAIL_select`, { message: msg, code: error.code });
    return { ok: false, error: msg };
  }
  const row = data as { id?: string } | null;
  const got = row && typeof row.id === "string" ? row.id.trim() : "";
  if (got !== tid) {
    inboxPostSendLog(`${stepPrefix}:verify_thread_FAIL_not_found`, { threadId: tid, userId, got });
    return {
      ok: false,
      error:
        "inbox thread row not found for thread_id; message insert would violate foreign key (inbox_messages.thread_id → inbox_threads.id).",
    };
  }
  inboxPostSendLog(`${stepPrefix}:verify_thread_ok`, { threadId: tid, userId });
  return { ok: true };
}

function isThreadsTableThreadIdColumnUnsupported(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  if (/pgrst204/i.test(m)) return true;
  if (!m.includes("thread_id")) return false;
  return m.includes("does not exist") || m.includes("could not find") || m.includes("undefined column");
}

type InboxThreadInsertFirstArgs = {
  userId: string;
  prospectEmail: string;
  subject: string;
  snippet: string;
  lastMessageAt: string;
  campaignThreadId?: string;
};

/**
 * Prompt 142 — INSERT-first inbox_threads row, then message. Always tries INSERT before any UPDATE so new
 * outbound compose never depends on a stale "existing" row. Optional `thread_id` text on `inbox_threads`.
 */
async function ensureInboxThreadRowInsertFirst(
  db: SupabaseClient,
  args: InboxThreadInsertFirstArgs,
  logPrefix: string,
): Promise<{ ok: true; threadId: string } | { ok: false; error: string }> {
  const email = normalizeEmail(args.prospectEmail);
  if (!email.includes("@")) {
    inboxPostSendLog(`${logPrefix}:FAIL:invalid_email`, { raw: args.prospectEmail });
    return { ok: false, error: "Invalid prospect email." };
  }

  const subj = args.subject.trim() || "(no subject)";
  const threadsExternalKey = randomUUID();

  const base: Record<string, unknown> = {
    user_id: args.userId,
    prospect_email: email,
    subject: subj,
    snippet: args.snippet,
    last_message_at: args.lastMessageAt,
    user_last_read_at: args.lastMessageAt,
    updated_at: args.lastMessageAt,
  };
  const ct = args.campaignThreadId;
  if (typeof ct === "string" && ct.trim().length > 0) {
    base.campaign_thread_id = ct.trim();
  }

  const runInsert = async (withThreadsThreadIdCol: boolean) => {
    const row: Record<string, unknown> = withThreadsThreadIdCol
      ? { ...base, thread_id: threadsExternalKey }
      : { ...base };
    inboxPostSendLog(`${logPrefix}:insert_first_attempt`, {
      userId: args.userId,
      prospectEmail: email,
      with_inbox_threads_thread_id_text_col: withThreadsThreadIdCol,
    });
    return db.from("inbox_threads").insert(row as never).select("id").single();
  };

  let ins = await runInsert(true);
  if (ins.error && isThreadsTableThreadIdColumnUnsupported(ins.error.message)) {
    inboxPostSendLog(`${logPrefix}:insert_retry_without_inbox_threads_thread_id_text`, {
      message: ins.error.message,
    });
    ins = await runInsert(false);
  }

  if (!ins.error && ins.data) {
    const id = String((ins.data as { id: string }).id);
    inboxPostSendLog(`${logPrefix}:insert_first_ok`, { inbox_threads_pk: id });
    const v = await assertInboxThreadRowVisible(db, args.userId, id, `${logPrefix}_after_insert`);
    if (!v.ok) {
      inboxPostSendLog(`${logPrefix}:FAIL:verify_after_insert`, { error: v.error });
      return v;
    }
    return { ok: true, threadId: id };
  }

  if (ins.error && isUniqueViolation(ins.error)) {
    inboxPostSendLog(`${logPrefix}:insert_conflict_unique_reuse_row`, { userId: args.userId, prospectEmail: email });
    const { data: existingRow, error: selErr } = await db
      .from("inbox_threads")
      .select("id")
      .eq("user_id", args.userId)
      .eq("prospect_email", email)
      .maybeSingle();
    if (selErr) {
      const msg = selErr.message ? selErr.message : "inbox_threads select after conflict failed";
      inboxPostSendLog(`${logPrefix}:FAIL:select_after_conflict`, { message: msg, code: selErr.code });
      return { ok: false, error: msg };
    }
    const ex = existingRow as { id?: string } | null;
    const rid = ex && typeof ex.id === "string" ? ex.id.trim() : "";
    if (rid.length === 0) {
      inboxPostSendLog(`${logPrefix}:FAIL:no_row_after_unique_violation`, { userId: args.userId, prospectEmail: email });
      return { ok: false, error: "Unique constraint fired but inbox_threads row not found." };
    }

    inboxPostSendLog(`${logPrefix}:refresh_existing_after_conflict`, { threadPk: rid });
    const patch: Record<string, unknown> = {
      subject: subj,
      snippet: args.snippet,
      last_message_at: args.lastMessageAt,
      user_last_read_at: args.lastMessageAt,
      updated_at: args.lastMessageAt,
    };
    if (typeof ct === "string" && ct.trim().length > 0) {
      patch.campaign_thread_id = ct.trim();
    }
    const up = await db.from("inbox_threads").update(patch as never).eq("id", rid).eq("user_id", args.userId);
    if (up.error) {
      const msg = up.error.message ? up.error.message : "inbox_threads update after conflict failed";
      inboxPostSendLog(`${logPrefix}:FAIL:update_after_conflict`, { threadPk: rid, message: msg, code: up.error.code });
      return { ok: false, error: msg };
    }
    inboxPostSendLog(`${logPrefix}:update_after_conflict_ok`, { threadPk: rid });
    const v2 = await assertInboxThreadRowVisible(db, args.userId, rid, `${logPrefix}_after_conflict_refresh`);
    if (!v2.ok) {
      inboxPostSendLog(`${logPrefix}:FAIL:verify_after_conflict`, { error: v2.error });
      return v2;
    }
    return { ok: true, threadId: rid };
  }

  const errMsg = ins.error && ins.error.message ? ins.error.message : "inbox_threads insert failed";
  inboxPostSendLog(`${logPrefix}:FAIL:insert`, {
    message: errMsg,
    code: ins.error ? ins.error.code : undefined,
  });
  logInboxDbError(`${logPrefix} insert`, ins.error, { userId: args.userId, prospectEmail: email });
  return { ok: false, error: errMsg };
}

async function ensureInboxThreadForOutbox(
  db: SupabaseClient,
  args: {
    userId: string;
    prospectEmail: string;
    subject: string;
    snippet: string;
    lastMessageAt: string;
  },
): Promise<{ ok: true; threadId: string } | { ok: false; error: string }> {
  return ensureInboxThreadRowInsertFirst(
    db,
    {
      userId: args.userId,
      prospectEmail: args.prospectEmail,
      subject: args.subject,
      snippet: args.snippet,
      lastMessageAt: args.lastMessageAt,
    },
    "compose_null_thread",
  );
}

export type InsertInboxMessageReliablePayload = {
  /** Omit or null while sending brand-new outbound mail; use `outboundThread` then. */
  thread_id?: string | null;
  user_id: string;
  direction: "inbound" | "outbound";
  from_email: string;
  to_email: string;
  subject: string;
  body_text: string;
  body_html?: string | null;
  received_at: string;
  raw?: Record<string, unknown>;
  provider_message_id?: string | null;
  /** Required when `thread_id` is empty for outbound — creates or reuses `inbox_threads`. */
  outboundThread?: {
    prospect_email: string;
    snippet: string;
    last_message_at: string;
  };
};

/**
 * Insert one `inbox_messages` row using the service-role client only (API-compatible unused first arg).
 */
export async function insertInboxMessageReliable(
  _supabase: SupabaseClient,
  payload: InsertInboxMessageReliablePayload,
): Promise<{ ok: true; threadId: string } | { ok: false; error: string }> {
  inboxPostSendLog("reliable:0:start", {
    userId: payload.user_id,
    direction: payload.direction,
    thread_id_present: Boolean(payload.thread_id != null && String(payload.thread_id).trim()),
    has_outboundThread: Boolean(payload.outboundThread),
  });

  const sr = getServiceRoleSupabaseOrNull();
  if (!sr) {
    const err =
      "Inbox sync failed: set SUPABASE_SERVICE_ROLE_KEY on the server (required to save sent mail).";
    inboxPostSendLog("reliable:FAIL:no_service_role", {
      userId: payload.user_id,
      direction: payload.direction,
      hint: "Server Actions need the service-role secret to write inbox_threads / inbox_messages.",
    });
    return { ok: false, error: err };
  }
  inboxPostSendLog("reliable:1:service_role_ready", { userId: payload.user_id });
  await runEnsureInboxSchemaRpcEveryWrite(sr, "reliable");
  inboxPostSendLog("reliable:2:schema_rpc_flow_done", { userId: payload.user_id });

  let threadId = (payload.thread_id != null && String(payload.thread_id).trim()) || "";

  if (!threadId) {
    if (payload.direction !== "outbound" || !payload.outboundThread) {
      inboxPostSendLog("reliable:FAIL:missing_thread_id", {
        direction: payload.direction,
        userId: payload.user_id,
        hasOutboundThread: !!payload.outboundThread,
      });
      return {
        ok: false,
        error:
          payload.direction === "outbound"
            ? "thread_id or outboundThread is required for outbound inbox_messages insert."
            : "thread_id is required for inbound inbox_messages insert.",
      };
    }
    inboxPostSendLog("reliable:3:deferred_thread_null", {
      userId: payload.user_id,
      prospectEmail: payload.outboundThread.prospect_email,
    });
    inboxPostSendLog("reliable:4:ensure_thread_before_message_sequential");
    const ensured = await ensureInboxThreadForOutbox(sr, {
      userId: payload.user_id,
      prospectEmail: payload.outboundThread.prospect_email,
      subject: payload.subject,
      snippet: payload.outboundThread.snippet,
      lastMessageAt: payload.outboundThread.last_message_at,
    });
    if (!ensured.ok) {
      inboxPostSendLog("reliable:FAIL:ensure_thread", { error: ensured.error, userId: payload.user_id });
      return { ok: false, error: ensured.error };
    }
    threadId = ensured.threadId;
    inboxPostSendLog("reliable:5:thread_resolved_after_ensure", { threadId, userId: payload.user_id });
  } else {
    inboxPostSendLog("reliable:3:thread_id_from_payload", { threadId, userId: payload.user_id });
  }

  const verifyThread = await assertInboxThreadRowVisible(sr, payload.user_id, threadId, "reliable");
  if (!verifyThread.ok) {
    inboxPostSendLog("reliable:FAIL:thread_not_committed", { error: verifyThread.error, threadId, userId: payload.user_id });
    return { ok: false, error: verifyThread.error };
  }

  const from_email = normalizeMailboxForInboxStorage(payload.from_email);
  const to_email = normalizeMailboxForInboxStorage(payload.to_email);
  if (payload.direction === "outbound" && !from_email.includes("@")) {
    inboxPostSendLog("reliable:FAIL:invalid_from_email", {
      raw: payload.from_email,
      normalized: from_email,
      userId: payload.user_id,
    });
    return { ok: false, error: "Invalid from_email for outbound inbox_messages insert." };
  }
  if (!to_email.includes("@")) {
    inboxPostSendLog("reliable:FAIL:invalid_to_email", {
      raw: payload.to_email,
      normalized: to_email,
      userId: payload.user_id,
    });
    return { ok: false, error: "Invalid to_email for inbox_messages insert." };
  }

  inboxPostSendLog("reliable:6:addresses_normalized_pre_message", {
    userId: payload.user_id,
    threadId,
    from_email,
    to_email,
  });

  let bodyHtml: string | null;
  if (payload.body_html === undefined) {
    bodyHtml = null;
  } else {
    bodyHtml = payload.body_html;
  }

  const rawSrc = payload.raw;
  let rawObj: Record<string, unknown>;
  if (rawSrc !== undefined && rawSrc !== null && typeof rawSrc === "object" && !Array.isArray(rawSrc)) {
    rawObj = rawSrc as Record<string, unknown>;
  } else {
    rawObj = {};
  }

  let providerId: string | null;
  if (
    payload.provider_message_id !== undefined &&
    payload.provider_message_id !== null &&
    String(payload.provider_message_id).trim() !== ""
  ) {
    providerId = String(payload.provider_message_id).trim();
  } else {
    providerId = null;
  }

  const messageRow = {
    thread_id: threadId,
    user_id: payload.user_id,
    direction: payload.direction,
    from_email,
    to_email,
    subject: payload.subject,
    body_text: payload.body_text,
    body_html: bodyHtml,
    raw: rawObj,
    received_at: payload.received_at,
    provider_message_id: providerId,
  };

  const ctx = { thread_id: threadId, user_id: payload.user_id, from_email, to_email };

  inboxPostSendLog("reliable:7:inbox_messages_insert_after_thread_verified", {
    threadId,
    userId: payload.user_id,
    direction: payload.direction,
    client: "service_role",
  });

  const insMsg = await sr.from("inbox_messages").insert(messageRow).select("id").single();
  if (!insMsg.error) {
    inboxPostSendLog("reliable:8:message_insert_ok", { threadId, userId: payload.user_id });
    inboxPostSendLog("reliable:9:complete", { threadId, userId: payload.user_id });
    return { ok: true, threadId };
  }

  const errText = insMsg.error.message ? insMsg.error.message : "inbox_messages insert failed";
  const isFk =
    insMsg.error.code === "23503" ||
    errText.toLowerCase().includes("foreign key") ||
    errText.toLowerCase().includes("violates foreign key");
  inboxPostSendLog("reliable:FAIL:message_insert", {
    thread_id: threadId,
    user_id: payload.user_id,
    from_email,
    to_email,
    code: insMsg.error.code,
    message: errText,
    likely_fk_violation: isFk,
  });
  logInboxDbError("insertInboxMessageReliable write failed", insMsg.error, ctx);
  return { ok: false, error: errText };
}

/**
 * List/query fallbacks: optional columns, PostgREST schema cache, or missing relation.
 */
export function isInboxOptionalColumnOrSchemaError(message: string): boolean {
  const m = (message || "").toLowerCase();
  if (m.includes("schema cache")) return true;
  if (/pgrst204|42703|undefined column/i.test(m)) return true;
  if (isInboxRelationMissingError(message)) return true;
  if (isOptionalInboxMessageColumnMissingError(message)) return true;
  return isOptionalInboxThreadColumnMissingError(message);
}

let inboxSchemaEnsureState: "ok" | "no_rpc" | undefined = undefined;

/**
 * Prompt 128 — Best-effort `ensure_inbox_schema` RPC (service role). No-op if RPC is not deployed.
 * Safe to call before inbox reads/writes; caches success / missing-RPC for the process lifetime.
 */
export async function ensureInboxSchemaReady(): Promise<void> {
  if (inboxSchemaEnsureState === "ok" || inboxSchemaEnsureState === "no_rpc") return;
  const sr = getServiceRoleSupabaseOrNull();
  if (!sr) {
    inboxSchemaEnsureState = "no_rpc";
    return;
  }
  const { error } = await sr.rpc("ensure_inbox_schema");
  if (!error) {
    inboxSchemaEnsureState = "ok";
    return;
  }
  const msg = error.message ?? "";
  if (/function .* does not exist|could not find the function|pgrst202|404/i.test(msg)) {
    inboxSchemaEnsureState = "no_rpc";
    return;
  }
  console.warn("[AgentForge] ensureInboxSchemaReady", msg);
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
 * Prompt 120 / 141 — After Workspace outreach send: upsert `inbox_threads` (service role) + insert outbound
 * message via `insertInboxMessageReliable` (service role). Every step logs with `inboxPostSendLog`.
 */
export async function upsertInboxThreadAfterOutreachSend(
  params: UpsertInboxAfterOutreachParams,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const peRaw = params.prospectEmail;
  const prospectPreview = typeof peRaw === "string" ? peRaw.slice(0, 120) : "";
  inboxPostSendLog("outreach:0:start", {
    userId: params.userId,
    campaignThreadId: params.campaignThreadId,
    prospectEmailRaw: prospectPreview,
  });

  const sr = getServiceRoleSupabaseOrNull();
  if (!sr) {
    inboxPostSendLog("outreach:FAIL:no_service_role", { userId: params.userId });
    return {
      ok: false,
      error: "Inbox sync failed: set SUPABASE_SERVICE_ROLE_KEY on the server.",
    };
  }
  inboxPostSendLog("outreach:1:service_role_client_ready", { userId: params.userId });
  await runEnsureInboxSchemaRpcEveryWrite(sr, "outreach");
  inboxPostSendLog("outreach:2:schema_rpc_flow_done_before_thread_ops", { userId: params.userId });

  const email = normalizeEmail(params.prospectEmail);
  if (!email.includes("@")) {
    inboxPostSendLog("outreach:FAIL:invalid_prospect_email", { normalized: email });
    return { ok: false, error: "Invalid prospect email." };
  }

  const plain = approximatePlainTextFromHtml(params.htmlBody);
  const snippet = snippetFromBodyText(plain || "(Campaign email sent)", 220);
  const now = new Date().toISOString();
  inboxPostSendLog("outreach:3:derived_fields", {
    userId: params.userId,
    prospectEmail: email,
    snippetLen: snippet.length,
    plainLen: plain.length,
    now,
  });

  inboxPostSendLog("outreach:4:thread_insert_first_begin", { userId: params.userId, prospectEmail: email });
  const ensured = await ensureInboxThreadRowInsertFirst(
    sr,
    {
      userId: params.userId,
      prospectEmail: email,
      subject: params.subject,
      snippet,
      lastMessageAt: now,
      campaignThreadId: params.campaignThreadId,
    },
    "outreach",
  );
  if (!ensured.ok) {
    inboxPostSendLog("outreach:FAIL:thread_ensure", { error: ensured.error });
    return { ok: false, error: ensured.error };
  }
  const threadId = ensured.threadId;
  inboxPostSendLog("outreach:5:thread_ready_for_message", { threadPk: threadId });

  const preMsgThread = await assertInboxThreadRowVisible(sr, params.userId, threadId, "outreach");
  if (!preMsgThread.ok) {
    inboxPostSendLog("outreach:FAIL:thread_verify_before_message", {
      threadId,
      error: preMsgThread.error,
    });
    return { ok: false, error: preMsgThread.error };
  }

  const fromStored = normalizeMailboxForInboxStorage(params.fromEmail);
  const subjForLen = params.subject;
  const subjectLen = typeof subjForLen === "string" ? subjForLen.length : 0;
  inboxPostSendLog("outreach:6:message_payload_build", {
    threadId,
    userId: params.userId,
    from_email: fromStored,
    to_email: email,
    subjectLen,
  });

  const msgPayload = {
    thread_id: threadId,
    user_id: params.userId,
    direction: "outbound" as const,
    from_email: params.fromEmail,
    to_email: email,
    subject: params.subject,
    body_text: plain.slice(0, 50_000),
    body_html: params.htmlBody.slice(0, 200_000),
    received_at: now,
    raw: { source: "campaign_outreach_send", campaign_thread_id: params.campaignThreadId },
  };

  inboxPostSendLog("outreach:7:insertInboxMessageReliable_before", { threadId });
  const msgIns = await insertInboxMessageReliable(params.supabase, msgPayload);
  if (!msgIns.ok) {
    inboxPostSendLog("outreach:FAIL:message_insert", { threadId, error: msgIns.error });
    logInboxDbError("upsertInboxThreadAfterOutreachSend message insert", { message: msgIns.error }, {
      threadId,
    });
    return { ok: false, error: msgIns.error };
  }
  inboxPostSendLog("outreach:8:insertInboxMessageReliable_ok", { threadId: msgIns.threadId });

  inboxPostSendLog("outreach:9:complete", { threadId: msgIns.threadId });
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
 * Prompt 124 / 141 — After Resend accepts net-new compose: resolve thread (`thread_id` null + outboundThread)
 * and insert message — all via service role in `insertInboxMessageReliable`. **`console.log` each step.**
 */
export async function recordNewComposeMessageInInbox(
  supabase: SupabaseClient,
  params: RecordNewComposeMessageParams,
): Promise<{ ok: true; threadId: string } | { ok: false; error: string }> {
  inboxPostSendLog("compose:0:start", { userId: params.userId });
  void supabase;

  if (!getServiceRoleSupabaseOrNull()) {
    const err =
      "Inbox sync failed: set SUPABASE_SERVICE_ROLE_KEY on the server (required to save sent mail).";
    inboxPostSendLog("compose:FAIL:no_service_role", { userId: params.userId });
    return { ok: false, error: err };
  }
  inboxPostSendLog("compose:1:service_role_precheck_ok", { userId: params.userId });

  const email = normalizeEmail(params.prospectEmail);
  if (!email.includes("@")) {
    inboxPostSendLog("compose:FAIL:invalid_recipient", { raw: params.prospectEmail });
    return { ok: false, error: "Invalid recipient address." };
  }

  const snippet = snippetFromBodyText(params.bodyText, 220);
  const subj = params.subject.trim() || "(no subject)";
  const fromPreview = normalizeMailboxForInboxStorage(params.fromBareForStorage);

  inboxPostSendLog("compose:2:validated_recipient_and_preview", {
    userId: params.userId,
    prospectEmail: email,
    from_email_preview: fromPreview,
    subjectLen: subj.length,
    bodyLen: params.bodyText.length,
    thread_id: null,
  });

  inboxPostSendLog("compose:3:insertInboxMessageReliable_before", {
    path: "thread_id_null_with_outboundThread",
  });
  const ins = await insertInboxMessageReliable(supabase, {
    thread_id: null,
    user_id: params.userId,
    direction: "outbound",
    from_email: params.fromBareForStorage,
    to_email: email,
    subject: subj,
    body_text: params.bodyText.slice(0, 50_000),
    body_html: null,
    received_at: params.now,
    raw: { source: "inbox_compose_new" },
    outboundThread: {
      prospect_email: email,
      snippet,
      last_message_at: params.now,
    },
  });

  if (!ins.ok) {
    inboxPostSendLog("compose:FAIL:insertInboxMessageReliable", {
      userId: params.userId,
      prospectEmail: email,
      error: ins.error,
    });
    logInboxDbError(
      "recordNewComposeMessageInInbox insertInboxMessageReliable failed",
      { message: ins.error },
      { userId: params.userId, prospectEmail: email },
    );
    const configured =
      typeof ins.error === "string" &&
      (ins.error.includes("SUPABASE_SERVICE_ROLE_KEY") ||
        ins.error.toLowerCase().includes("service role"));
    return {
      ok: false,
      error: configured
        ? ins.error
        : "Email was delivered, but we could not sync a copy to your inbox. Refresh the inbox page or check your database connection. If this persists, verify the inbox schema migration is applied.",
    };
  }

  const threadId = ins.threadId;
  inboxPostSendLog("compose:4:insertInboxMessageReliable_ok", { userId: params.userId, threadId });

  inboxPostSendLog("compose:5:complete", { userId: params.userId, threadId });
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
