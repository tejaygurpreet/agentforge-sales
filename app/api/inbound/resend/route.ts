import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import {
  approximatePlainTextFromHtml,
  extractResendInboundEmailIdFromWebhook,
  fetchResendReceivedEmailById,
  persistInboundResendReplyToInbox,
  normalizeEmail,
  normalizeMailboxForInboxStorage,
  parseFromAddress,
  parseInboundSubjectBody,
  parseToAddresses,
  resolveInboxUserIdAndMatchedRecipient,
  ensureInboxSchemaReady,
  unwrapResendEmailReceivedPayload,
  verifyWebhookSharedSecret,
} from "@/lib/inbox";
import { getServerEnv } from "@/lib/env";
import { getServiceRoleSupabaseOrNull } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

function verifySecret(request: NextRequest): boolean {
  const env = getServerEnv();
  return verifyWebhookSharedSecret(request, env.WEBHOOK_SECRET);
}

/**
 * Prompt 115 / 153 — Resend inbound: `email.received` webhook → Receiving API (full body) → `inbox_threads` +
 * `inbox_messages` (`direction=inbound`, `is_read=false`). Thread = `user_id` + prospect `from_email`.
 *
 * Configure: Resend Inbound → Webhook URL + `WEBHOOK_SECRET`. Requires `RESEND_API_KEY` to fetch body (webhook is metadata-only).
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "agentforge-inbound-resend",
    hint: "POST JSON from Resend email.received; authorize with WEBHOOK_SECRET (Bearer, x-webhook-secret, or ?secret=).",
  });
}

export async function POST(request: NextRequest) {
  if (!verifySecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sr = getServiceRoleSupabaseOrNull();
  if (!sr) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 503 });
  }

  await ensureInboxSchemaReady();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const emailId = extractResendInboundEmailIdFromWebhook(body);
  const received = emailId ? await fetchResendReceivedEmailById(emailId) : null;
  if (emailId && received) {
    console.log("[inbound/resend] loaded received email via API", emailId);
  } else if (emailId && !received) {
    console.warn("[inbound/resend] Receiving API returned no payload for", emailId);
  }

  const flat = unwrapResendEmailReceivedPayload(body);
  const merged = {
    ...flat,
    ...(typeof flat.payload === "object" && flat.payload !== null ? flat.payload : {}),
  };

  const toListFromWebhook = parseToAddresses(merged).length ? parseToAddresses(merged) : parseToAddresses(body);
  const toList =
    received?.to && Array.isArray(received.to) && received.to.length > 0 ? received.to : toListFromWebhook;

  const fromRaw =
    (received?.from && String(received.from).trim()) ||
    parseFromAddress(merged) ||
    parseFromAddress(body);

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
    return NextResponse.json({ ok: true, skipped: true, hint: "No matching inbox_local_part" });
  }
  const { userId, matchedTo } = resolved;

  const prospectEmail = normalizeEmail(
    fromRaw.includes("<")
      ? (fromRaw.match(/<([^>]+)>/)?.[1] ?? fromRaw).trim()
      : fromRaw.split(/\s+/).pop() ?? fromRaw,
  );
  if (!prospectEmail.includes("@")) {
    return NextResponse.json({ ok: true, skipped: true, hint: "Invalid from" });
  }

  const providerId =
    (received?.id && String(received.id).trim()) ||
    (typeof merged.id === "string" ? merged.id : null) ||
    (typeof (merged as { email_id?: string }).email_id === "string"
      ? (merged as { email_id: string }).email_id
      : null) ||
    emailId;

  const result = await persistInboundResendReplyToInbox(sr, {
    userId,
    prospectEmail,
    toEmail: normalizeMailboxForInboxStorage(matchedTo) || matchedTo,
    subject: subject || "(no subject)",
    text,
    html,
    providerMessageId: providerId,
    webhookBody: body,
    receivedEmail: received,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  revalidatePath("/");
  revalidatePath("/replies");

  return NextResponse.json({ ok: true, thread_id: result.thread_id });
}
