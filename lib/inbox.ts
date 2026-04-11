import "server-only";

import { revalidatePath } from "next/cache";

/**
 * Prompt 119–120 — Real-time, webhooks & notifications (architecture):
 *
 * - **Inbound (Resend):** `app/api/webhooks/resend/route.ts` POST (same as `/api/inbound/resend`) receives `email.received`;
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
import {
  computeThreadUnread,
  threadIsArchived,
  threadIsSnoozed,
} from "@/lib/inbox-filters";
import { extractBareEmailFromFromHeader, slugifyLocalPartFromName } from "@/lib/resend";
import { getServerEnv } from "@/lib/env";
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

/** Prompt 129 — Saved compose drafts (`inbox_drafts` and/or `inbox_messages` with `direction = 'draft'`). */
export type InboxDraftRow = {
  id: string;
  user_id: string;
  to_email: string;
  subject: string;
  body_text: string;
  updated_at: string;
  created_at: string;
  /** Prompt 152 — set when the draft is a reply row in `inbox_messages`. */
  thread_id?: string | null;
};

export type InboxMessageRow = {
  id: string;
  thread_id: string;
  user_id: string;
  direction: "inbound" | "outbound" | "draft";
  from_email: string;
  to_email: string;
  subject: string;
  body_text: string;
  body_html: string | null;
  received_at: string;
  reply_analysis_id: string | null;
  analyzed_at: string | null;
  created_at: string;
  /** Prompt 152 — inbound read state; defaults true when column absent (legacy schemas). */
  is_read?: boolean;
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

/** Prompt 153 — Row needed to send/save a reply; same `id` as `inbox_messages.thread_id`. */
export type InboxThreadReplyContext = {
  id: string;
  prospect_email: string;
  subject: string;
};

type InboxMessageThreadSynthRow = {
  thread_id?: string;
  direction?: string;
  from_email?: string;
  to_email?: string;
  subject?: string;
  body_text?: string;
  received_at?: string;
};

/**
 * Prompt 154 — When `inbox_threads` is not SELECT-visible (RLS) but `inbox_messages` are, derive the same
 * reply context the sidebar uses so `sendInboxReplyAction` receives a valid prospect + subject for `thread_id`.
 */
async function resolveInboxThreadReplyContextFromMessages(
  userScoped: SupabaseClient,
  userId: string,
  threadId: string,
): Promise<InboxThreadReplyContext | null> {
  const tid = threadId.trim();
  if (!tid) return null;

  const sr = getServiceRoleSupabaseOrNull();
  const tryClient = async (client: SupabaseClient): Promise<InboxThreadReplyContext | null> => {
    const { data: rows, error } = await client
      .from("inbox_messages")
      .select("direction, from_email, to_email, subject, received_at")
      .eq("thread_id", tid)
      .eq("user_id", userId)
      .in("direction", ["inbound", "outbound"])
      .order("received_at", { ascending: false })
      .limit(120);
    if (error || !rows?.length) return null;

    const chronological = [...(rows as InboxMessageThreadSynthRow[])].sort(
      (a, b) =>
        new Date(a.received_at ?? 0).getTime() - new Date(b.received_at ?? 0).getTime(),
    );
    let prospect = "";
    for (let i = chronological.length - 1; i >= 0; i--) {
      const m = chronological[i]!;
      if (m.direction === "outbound") {
        const e = normalizeMailboxForInboxStorage(m.to_email ?? "");
        if (e.includes("@")) {
          prospect = e;
          break;
        }
      } else {
        const e = normalizeMailboxForInboxStorage(m.from_email ?? "");
        if (e.includes("@")) {
          prospect = e;
          break;
        }
      }
    }
    const latest = chronological[chronological.length - 1] ?? chronological[0];
    if (!prospect.includes("@") && latest) {
      prospect = normalizeMailboxForInboxStorage(
        latest.to_email && String(latest.to_email).length > 0 ? latest.to_email : (latest.from_email ?? ""),
      );
    }
    if (!prospect.includes("@")) return null;

    let baseSubj = "";
    for (let i = chronological.length - 1; i >= 0; i--) {
      const s = String(chronological[i]?.subject ?? "").trim();
      if (s.length > 0) {
        baseSubj = s;
        break;
      }
    }
    if (!baseSubj) baseSubj = "(no subject)";

    if (sr) {
      const { data: thRow } = await sr
        .from("inbox_threads")
        .select("user_id")
        .eq("id", tid)
        .maybeSingle();
      const owner = (thRow as { user_id?: string } | null)?.user_id;
      if (owner && owner !== userId) return null;
    }

    return { id: tid, prospect_email: prospect, subject: baseSubj };
  };

  const fromSr = sr ? await tryClient(sr) : null;
  if (fromSr) return fromSr;
  return tryClient(userScoped);
}

/**
 * Prompt 153 — Sidebar may list threads synthesized from `inbox_messages` while `inbox_threads` SELECT is hidden
 * by RLS. Load the canonical row with the user client first, then service role (same pattern as post-send updates).
 * Prompt 154 — Fall back to message-derived context so reply send always gets the correct `thread_id` + prospect.
 */
export async function resolveInboxThreadForReply(
  userScoped: SupabaseClient,
  userId: string,
  threadId: string,
): Promise<InboxThreadReplyContext | null> {
  const tid = threadId.trim();
  if (!tid) return null;

  const trySelect = async (client: SupabaseClient) => {
    const { data, error } = await client
      .from("inbox_threads")
      .select("id, prospect_email, subject")
      .eq("id", tid)
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { id: string; prospect_email: string; subject?: string };
    return {
      id: row.id,
      prospect_email: row.prospect_email,
      subject: typeof row.subject === "string" ? row.subject : "",
    };
  };

  const fromUser = await trySelect(userScoped);
  if (fromUser) return fromUser;

  const sr = getServiceRoleSupabaseOrNull();
  if (sr) {
    const fromSrThread = await trySelect(sr);
    if (fromSrThread) return fromSrThread;
  }

  return resolveInboxThreadReplyContextFromMessages(userScoped, userId, tid);
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
  const cols = [
    "body_html",
    "raw",
    "provider_message_id",
    "reply_analysis_id",
    "analyzed_at",
    "created_at",
    "is_read",
  ];
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

function parseInsertOutboundInboxMessageRpcResult(data: unknown): { threadId: string } | null {
  if (data === null || data === undefined) return null;
  if (typeof data === "string") {
    const threadId = data.trim();
    return threadId.length > 0 ? { threadId } : null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (row === null || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  const rawId = o.thread_id ?? o.inbox_thread_id ?? o.outbox_inbox_thread_id;
  const threadId = typeof rawId === "string" ? rawId.trim() : "";
  if (threadId.length === 0) return null;
  return { threadId };
}

/**
 * Atomic outbound save: `insert_outbound_inbox_message` RPC (service role). Creates/finds thread + inserts
 * message in one DB transaction when `p_inbox_thread_id` is null; otherwise inserts message only.
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

  if (payload.direction !== "outbound") {
    inboxPostSendLog("reliable:FAIL:rpc_outbound_only", { direction: payload.direction, userId: payload.user_id });
    return {
      ok: false,
      error: "insert_outbound_inbox_message RPC supports outbound direction only; use webhook ingest for inbound.",
    };
  }

  const pInboxThreadId: string | null =
    payload.thread_id != null && String(payload.thread_id).trim() !== ""
      ? String(payload.thread_id).trim()
      : null;
  let pProspectEmail: string | null = null;
  let pThreadSnippet = "";
  let pThreadLastMessageAt = payload.received_at;
  const pThreadSubject = (payload.subject.trim().length > 0 ? payload.subject.trim() : "(no subject)");

  if (!pInboxThreadId) {
    if (!payload.outboundThread) {
      inboxPostSendLog("reliable:FAIL:missing_thread_id", {
        direction: payload.direction,
        userId: payload.user_id,
        hasOutboundThread: !!payload.outboundThread,
      });
      return {
        ok: false,
        error:
          "thread_id or outboundThread is required for outbound inbox_messages insert.",
      };
    }
    inboxPostSendLog("reliable:3:deferred_thread_null", {
      userId: payload.user_id,
      prospectEmail: payload.outboundThread.prospect_email,
    });
    inboxPostSendLog("reliable:4:ensure_thread_before_message_sequential");
    pProspectEmail = normalizeEmail(payload.outboundThread.prospect_email);
    pThreadSnippet = payload.outboundThread.snippet;
    pThreadLastMessageAt = payload.outboundThread.last_message_at;
    if (!pProspectEmail.includes("@")) {
      inboxPostSendLog("reliable:FAIL:invalid_prospect_for_rpc", {
        userId: payload.user_id,
        prospectEmail: pProspectEmail,
      });
      return { ok: false, error: "Invalid prospect email for atomic thread create." };
    }
  } else {
    inboxPostSendLog("reliable:3:thread_id_from_payload", { threadId: pInboxThreadId, userId: payload.user_id });
  }

  const from_email = normalizeMailboxForInboxStorage(payload.from_email);
  const to_email = normalizeMailboxForInboxStorage(payload.to_email);
  if (!from_email.includes("@")) {
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

  const threadIdForLog = pInboxThreadId !== null ? pInboxThreadId : "";
  inboxPostSendLog("reliable:6:addresses_normalized_pre_message", {
    userId: payload.user_id,
    threadId: threadIdForLog,
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

  const ctx = {
    thread_id: pInboxThreadId ?? "",
    user_id: payload.user_id,
    from_email,
    to_email,
  };

  inboxPostSendLog("reliable:7:inbox_messages_insert_after_thread_verified", {
    threadId: threadIdForLog,
    userId: payload.user_id,
    direction: payload.direction,
    client: "service_role",
  });

  const { data: rpcData, error: rpcErr } = await sr.rpc("insert_outbound_inbox_message", {
    p_user_id: payload.user_id,
    p_prospect_email: pProspectEmail,
    p_from_email: from_email,
    p_to_email: to_email,
    p_subject: payload.subject,
    p_body_text: payload.body_text,
    p_inbox_thread_id: pInboxThreadId,
    p_body_html: bodyHtml,
    p_provider_message_id: providerId,
    p_raw: rawObj,
    p_received_at: payload.received_at,
    p_thread_last_message_at: pThreadLastMessageAt,
    p_thread_snippet: pThreadSnippet,
    p_thread_subject: pThreadSubject,
  });

  if (rpcErr) {
    const errText = rpcErr.message ? rpcErr.message : "insert_outbound_inbox_message RPC failed";
    const isFk =
      rpcErr.code === "23503" ||
      errText.toLowerCase().includes("foreign key") ||
      errText.toLowerCase().includes("violates foreign key");
    inboxPostSendLog("reliable:FAIL:message_insert", {
      thread_id: threadIdForLog,
      user_id: payload.user_id,
      from_email,
      to_email,
      code: rpcErr.code,
      message: errText,
      likely_fk_violation: isFk,
    });
    logInboxDbError("insertInboxMessageReliable RPC failed", rpcErr, ctx);
    return { ok: false, error: errText };
  }

  const parsed = parseInsertOutboundInboxMessageRpcResult(rpcData);
  if (parsed === null) {
    inboxPostSendLog("reliable:FAIL:rpc_empty_result", { userId: payload.user_id, rpcData });
    return { ok: false, error: "insert_outbound_inbox_message returned no inbox_thread_id." };
  }
  const threadId = parsed.threadId;

  if (!pInboxThreadId) {
    inboxPostSendLog("reliable:5:thread_resolved_after_ensure", { threadId, userId: payload.user_id });
  }

  inboxPostSendLog("reliable:8:message_insert_ok", { threadId, userId: payload.user_id });
  inboxPostSendLog("reliable:9:complete", { threadId, userId: payload.user_id });
  return { ok: true, threadId };
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

/** Prompt 148 / 149 — Mirrors dashboard thread list options (`listInboxThreadsAction`). */
export type InboxThreadsListOptions = {
  includeArchived?: boolean;
  folder?: "inbox" | "sent";
};

function normalizeInboxMessageRowsFromSelect(
  rows: unknown[],
  sel: string,
): InboxMessageRow[] {
  const has = (col: string) => sel.includes(col);
  return (rows as Record<string, unknown>[]).map((r) => {
    const { inbox_threads: _join, ...rflat } = r;
    void _join;
    const dirRaw = rflat.direction;
    const direction: "inbound" | "outbound" | "draft" =
      dirRaw === "outbound" ? "outbound" : dirRaw === "draft" ? "draft" : "inbound";
    const receivedAt = String(rflat.received_at ?? "");
    const isRead = !has("is_read") ? true : Boolean(rflat.is_read);
    return {
      id: String(rflat.id ?? ""),
      thread_id: String(rflat.thread_id ?? ""),
      user_id: String(rflat.user_id ?? ""),
      direction,
      from_email: String(rflat.from_email ?? ""),
      to_email: String(rflat.to_email ?? ""),
      subject: String(rflat.subject ?? ""),
      body_text: String(rflat.body_text ?? ""),
      body_html:
        has("body_html") && rflat.body_html != null && String(rflat.body_html).trim() !== ""
          ? String(rflat.body_html)
          : null,
      received_at: receivedAt,
      reply_analysis_id:
        has("reply_analysis_id") && rflat.reply_analysis_id != null
          ? String(rflat.reply_analysis_id)
          : null,
      analyzed_at:
        has("analyzed_at") && rflat.analyzed_at != null ? String(rflat.analyzed_at) : null,
      created_at:
        has("created_at") && rflat.created_at != null ? String(rflat.created_at) : receivedAt,
      is_read: isRead,
    };
  });
}

/** Prompt 152 — Map a `inbox_messages` draft row to `InboxDraftRow` for the Drafts tab. */
export function inboxMessageDraftToDraftRow(r: Record<string, unknown>): InboxDraftRow {
  const receivedAt = String(r.received_at ?? "");
  const createdAt = String(r.created_at ?? receivedAt);
  return {
    id: String(r.id ?? ""),
    user_id: String(r.user_id ?? ""),
    to_email: String(r.to_email ?? ""),
    subject: String(r.subject ?? ""),
    body_text: String(r.body_text ?? ""),
    updated_at: receivedAt || createdAt,
    created_at: createdAt || receivedAt,
    thread_id: r.thread_id != null && String(r.thread_id).length > 0 ? String(r.thread_id) : null,
  };
}

/**
 * Prompt 152 — Header badge: count inbound messages the user has not marked read (`is_read = false`).
 */
export async function countUnreadInboundRepliesForUser(
  userScoped: SupabaseClient,
  userId: string,
): Promise<number> {
  const join = "inbox_threads!inner(user_id)";
  const run = (useNullAsUnread: boolean) => {
    let q = userScoped
      .from("inbox_messages")
      .select(`id, ${join}`, { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("direction", "inbound")
      .eq("inbox_threads.user_id", userId);
    q = useNullAsUnread ? q.or("is_read.eq.false,is_read.is.null") : q.eq("is_read", false);
    return q;
  };
  let { count, error } = await run(true);
  if (error && isInboxOptionalColumnOrSchemaError(error.message)) {
    const second = await run(false);
    count = second.count;
    error = second.error;
  }
  if (error) {
    if (!isInboxOptionalColumnOrSchemaError(error.message)) {
      console.warn("[AgentForge] countUnreadInboundRepliesForUser", error.message);
    }
    return 0;
  }
  return count ?? 0;
}

/**
 * Prompt 152 — Sidebar dots: threads with at least one unread inbound message.
 * Returns `null` when `is_read` / schema is unavailable (caller falls back to `user_last_read_at` heuristics).
 */
export async function fetchUnreadInboundThreadIdsForUser(
  userScoped: SupabaseClient,
  userId: string,
): Promise<Set<string> | null> {
  let { data, error } = await userScoped
    .from("inbox_messages")
    .select("thread_id")
    .eq("user_id", userId)
    .eq("direction", "inbound")
    .or("is_read.eq.false,is_read.is.null");
  if (error && isInboxOptionalColumnOrSchemaError(error.message)) {
    const second = await userScoped
      .from("inbox_messages")
      .select("thread_id")
      .eq("user_id", userId)
      .eq("direction", "inbound")
      .eq("is_read", false);
    data = second.data;
    error = second.error;
  }
  if (error) {
    if (isInboxOptionalColumnOrSchemaError(error.message)) return null;
    console.warn("[AgentForge] fetchUnreadInboundThreadIdsForUser", error.message);
    return null;
  }
  const s = new Set<string>();
  for (const r of data ?? []) {
    const tid = (r as { thread_id?: string }).thread_id;
    if (typeof tid === "string" && tid.length > 0) s.add(tid);
  }
  return s;
}

/** Prompt 152 — Mark all inbound messages in the thread read for `user_id` (decrements unread-reply badge). */
export async function markInboundMessagesReadForThread(
  userScoped: SupabaseClient,
  userId: string,
  threadId: string,
): Promise<void> {
  const tid = threadId.trim();
  if (!tid) return;
  const { error } = await userScoped
    .from("inbox_messages")
    .update({ is_read: true })
    .eq("thread_id", tid)
    .eq("user_id", userId)
    .eq("direction", "inbound");
  if (error && !isInboxOptionalColumnOrSchemaError(error.message)) {
    console.warn("[AgentForge] markInboundMessagesReadForThread", error.message);
  }
}

/** Prompt 152 — Remove saved reply drafts after a successful send. */
export async function deleteInboxReplyDraftsForThread(
  userScoped: SupabaseClient,
  userId: string,
  threadId: string,
): Promise<void> {
  const tid = threadId.trim();
  if (!tid) return;
  const { error } = await userScoped
    .from("inbox_messages")
    .delete()
    .eq("thread_id", tid)
    .eq("user_id", userId)
    .eq("direction", "draft");
  if (error && !isInboxOptionalColumnOrSchemaError(error.message)) {
    console.warn("[AgentForge] deleteInboxReplyDraftsForThread", error.message);
  }
}

/**
 * Prompt 152 — Auto-save reply composer: one draft row per (user, thread) in `inbox_messages`.
 */
export async function upsertInboxReplyDraftMessage(
  userScoped: SupabaseClient,
  userId: string,
  params: {
    threadId: string;
    bodyText: string;
    fromEmail: string;
    toEmail: string;
    subject: string;
  },
): Promise<{ ok: true; draftId: string } | { ok: false; error: string }> {
  const tid = params.threadId.trim();
  if (!tid) return { ok: false, error: "Missing thread." };
  const now = new Date().toISOString();
  const subj = params.subject.trim().slice(0, 500);
  const body = params.bodyText.slice(0, 50_000);
  const fromE = normalizeMailboxForInboxStorage(params.fromEmail);
  const toE = normalizeMailboxForInboxStorage(params.toEmail);

  const { data: existing, error: selErr } = await userScoped
    .from("inbox_messages")
    .select("id")
    .eq("thread_id", tid)
    .eq("user_id", userId)
    .eq("direction", "draft")
    .maybeSingle();
  if (selErr && !isInboxOptionalColumnOrSchemaError(selErr.message)) {
    return { ok: false, error: selErr.message };
  }
  const exId = (existing as { id?: string } | null)?.id;

  if (typeof exId === "string" && exId.length > 0) {
    const { error: upErr } = await userScoped
      .from("inbox_messages")
      .update({
        body_text: body,
        subject: subj,
        from_email: fromE,
        to_email: toE,
        received_at: now,
        is_read: false,
      })
      .eq("id", exId)
      .eq("user_id", userId);
    if (upErr) return { ok: false, error: upErr.message };
    return { ok: true, draftId: exId };
  }

  const { data: ins, error: insErr } = await userScoped
    .from("inbox_messages")
    .insert({
      thread_id: tid,
      user_id: userId,
      direction: "draft",
      from_email: fromE,
      to_email: toE,
      subject: subj,
      body_text: body,
      body_html: null,
      received_at: now,
      is_read: false,
      raw: { source: "inbox_reply_autosave" },
    })
    .select("id")
    .single();
  if (insErr) return { ok: false, error: insErr.message };
  const id = String((ins as { id?: string }).id ?? "");
  if (!id) return { ok: false, error: "Draft insert returned no id." };
  return { ok: true, draftId: id };
}

/**
 * Prompt 148 — Load all `inbox_messages` for a thread owned by the user via `inbox_threads!inner` join
 * (thread ownership), with column fallbacks; service-role read if RLS still hides rows.
 */
export async function fetchInboxMessagesForThreadDisplay(
  userScoped: SupabaseClient,
  userId: string,
  threadId: string,
): Promise<InboxMessageRow[]> {
  const tid = threadId.trim();
  if (!tid) return [];

  const innerThread = "inbox_threads!inner ( id, user_id )";
  const selectVariants = [
    "id, thread_id, user_id, direction, from_email, to_email, subject, body_text, body_html, received_at, reply_analysis_id, analyzed_at, created_at, is_read",
    "id, thread_id, user_id, direction, from_email, to_email, subject, body_text, body_html, received_at, is_read",
    "id, thread_id, user_id, direction, from_email, to_email, subject, body_text, body_html, received_at",
    "id, thread_id, user_id, direction, from_email, to_email, subject, body_text, received_at",
  ] as const;

  const sortNewestFirst = (rows: InboxMessageRow[]) =>
    [...rows].sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());

  const tryUserJoin = async (sel: string) =>
    userScoped
      .from("inbox_messages")
      .select(`${sel}, ${innerThread}`)
      .eq("thread_id", tid)
      .eq("inbox_threads.user_id", userId)
      .in("direction", ["inbound", "outbound"])
      .order("received_at", { ascending: false })
      .limit(200);

  for (const sel of selectVariants) {
    const { data, error } = await tryUserJoin(sel);
    if (!error) {
      return sortNewestFirst(normalizeInboxMessageRowsFromSelect(data ?? [], sel));
    }
    if (!isInboxRelationMissingError(error.message) && !isInboxOptionalColumnOrSchemaError(error.message)) {
      break;
    }
  }

  for (const sel of selectVariants) {
    const { data, error } = await userScoped
      .from("inbox_messages")
      .select(sel)
      .eq("thread_id", tid)
      .eq("user_id", userId)
      .in("direction", ["inbound", "outbound"])
      .order("received_at", { ascending: false })
      .limit(200);
    if (!error) {
      return sortNewestFirst(normalizeInboxMessageRowsFromSelect(data ?? [], sel));
    }
    if (!isInboxRelationMissingError(error.message) && !isInboxOptionalColumnOrSchemaError(error.message)) {
      console.error("[AgentForge] fetchInboxMessagesForThreadDisplay", error.message);
      return [];
    }
  }

  const sr = getServiceRoleSupabaseOrNull();
  if (!sr) return [];

  const { data: threadOwned } = await sr
    .from("inbox_threads")
    .select("id")
    .eq("id", tid)
    .eq("user_id", userId)
    .maybeSingle();
  let allowSrRead = Boolean(threadOwned);
  if (!allowSrRead) {
    const { data: msgOwned } = await sr
      .from("inbox_messages")
      .select("id")
      .eq("thread_id", tid)
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    allowSrRead = Boolean(msgOwned);
  }
  if (!allowSrRead) return [];

  for (const sel of selectVariants) {
    const { data, error } = await sr
      .from("inbox_messages")
      .select(sel)
      .eq("thread_id", tid)
      .in("direction", ["inbound", "outbound"])
      .order("received_at", { ascending: false })
      .limit(200);
    if (!error) {
      return sortNewestFirst(normalizeInboxMessageRowsFromSelect(data ?? [], sel));
    }
    if (!isInboxRelationMissingError(error.message) && !isInboxOptionalColumnOrSchemaError(error.message)) {
      console.error("[AgentForge] fetchInboxMessagesForThreadDisplay (sr)", error.message);
      return [];
    }
  }
  return [];
}

/**
 * Prompt 151 — Last resort when `inbox_threads` rows are not visible to the user client (RLS / `user_id` skew) but
 * `inbox_messages` are: build sidebar threads from the user’s messages with `user_id = auth user`, keyed by
 * `thread_id`, so the list matches rows counted in `countInboxMessagesVisibleToUser`.
 */
async function synthesizeInboxThreadsFromUserMessages(
  userScoped: SupabaseClient,
  userId: string,
): Promise<InboxThreadRow[]> {
  const selectVariants = [
    "thread_id, direction, from_email, to_email, subject, body_text, received_at",
    "thread_id, direction, from_email, to_email, subject, received_at",
  ] as const;

  let rows: InboxMessageThreadSynthRow[] = [];
  for (const sel of selectVariants) {
    const { data, error } = await userScoped
      .from("inbox_messages")
      .select(sel)
      .eq("user_id", userId)
      .order("received_at", { ascending: false })
      .limit(500);
    if (!error && data?.length) {
      rows = data as InboxMessageThreadSynthRow[];
      break;
    }
    if (
      error &&
      !isInboxRelationMissingError(error.message) &&
      !isInboxOptionalColumnOrSchemaError(error.message)
    ) {
      break;
    }
  }
  if (!rows.length) return [];

  const byThread = new Map<string, InboxMessageThreadSynthRow[]>();
  for (const m of rows) {
    const tid = m.thread_id;
    if (typeof tid !== "string" || tid.length === 0) continue;
    const arr = byThread.get(tid) ?? [];
    arr.push(m);
    byThread.set(tid, arr);
  }

  const out: InboxThreadRow[] = [];
  for (const [threadId, msgs] of byThread) {
    const chronological = [...msgs].sort(
      (a, b) =>
        new Date(a.received_at ?? 0).getTime() - new Date(b.received_at ?? 0).getTime(),
    );
    const latest = chronological[chronological.length - 1] ?? msgs[0];
    const first = chronological[0] ?? latest;
    let prospect = "";
    for (let i = chronological.length - 1; i >= 0; i--) {
      const m = chronological[i];
      if (m.direction === "outbound") {
        const e = normalizeMailboxForInboxStorage(m.to_email ?? "");
        if (e.includes("@")) {
          prospect = e;
          break;
        }
      } else {
        const e = normalizeMailboxForInboxStorage(m.from_email ?? "");
        if (e.includes("@")) {
          prospect = e;
          break;
        }
      }
    }
    if (!prospect.includes("@")) {
      prospect = normalizeMailboxForInboxStorage(
        (latest.to_email && latest.to_email.length > 0 ? latest.to_email : latest.from_email) ?? "",
      );
    }

    const subj = String(latest.subject ?? "").trim() || "(no subject)";
    const body = String(latest.body_text ?? "");
    const snippet = snippetFromBodyText(body.length > 0 ? body : subj, 140);
    const lastAt = latest.received_at ?? new Date().toISOString();
    const createdAt = first.received_at ?? lastAt;

    out.push({
      id: threadId,
      user_id: userId,
      prospect_email: prospect,
      subject: subj,
      snippet,
      last_message_at: lastAt,
      campaign_thread_id: null,
      created_at: createdAt,
    });
  }

  out.sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
  return out;
}

/**
 * Prompt 149 — `inbox_threads` LEFT JOIN `inbox_messages` via `inbox_messages!left(...)` embed (all user threads,
 * including rows with no visible messages under RLS); retries thread-only select if embed fails.
 *
 * Prompt 150 — If `inbox_threads.user_id = …` returns no rows but the user has `inbox_messages`, load threads by
 * distinct `thread_id` from those messages (user-scoped), then service-role `in('id', …)` when RLS still hides rows.
 *
 * Prompt 151 — If thread rows still cannot be read (e.g. no service role), synthesize thread list from the user’s
 * messages so `inbox_threads` count aligns with `inbox_messages` visible to `auth.uid()`.
 */
export async function fetchInboxThreadsForUserDisplay(
  userScoped: SupabaseClient,
  userId: string,
  search?: string,
  opts?: InboxThreadsListOptions,
): Promise<InboxThreadRow[]> {
  const msgNestLite = "inbox_messages!left(id, thread_id, direction, received_at)";
  const baseThread =
    "id, user_id, prospect_email, subject, snippet, last_message_at, campaign_thread_id, created_at";
  const extendedThread = `${baseThread}, user_last_read_at`;
  const fullThread = `${extendedThread}, archived_at, snoozed_until, labels`;

  const term = search?.trim();
  const esc = term
    ? term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
    : "";

  type Tier = { cols: string; hasRead: boolean; hasArchive: boolean };
  const tiers: Tier[] = [
    { cols: fullThread, hasRead: true, hasArchive: true },
    { cols: extendedThread, hasRead: true, hasArchive: false },
    { cols: baseThread, hasRead: false, hasArchive: false },
  ];

  const mapRowsToThreads = (raw: unknown): InboxThreadRow[] =>
    ((raw ?? []) as unknown[]).map((row) => {
      const r = row as Record<string, unknown>;
      const { inbox_messages: _msgs, ...threadRest } = r;
      void _msgs;
      return threadRest;
    }) as unknown as InboxThreadRow[];

  async function runTieredInboxThreadSelect(
    client: SupabaseClient,
    threadIds: string[] | null,
    eqThreadUserWhenFiltered: boolean,
  ): Promise<{
    data: unknown;
    hasReadColumn: boolean;
    hasArchiveCols: boolean;
    resolved: boolean;
    error: { message: string } | null;
  }> {
    const runQuery = async (threadCols: string, withMessageJoin: boolean) => {
      const selectStr = withMessageJoin ? `${threadCols}, ${msgNestLite}` : threadCols;
      let qq = client.from("inbox_threads").select(selectStr);
      if (threadIds && threadIds.length > 0) {
        qq = qq.in("id", threadIds);
        if (eqThreadUserWhenFiltered) qq = qq.eq("user_id", userId);
      } else {
        qq = qq.eq("user_id", userId);
      }
      qq = qq.order("last_message_at", { ascending: false }).limit(300);
      if (term) {
        qq = qq.or(`subject.ilike.%${esc}%,snippet.ilike.%${esc}%,prospect_email.ilike.%${esc}%`);
      }
      return qq;
    };

    let data: unknown = null;
    let error: { message: string } | null = null;
    let hasReadColumn = true;
    let hasArchiveCols = true;
    let resolved = false;

    for (const tier of tiers) {
      let res = await runQuery(tier.cols, true);
      if (!res.error) {
        data = res.data;
        error = null;
        hasReadColumn = tier.hasRead;
        hasArchiveCols = tier.hasArchive;
        resolved = true;
        break;
      }
      if (!isInboxOptionalColumnOrSchemaError(res.error.message)) {
        error = res.error;
        break;
      }
      res = await runQuery(tier.cols, false);
      if (!res.error) {
        data = res.data;
        error = null;
        hasReadColumn = tier.hasRead;
        hasArchiveCols = tier.hasArchive;
        resolved = true;
        break;
      }
      error = res.error;
      if (!isInboxOptionalColumnOrSchemaError(res.error.message)) {
        break;
      }
    }

    return { data, hasReadColumn, hasArchiveCols, resolved, error };
  }

  const primary = await runTieredInboxThreadSelect(userScoped, null, false);
  let data = primary.data;
  let hasReadColumn = primary.hasReadColumn;
  let hasArchiveCols = primary.hasArchiveCols;
  let threads = mapRowsToThreads(data);

  if (threads.length === 0) {
    const joinThreadCols =
      "id, user_id, prospect_email, subject, snippet, last_message_at, campaign_thread_id, created_at";
    const { data: viaJoin, error: joinErr } = await userScoped
      .from("inbox_messages")
      .select(`received_at, thread_id, inbox_threads!inner(${joinThreadCols})`)
      .eq("user_id", userId)
      .eq("inbox_threads.user_id", userId)
      .order("received_at", { ascending: false })
      .limit(400);
    if (!joinErr && viaJoin?.length) {
      const seen = new Set<string>();
      const acc: InboxThreadRow[] = [];
      for (const row of viaJoin as Record<string, unknown>[]) {
        const t = row.inbox_threads;
        if (!t || typeof t !== "object") continue;
        const id = String((t as { id?: string }).id ?? "");
        if (!id || seen.has(id)) continue;
        seen.add(id);
        acc.push(t as InboxThreadRow);
      }
      if (acc.length > 0) {
        acc.sort(
          (a, b) =>
            new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime(),
        );
        threads = acc;
        hasReadColumn = false;
        hasArchiveCols = false;
      }
    }
  }

  if (threads.length === 0) {
    const { data: msgThreadRows, error: msgErr } = await userScoped
      .from("inbox_messages")
      .select("thread_id")
      .eq("user_id", userId);
    if (!msgErr) {
      const idSet = new Set<string>();
      for (const r of msgThreadRows ?? []) {
        const tid = (r as { thread_id?: string }).thread_id;
        if (typeof tid === "string" && tid.length > 0) idSet.add(tid);
      }
      const fromMessageIds = [...idSet];
      if (fromMessageIds.length > 0) {
        let fb = await runTieredInboxThreadSelect(userScoped, fromMessageIds, true);
        if (!fb.resolved && fb.error) {
          if (
            !isInboxRelationMissingError(fb.error.message) &&
            !isInboxOptionalColumnOrSchemaError(fb.error.message)
          ) {
            console.error("[AgentForge] fetchInboxThreadsForUserDisplay fallback(user)", fb.error.message);
          }
        }
        if (mapRowsToThreads(fb.data).length === 0) {
          const sr = getServiceRoleSupabaseOrNull();
          if (sr) {
            fb = await runTieredInboxThreadSelect(sr, fromMessageIds, false);
            if (!fb.resolved && fb.error) {
              if (
                !isInboxRelationMissingError(fb.error.message) &&
                !isInboxOptionalColumnOrSchemaError(fb.error.message)
              ) {
                console.error("[AgentForge] fetchInboxThreadsForUserDisplay fallback(sr)", fb.error.message);
              }
            }
          }
        }
        if (mapRowsToThreads(fb.data).length > 0) {
          data = fb.data;
          hasReadColumn = fb.hasReadColumn;
          hasArchiveCols = fb.hasArchiveCols;
          threads = mapRowsToThreads(data);
        }
      }
    }
  }

  if (threads.length === 0) {
    const synthetic = await synthesizeInboxThreadsFromUserMessages(userScoped, userId);
    if (synthetic.length > 0) {
      threads = synthetic;
      hasReadColumn = true;
      hasArchiveCols = false;
    }
  }

  if (threads.length === 0) {
    if (primary.error && !primary.resolved) {
      if (
        !isInboxRelationMissingError(primary.error.message) &&
        !isInboxOptionalColumnOrSchemaError(primary.error.message)
      ) {
        console.error("[AgentForge] fetchInboxThreadsForUserDisplay", primary.error.message);
      }
    }
    return [];
  }

  const unreadInboundThreads = await fetchUnreadInboundThreadIdsForUser(userScoped, userId);

  const { data: pendingRows, error: pendErr } = await userScoped
    .from("inbox_messages")
    .select("thread_id")
    .eq("user_id", userId)
    .eq("direction", "inbound")
    .is("reply_analysis_id", null);
  if (pendErr) {
    if (!isInboxOptionalColumnOrSchemaError(pendErr.message)) {
      console.error("[AgentForge] fetchInboxThreadsForUserDisplay needs_review", pendErr.message);
    }
    threads = threads.map((t) => ({
      ...t,
      has_unread:
        unreadInboundThreads != null
          ? unreadInboundThreads.has(t.id)
          : hasReadColumn
            ? computeThreadUnread(t.last_message_at, t.user_last_read_at ?? null)
            : false,
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
      has_unread:
        unreadInboundThreads != null
          ? unreadInboundThreads.has(t.id)
          : hasReadColumn
            ? computeThreadUnread(t.last_message_at, t.user_last_read_at ?? null)
            : false,
      needs_review: needsReview.has(t.id),
    }));
  }

  threads.sort((a, b) => {
    const ua = a.has_unread ? 1 : 0;
    const ub = b.has_unread ? 1 : 0;
    if (ua !== ub) return ub - ua;
    return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
  });

  if (hasArchiveCols) {
    const wantArchived = opts?.includeArchived === true;
    threads = threads.filter((t) => (wantArchived ? threadIsArchived(t) : !threadIsArchived(t)));
    threads = threads.filter((t) => !threadIsSnoozed(t));
  }

  if (opts?.folder === "sent" && threads.length > 0) {
    const sentJoin = "inbox_threads!inner(user_id)";
    let msgRows: unknown[] =
      (
        await userScoped
          .from("inbox_messages")
          .select(`thread_id, direction, received_at, ${sentJoin}`)
          .eq("inbox_threads.user_id", userId)
          .order("received_at", { ascending: false })
          .limit(1000)
      ).data ?? [];
    if (msgRows.length === 0) {
      const byMsgUser = await userScoped
        .from("inbox_messages")
        .select("thread_id, direction, received_at")
        .eq("user_id", userId)
        .order("received_at", { ascending: false })
        .limit(1000);
      msgRows = (byMsgUser.data ?? []) as unknown[];
    }
    if (msgRows.length === 0) {
      const sr = getServiceRoleSupabaseOrNull();
      const threadIds = threads.map((t) => t.id);
      if (sr && threadIds.length > 0) {
        const alt = await sr
          .from("inbox_messages")
          .select("thread_id, direction, received_at")
          .in("thread_id", threadIds)
          .order("received_at", { ascending: false })
          .limit(1000);
        msgRows = (alt.data ?? []) as unknown[];
      }
    }
    const seen = new Set<string>();
    const sentIds = new Set<string>();
    for (const r of msgRows) {
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

/**
 * Prompt 149 — Server `/inbox` prefetch: joined thread list + message count (same rules as dashboard list).
 */
export async function fetchInboxPageInitialData(
  userScoped: SupabaseClient,
  userId: string,
): Promise<{ threads: InboxThreadRow[]; messageCount: number }> {
  await ensureInboxSchemaReady();
  const [threads, messageCount] = await Promise.all([
    fetchInboxThreadsForUserDisplay(userScoped, userId),
    countInboxMessagesVisibleToUser(userScoped, userId),
  ]);
  return { threads, messageCount };
}

/**
 * Prompt 148 / 149 — Count `inbox_messages` rows for the user’s threads (`inbox_threads!inner`), with fallbacks.
 */
export async function countInboxMessagesVisibleToUser(
  userScoped: SupabaseClient,
  userId: string,
): Promise<number> {
  const countJoin = "inbox_threads!inner(user_id)";
  const joined = await userScoped
    .from("inbox_messages")
    .select(`id, ${countJoin}`, { count: "exact", head: true })
    .eq("inbox_threads.user_id", userId)
    .in("direction", ["inbound", "outbound"]);

  if (!joined.error) {
    const n = joined.count ?? 0;
    if (n > 0) return n;
  }

  const direct = await userScoped
    .from("inbox_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("direction", ["inbound", "outbound"]);
  if (direct.error && !isInboxRelationMissingError(direct.error.message)) {
    return 0;
  }
  const directCount = direct.count ?? 0;
  if (directCount > 0) return directCount;

  const sr = getServiceRoleSupabaseOrNull();
  if (!sr) return 0;

  const { data: threadRows, error: tErr } = await userScoped
    .from("inbox_threads")
    .select("id")
    .eq("user_id", userId)
    .limit(2000);
  if (tErr || !threadRows?.length) return 0;

  const ids = threadRows
    .map((t) => (t as { id?: string }).id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (!ids.length) return 0;

  const c = await sr
    .from("inbox_messages")
    .select("id", { count: "exact", head: true })
    .in("thread_id", ids)
    .in("direction", ["inbound", "outbound"]);
  return c.count ?? 0;
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

export type ResendReceivedEmailApiPayload = {
  id?: string;
  from?: string;
  to?: string[];
  subject?: string;
  html?: string | null;
  text?: string | null;
  message_id?: string;
};

/**
 * Prompt 155 — Flatten Resend `email.received` so `to` / `cc` / `bcc` / `from` / `subject` resolve reliably
 * whether metadata lives on `data`, nested `payload`, or top-level.
 */
export function buildMergedResendWebhookPayload(body: unknown): Record<string, unknown> {
  const flat = unwrapResendEmailReceivedPayload(body);
  const merged: Record<string, unknown> = { ...flat };
  if (typeof flat.payload === "object" && flat.payload !== null) {
    Object.assign(merged, flat.payload as Record<string, unknown>);
  }
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (o.data && typeof o.data === "object") {
      Object.assign(merged, o.data as Record<string, unknown>);
    }
  }
  return merged;
}

function pushRecipientsFromField(raw: unknown, into: string[]): void {
  if (typeof raw === "string" && raw.trim().length > 0) {
    into.push(raw.trim());
    return;
  }
  if (!Array.isArray(raw)) return;
  for (const x of raw) {
    if (typeof x === "string") into.push(x);
    else if (x && typeof x === "object" && "email" in x && typeof (x as { email?: string }).email === "string") {
      into.push((x as { email: string }).email);
    }
  }
}

/**
 * Prompt 155 — All mailbox addresses that might route to a user inbox (`to`, `cc`, `bcc`, Receiving API `to`).
 */
export function collectResendInboundRecipientAddresses(
  body: unknown,
  merged: Record<string, unknown>,
  received: ResendReceivedEmailApiPayload | null,
): string[] {
  const acc: string[] = [];
  if (received?.to && Array.isArray(received.to)) pushRecipientsFromField(received.to, acc);
  pushRecipientsFromField(merged.to, acc);
  pushRecipientsFromField(merged.cc, acc);
  pushRecipientsFromField(merged.bcc, acc);
  pushRecipientsFromField(merged.recipients, acc);
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (o.data && typeof o.data === "object") {
      const d = o.data as Record<string, unknown>;
      pushRecipientsFromField(d.to, acc);
      pushRecipientsFromField(d.cc, acc);
      pushRecipientsFromField(d.bcc, acc);
    }
    pushRecipientsFromField(o.to, acc);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of acc) {
    const t = (a || "").trim();
    if (!t.toLowerCase().includes("@")) continue;
    const low = t.toLowerCase();
    if (seen.has(low)) continue;
    seen.add(low);
    out.push(t);
  }
  return out;
}

/** Resend `email.received` — id used with Receiving API (webhook body does not include HTML/text). */
export function extractResendInboundEmailIdFromWebhook(body: unknown): string | null {
  const pick = (v: unknown): string | null => {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    return null;
  };
  const uuidLike = (s: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

  const tryRecord = (o: Record<string, unknown> | null | undefined, depth: number): string | null => {
    if (!o || depth > 6) return null;
    const id =
      pick(o.email_id) ??
      pick(o.receiving_id) ??
      pick(o.emailId) ??
      (typeof o.id === "string" && uuidLike(o.id.trim()) ? o.id.trim() : null);
    if (id) return id;
    if (o.data && typeof o.data === "object") {
      const inner = tryRecord(o.data as Record<string, unknown>, depth + 1);
      if (inner) return inner;
    }
    if (o.record && typeof o.record === "object") {
      const inner = tryRecord(o.record as Record<string, unknown>, depth + 1);
      if (inner) return inner;
    }
    if (o.payload && typeof o.payload === "object") {
      const inner = tryRecord(o.payload as Record<string, unknown>, depth + 1);
      if (inner) return inner;
    }
    return null;
  };

  if (!body || typeof body !== "object") return null;
  return tryRecord(body as Record<string, unknown>, 0);
}

/** Prompt 155 — Prefer Receiving API `from`, then merged webhook metadata, then root. */
export function extractResendInboundFromField(
  received: ResendReceivedEmailApiPayload | null,
  merged: Record<string, unknown>,
  body: unknown,
): string {
  if (received?.from && String(received.from).trim().length > 0) return String(received.from).trim();
  const m = parseFromAddress(merged);
  if (m) return m;
  return parseFromAddress(body);
}

/**
 * Prompt 153 — Fetch full inbound message (body + headers) from Resend Receiving API.
 * @see https://resend.com/docs/api-reference/emails/retrieve-received-email
 */
export async function fetchResendReceivedEmailById(
  emailId: string,
): Promise<ResendReceivedEmailApiPayload | null> {
  const id = emailId.trim();
  if (!id) return null;
  const key = getServerEnv().RESEND_API_KEY?.trim();
  if (!key) {
    console.warn("[AgentForge][inbound] RESEND_API_KEY missing — cannot fetch received email body");
    return null;
  }
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[AgentForge][inbound] Resend receiving GET", res.status, errText.slice(0, 500));
      return null;
    }
    return (await res.json()) as ResendReceivedEmailApiPayload;
  } catch (e) {
    console.error("[AgentForge][inbound] Resend receiving fetch failed", e);
    return null;
  }
}

/**
 * Prompt 153 — Match recipient to `profiles.inbox_local_part` (any domain — inbound may not match `RESEND_FROM_EMAIL`).
 */
export async function resolveInboxUserIdAndMatchedRecipient(
  toAddresses: string[],
): Promise<{ userId: string; matchedTo: string } | null> {
  const seen = new Set<string>();
  for (const raw of toAddresses) {
    const bare = normalizeMailboxForInboxStorage(raw || "");
    if (!bare.includes("@")) continue;
    const local = extractLocalPartFromEmail(bare);
    if (!local || seen.has(local)) continue;
    seen.add(local);
    const userId = await findUserIdByInboxLocalPart(local);
    if (userId) return { userId, matchedTo: bare };
  }
  return null;
}

function inboundRawEnvelopeForStorage(webhookBody: unknown, apiPayload: ResendReceivedEmailApiPayload | null): Record<string, unknown> {
  const base: Record<string, unknown> = {
    source: "resend_inbound",
    fetched_via_receiving_api: apiPayload != null,
  };
  try {
    const compact =
      webhookBody && typeof webhookBody === "object"
        ? JSON.parse(JSON.stringify(webhookBody))
        : null;
    if (compact && typeof compact === "object") base.webhook = compact;
    if (apiPayload) base.received_email = apiPayload;
    return base;
  } catch {
    return base;
  }
}

/**
 * Prompt 153 — Persist Resend inbound reply: thread by `user_id` + prospect `from_email`, message `direction=inbound`,
 * `is_read=false`. Reuses thread from prior outbound to same prospect when `inbox_threads` row missing.
 */
export async function persistInboundResendReplyToInbox(
  sr: SupabaseClient,
  params: {
    userId: string;
    prospectEmail: string;
    toEmail: string;
    subject: string;
    text: string;
    html: string | null;
    providerMessageId: string | null;
    webhookBody: unknown;
    receivedEmail: ResendReceivedEmailApiPayload | null;
  },
): Promise<{ ok: true; thread_id: string } | { ok: false; error: string }> {
  const prospectEmail = normalizeEmail(params.prospectEmail);
  if (!prospectEmail.includes("@")) {
    return { ok: false, error: "Invalid prospect email" };
  }

  if (params.providerMessageId) {
    const { data: dup } = await sr
      .from("inbox_messages")
      .select("thread_id")
      .eq("provider_message_id", params.providerMessageId)
      .maybeSingle();
    const dupTid = (dup as { thread_id?: string } | null)?.thread_id;
    if (dupTid) {
      console.log("[inbound/resend] duplicate provider_message_id, skipping insert", params.providerMessageId);
      return { ok: true, thread_id: dupTid };
    }
  }

  const textBody =
    params.text.trim().length > 0
      ? params.text
      : params.html
        ? approximatePlainTextFromHtml(params.html)
        : "";
  const snippet = snippetFromBodyText(textBody || "(empty message)", 220) || "(empty message)";
  const campaignThreadId = await findCampaignThreadIdForProspect(sr, params.userId, prospectEmail);

  let threadId: string | null = null;
  const nowIso = new Date().toISOString();

  const { data: threadCandidates, error: threadLookupErr } = await sr
    .from("inbox_threads")
    .select("id")
    .eq("user_id", params.userId)
    .eq("prospect_email", prospectEmail)
    .order("last_message_at", { ascending: false })
    .limit(1);

  if (threadLookupErr) {
    console.error("[inbound/resend] thread lookup", threadLookupErr.message);
    return { ok: false, error: threadLookupErr.message };
  }

  const picked = threadCandidates?.[0] as { id?: string } | undefined;
  if (picked?.id) {
    threadId = picked.id;
  } else {
    const { data: msgRows } = await sr
      .from("inbox_messages")
      .select("thread_id, direction, from_email, to_email, received_at")
      .eq("user_id", params.userId)
      .in("direction", ["inbound", "outbound"])
      .order("received_at", { ascending: false })
      .limit(320);
    for (const row of msgRows ?? []) {
      const r = row as {
        thread_id?: string;
        direction?: string;
        from_email?: string;
        to_email?: string;
      };
      if (!r.thread_id) continue;
      const toSt = normalizeMailboxForInboxStorage(r.to_email ?? "");
      const fromSt = normalizeMailboxForInboxStorage(r.from_email ?? "");
      const matches =
        (r.direction === "outbound" && toSt === prospectEmail) ||
        (r.direction === "inbound" && fromSt === prospectEmail);
      if (matches) {
        threadId = r.thread_id;
        console.log("[inbound/resend] matched thread by prospect activity", {
          thread_id: threadId,
          prospectEmail,
        });
        break;
      }
    }
  }

  if (!threadId) {
    const { data: ins, error: insErr } = await sr
      .from("inbox_threads")
      .insert({
        user_id: params.userId,
        prospect_email: prospectEmail,
        subject: params.subject || "(no subject)",
        snippet,
        last_message_at: nowIso,
        campaign_thread_id: campaignThreadId ?? null,
      })
      .select("id")
      .single();
    if (insErr || !ins) {
      console.error("[inbound/resend] thread insert", insErr?.message);
      return { ok: false, error: insErr?.message ?? "thread insert failed" };
    }
    threadId = String((ins as { id: string }).id);
  }

  const threadPatch: Record<string, unknown> = {
    subject: params.subject || "(no subject)",
    snippet,
    last_message_at: nowIso,
    updated_at: nowIso,
  };
  if (campaignThreadId) threadPatch.campaign_thread_id = campaignThreadId;
  let threadBump = await sr.from("inbox_threads").update(threadPatch as never).eq("id", threadId);
  if (threadBump.error && isOptionalInboxThreadColumnMissingError(threadBump.error.message)) {
    threadBump = await sr
      .from("inbox_threads")
      .update({
        subject: params.subject || "(no subject)",
        snippet,
        last_message_at: nowIso,
        ...(campaignThreadId ? { campaign_thread_id: campaignThreadId } : {}),
      } as never)
      .eq("id", threadId);
  }
  if (threadBump.error && !isOptionalInboxThreadColumnMissingError(threadBump.error.message)) {
    console.error("[inbound/resend] thread bump before inbound insert", threadBump.error.message);
  }

  const rawEnvelope = inboundRawEnvelopeForStorage(params.webhookBody, params.receivedEmail);
  const receivedAt = new Date().toISOString();

  const insertAttempts: Record<string, unknown>[] = [
    {
      thread_id: threadId,
      user_id: params.userId,
      direction: "inbound",
      from_email: prospectEmail,
      to_email: params.toEmail.trim(),
      subject: params.subject || "(no subject)",
      body_text: textBody.slice(0, 50_000),
      body_html: params.html ? params.html.slice(0, 200_000) : null,
      provider_message_id: params.providerMessageId,
      raw: rawEnvelope,
      received_at: receivedAt,
      is_read: false,
    },
    {
      thread_id: threadId,
      user_id: params.userId,
      direction: "inbound",
      from_email: prospectEmail,
      to_email: params.toEmail.trim(),
      subject: params.subject || "(no subject)",
      body_text: textBody.slice(0, 50_000),
      body_html: params.html ? params.html.slice(0, 200_000) : null,
      received_at: receivedAt,
      is_read: false,
    },
    {
      thread_id: threadId,
      user_id: params.userId,
      direction: "inbound",
      from_email: prospectEmail,
      to_email: params.toEmail.trim(),
      subject: params.subject || "(no subject)",
      body_text: textBody.slice(0, 50_000),
      received_at: receivedAt,
    },
  ];

  let lastMsgErr: { message?: string; code?: string } | null = null;
  for (let i = 0; i < insertAttempts.length; i++) {
    const { error: msgErr } = await sr.from("inbox_messages").insert(insertAttempts[i] as never);
    if (!msgErr) {
      lastMsgErr = null;
      if (i > 0) {
        console.log("[inbound/resend] message insert succeeded on retry variant", i);
      }
      break;
    }
    lastMsgErr = msgErr;
    const msg = msgErr.message || "";
    const retryable =
      isOptionalInboxMessageColumnMissingError(msg) ||
      isInboxOptionalColumnOrSchemaError(msg) ||
      /42804|invalid input syntax|22P02/i.test(msg);
    if (!retryable) {
      console.error("[inbound/resend] message insert", msgErr.message, msgErr.code);
      return { ok: false, error: msgErr.message };
    }
    console.warn("[inbound/resend] message insert retry", { variant: i, message: msgErr.message });
  }
  if (lastMsgErr) {
    console.error("[inbound/resend] message insert exhausted retries", lastMsgErr.message);
    return { ok: false, error: lastMsgErr.message ?? "inbox_messages insert failed" };
  }

  try {
    revalidatePath("/inbox");
    revalidatePath("/dashboard");
  } catch (revalErr) {
    console.warn("[inbound/resend] revalidatePath after inbound", revalErr);
  }

  return { ok: true, thread_id: threadId };
}

export type ResendInboundIngestResult =
  | { status: "saved"; thread_id: string }
  | { status: "skipped"; hint: string }
  | { status: "error"; error: string };

/**
 * Prompt 155 — Full `email.received` ingest: parse id, pull body from Receiving API, match any of to/cc/bcc to
 * `profiles.inbox_local_part`, persist inbound row on the thread for `prospect_email`.
 */
export async function ingestResendEmailReceivedWebhook(
  body: unknown,
  sr: SupabaseClient,
): Promise<ResendInboundIngestResult> {
  await ensureInboxSchemaReady();

  const emailId = extractResendInboundEmailIdFromWebhook(body);
  const received = emailId ? await fetchResendReceivedEmailById(emailId) : null;
  if (emailId && received) {
    console.log("[inbound/resend] loaded received email via API", emailId);
  } else if (emailId && !received) {
    console.warn("[inbound/resend] Receiving API returned no payload for", emailId);
  } else {
    console.warn(
      "[inbound/resend] no email_id in webhook; top-level keys",
      body && typeof body === "object" ? Object.keys(body as object).join(",") : "(none)",
    );
  }

  const merged = buildMergedResendWebhookPayload(body);
  const toList = collectResendInboundRecipientAddresses(body, merged, received);

  const fromRaw = extractResendInboundFromField(received, merged, body);

  let subject = "";
  let text = "";
  let html: string | null = null;
  if (received) {
    subject = received.subject != null ? String(received.subject).trim() : "";
    html =
      received.html != null && String(received.html).trim().length > 0 ? String(received.html) : null;
    text = received.text != null && String(received.text).trim().length > 0 ? String(received.text) : "";
    if (!text && html) text = approximatePlainTextFromHtml(html);
  }
  if (!subject || (text === "" && !html)) {
    const parsed = parseInboundSubjectBody(Object.keys(merged).length ? merged : body);
    if (!subject) subject = parsed.subject;
    if (text === "" && !html) {
      text = parsed.text;
      html = parsed.html;
    }
  }

  const resolved = await resolveInboxUserIdAndMatchedRecipient(toList);
  if (!resolved) {
    console.log(
      "[inbound/resend] skipped: no inbox_local_part match",
      JSON.stringify({ recipients_preview: toList.slice(0, 8) }),
    );
    return { status: "skipped", hint: "No matching inbox_local_part" };
  }
  const { userId, matchedTo } = resolved;

  const prospectEmail = normalizeEmail(
    fromRaw.includes("<")
      ? (fromRaw.match(/<([^>]+)>/)?.[1] ?? fromRaw).trim()
      : fromRaw.split(/\s+/).pop() ?? fromRaw,
  );
  if (!prospectEmail.includes("@")) {
    console.log("[inbound/resend] skipped: invalid from", JSON.stringify({ from_preview: fromRaw.slice(0, 160) }));
    return { status: "skipped", hint: "Invalid from" };
  }

  const providerId =
    (received?.id && String(received.id).trim()) ||
    (typeof merged.id === "string" && uuidLikeString(merged.id) ? merged.id : null) ||
    (typeof merged.email_id === "string" ? merged.email_id : null) ||
    emailId;

  const persisted = await persistInboundResendReplyToInbox(sr, {
    userId,
    prospectEmail,
    toEmail: normalizeMailboxForInboxStorage(matchedTo) || matchedTo,
    subject: subject || "(no subject)",
    text,
    html,
    providerMessageId: providerId ? String(providerId).trim() : null,
    webhookBody: body,
    receivedEmail: received,
  });

  if (!persisted.ok) {
    return { status: "error", error: persisted.error };
  }
  return { status: "saved", thread_id: persisted.thread_id };
}

function uuidLikeString(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.trim());
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
