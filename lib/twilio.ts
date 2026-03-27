import "server-only";

import twilioSdk from "twilio";
import type { SdrVoiceTone } from "@/agents/types";
import { getClientEnv } from "@/lib/env";

export type TwilioCredentials = {
  accountSid: string;
  authToken: string;
  fromPhoneE164: string;
  userPhoneE164: string | null;
};

/** Twilio <Say> Amazon Polly voice — maps SDR preset to a distinct TTS character. */
export function pollyVoiceForSdrTone(tone: SdrVoiceTone | undefined): string {
  switch (tone) {
    case "warm_relationship_builder":
      return "Polly.Joanna";
    case "bold_challenger":
      return "Polly.Matthew";
    case "data_driven_analyst":
      return "Polly.Amy";
    case "consultative_enterprise":
      return "Polly.Brian";
    default:
      return "Polly.Joanna";
  }
}

export function getTwilioRestClient(creds: TwilioCredentials): ReturnType<typeof twilioSdk> {
  return twilioSdk(creds.accountSid, creds.authToken);
}

/**
 * Public HTTPS base for Twilio webhooks (GET TwiML). Prefer NEXT_PUBLIC_APP_URL in production.
 */
export function getTwilioWebhookBaseUrl(): string {
  const env = getClientEnv();
  const u = env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (u?.startsWith("http")) return u;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

/** Strip spaces/dashes; ensure + prefix for E.164 when possible. */
export function normalizePhoneE164(raw: string): string | null {
  const t = raw.trim().replace(/[\s().-]/g, "");
  if (!t) return null;
  if (t.startsWith("+") && /^\+[1-9]\d{6,14}$/.test(t)) return t;
  if (/^\d{10,15}$/.test(t)) return `+${t}`;
  return null;
}
