import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import {
  ensureInboxSchemaReady,
  extractLocalPartFromEmail,
  findCampaignThreadIdForProspect,
  findUserIdByInboxLocalPart,
  normalizeEmail,
  parseFromAddress,
  parseInboundSubjectBody,
  parseToAddresses,
  snippetFromBodyText,
  unwrapResendEmailReceivedPayload,
  verifyWebhookSharedSecret,
} from "@/lib/inbox";
import { getServerEnv } from "@/lib/env";
import { domainFromResendFromHeader } from "@/lib/resend";
import { getServiceRoleSupabaseOrNull } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

function verifySecret(request: NextRequest): boolean {
  const env = getServerEnv();
  return verifyWebhookSharedSecret(request, env.WEBHOOK_SECRET);
}

/**
 * Prompt 115 — Resend inbound webhook: store prospect replies in `inbox_threads` / `inbox_messages`.
 * Prompt 120 — Verification via `verifyWebhookSharedSecret` (`lib/inbox.ts`); GET for health checks.
 *
 * Configure in Resend → Inbound → Webhook URL + shared secret (`WEBHOOK_SECRET`).
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

  const flat = unwrapResendEmailReceivedPayload(body);
  const merged = { ...flat, ...(typeof flat.payload === "object" && flat.payload !== null ? flat.payload : {}) };
  const toList = parseToAddresses(merged).length ? parseToAddresses(merged) : parseToAddresses(body);
  const fromRaw = parseFromAddress(merged) || parseFromAddress(body);
  const { subject, text, html } = parseInboundSubjectBody(
    Object.keys(merged).length ? merged : body,
  );

  const env = getServerEnv();
  const domain =
    domainFromResendFromHeader(env.RESEND_FROM_EMAIL).toLowerCase() || "agentforgesales.com";

  let userId: string | null = null;
  for (const rawTo of toList) {
    const lower = rawTo.trim().toLowerCase();
    if (!lower.endsWith(`@${domain}`)) continue;
    const local = extractLocalPartFromEmail(lower);
    if (!local) continue;
    userId = await findUserIdByInboxLocalPart(local);
    if (userId) break;
  }

  if (!userId) {
    return NextResponse.json({ ok: true, skipped: true, hint: "No matching inbox_local_part" });
  }

  const prospectEmail = normalizeEmail(
    fromRaw.includes("<")
      ? (fromRaw.match(/<([^>]+)>/)?.[1] ?? fromRaw).trim()
      : fromRaw.split(/\s+/).pop() ?? fromRaw,
  );
  if (!prospectEmail.includes("@")) {
    return NextResponse.json({ ok: true, skipped: true, hint: "Invalid from" });
  }

  const snippet = snippetFromBodyText(text, 220) || "(empty message)";
  const providerId =
    typeof merged.id === "string"
      ? merged.id
      : typeof (merged as { email_id?: string }).email_id === "string"
        ? (merged as { email_id: string }).email_id
        : null;

  const campaignThreadId = await findCampaignThreadIdForProspect(sr, userId, prospectEmail);

  const { data: existingThread, error: threadLookupErr } = await sr
    .from("inbox_threads")
    .select("id")
    .eq("user_id", userId)
    .eq("prospect_email", prospectEmail)
    .maybeSingle();

  if (threadLookupErr) {
    console.error("[inbound/resend] thread lookup", threadLookupErr.message);
    return NextResponse.json({ ok: false, error: threadLookupErr.message }, { status: 500 });
  }

  let threadId: string;
  const ex = existingThread as { id?: string } | null;
  if (ex?.id) {
    threadId = ex.id;
    await sr
      .from("inbox_threads")
      .update({
        subject: subject || "(no subject)",
        snippet,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...(campaignThreadId ? { campaign_thread_id: campaignThreadId } : {}),
      })
      .eq("id", threadId);
  } else {
    const { data: ins, error: insErr } = await sr
      .from("inbox_threads")
      .insert({
        user_id: userId,
        prospect_email: prospectEmail,
        subject: subject || "(no subject)",
        snippet,
        last_message_at: new Date().toISOString(),
        campaign_thread_id: campaignThreadId,
      })
      .select("id")
      .single();
    if (insErr || !ins) {
      console.error("[inbound/resend] thread insert", insErr?.message);
      return NextResponse.json({ ok: false, error: insErr?.message ?? "insert failed" }, { status: 500 });
    }
    threadId = String((ins as { id: string }).id);
  }

  const { error: msgErr } = await sr.from("inbox_messages").insert({
    thread_id: threadId,
    user_id: userId,
    direction: "inbound",
    from_email: prospectEmail,
    to_email: toList[0]?.trim() ?? "",
    subject: subject || "(no subject)",
    body_text: text.slice(0, 50_000),
    body_html: html ? html.slice(0, 200_000) : null,
    provider_message_id: providerId,
    raw: body as object,
    received_at: new Date().toISOString(),
  });

  if (msgErr) {
    console.error("[inbound/resend] message insert", msgErr.message);
    return NextResponse.json({ ok: false, error: msgErr.message }, { status: 500 });
  }

  revalidatePath("/");
  revalidatePath("/replies");

  return NextResponse.json({ ok: true, thread_id: threadId });
}
