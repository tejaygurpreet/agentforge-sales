import { after } from "next/server";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import twilio from "twilio";
import { afterTwilioVoiceCallCompleted } from "@/lib/twilio";
import { getServiceRoleSupabaseOrNull } from "@/lib/supabase-server";

function publicRequestUrl(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const path = req.nextUrl.pathname + req.nextUrl.search;
  return `${proto}://${host}${path}`;
}

/**
 * Prompt 83 — Twilio Voice status callback: on `completed`, transcribe + living objection library.
 * Configure Status Callback URL to this route (optionally `?workspace_id=` for team workspace scoping).
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>;
  const signature = req.headers.get("X-Twilio-Signature") ?? "";
  const url = publicRequestUrl(req);
  const accountSid = params.AccountSid?.trim() ?? "";

  const sr = getServiceRoleSupabaseOrNull();
  if (!sr) {
    return new NextResponse("Server misconfigured", { status: 500 });
  }

  const { data: credRow } = await sr
    .from("user_twilio_credentials")
    .select("auth_token")
    .eq("account_sid", accountSid)
    .maybeSingle();

  const authToken =
    credRow && typeof (credRow as { auth_token?: string }).auth_token === "string"
      ? (credRow as { auth_token: string }).auth_token
      : null;

  if (!authToken) {
    return new NextResponse("Unknown Twilio account", { status: 403 });
  }

  const valid = twilio.validateRequest(authToken, signature, url, params);
  if (!valid) {
    return new NextResponse("Invalid signature", { status: 403 });
  }

  const workspaceIdHint = req.nextUrl.searchParams.get("workspace_id");

  after(() => {
    void afterTwilioVoiceCallCompleted({
      CallSid: params.CallSid ?? "",
      CallStatus: params.CallStatus,
      AccountSid: params.AccountSid,
      RecordingUrl: params.RecordingUrl,
      RecordingDuration: params.RecordingDuration,
      workspaceIdHint,
    }).catch((e) => {
      console.error("[AgentForge] twilio/voice/status:after", e);
    });
  });

  return new NextResponse("OK", { status: 200 });
}
