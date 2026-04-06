import { after } from "next/server";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { runEnvInboundVoiceRecording } from "@/lib/twilio-inbound-voice";
import {
  getEnvTwilioVoiceConfig,
  getTwilioWebhookBaseUrl,
  validateTwilioSignature,
} from "@/lib/twilio";

function publicRequestUrl(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const path = req.nextUrl.pathname + req.nextUrl.search;
  return `${proto}://${host}${path}`;
}

function twimlResponse(xml: string): NextResponse {
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

/**
 * Prompt 162 — Twilio Voice URL + inbound recording callback.
 * Set your Twilio number’s “A call comes in” webhook to POST `https://<app>/api/webhooks/twilio`.
 * Uses `TWILIO_AUTH_TOKEN` for signature validation; full pipeline needs `getEnvTwilioVoiceConfig()`.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>;
  const signature = req.headers.get("X-Twilio-Signature") ?? "";
  const url = publicRequestUrl(req);
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();

  if (!authToken) {
    return twimlResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Telephony is not configured.</Say><Hangup/></Response>`,
    );
  }

  const ok = validateTwilioSignature(authToken, signature, url, params);
  if (!ok) {
    return new NextResponse("Invalid signature", { status: 403 });
  }

  const recordingUrl = params.RecordingUrl?.trim();
  if (recordingUrl) {
    const full = getEnvTwilioVoiceConfig();
    if (full) {
      after(() => {
        void runEnvInboundVoiceRecording(
          {
            CallSid: params.CallSid ?? "",
            RecordingUrl: recordingUrl,
            RecordingDuration: params.RecordingDuration,
            From: params.From,
            To: params.To,
          },
          full,
        ).catch((e) => {
          console.error("[AgentForge] webhooks/twilio:recording", e);
        });
      });
    } else {
      console.warn("[AgentForge] webhooks/twilio:recording_skip_missing_env_pipeline");
    }
    return new NextResponse("OK", { status: 200 });
  }

  const base = getTwilioWebhookBaseUrl().replace(/\/$/, "");
  const actionUrl = `${base}/api/webhooks/twilio`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thanks for calling. Please leave a short message after the tone.</Say>
  <Record timeout="10" maxLength="180" playBeep="true" action="${escapeXml(
    actionUrl,
  )}" method="POST" />
</Response>`;
  return twimlResponse(xml);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function GET() {
  return new NextResponse("Twilio Voice webhook — use POST", { status: 405 });
}
