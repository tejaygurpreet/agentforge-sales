import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import {
  ensureInboxSchemaReady,
  ingestResendEmailReceivedWebhook,
  verifyWebhookSharedSecret,
} from "@/lib/inbox";
import { getServerEnv } from "@/lib/env";
import { getServiceRoleSupabaseOrNull } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

function verifySecret(request: NextRequest): boolean {
  return verifyWebhookSharedSecret(request, getServerEnv().WEBHOOK_SECRET);
}

/**
 * Prompt 155 — Canonical Resend inbound handler (`email.received`).
 * Parses `data.email_id`, merges `to`/`cc`/`bcc`, fetches body via Receiving API, matches `profiles.inbox_local_part`,
 * inserts `inbox_messages` as `direction=inbound`, `is_read=false` on the thread for `prospect_email`.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "agentforge-webhook-resend-inbound",
    hint: "POST JSON email.received; authorize with WEBHOOK_SECRET (Bearer, x-webhook-secret, or ?secret=).",
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

  const result = await ingestResendEmailReceivedWebhook(body, sr);

  if (result.status === "error") {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  if (result.status === "skipped") {
    return NextResponse.json({ ok: true, skipped: true, hint: result.hint });
  }

  revalidatePath("/dashboard");
  revalidatePath("/replies");
  revalidatePath("/inbox");

  return NextResponse.json({ ok: true, thread_id: result.thread_id });
}
