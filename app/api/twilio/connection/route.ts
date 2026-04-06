import { NextResponse } from "next/server";
import { isEnvTwilioConfigured } from "@/lib/twilio";

/**
 * Prompt 162 — Public connection status for Twilio env (no secrets). Used by setup Twilio card.
 */
export async function GET() {
  const configured = isEnvTwilioConfigured();
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER?.trim() ?? null;
  const inboundOwnerConfigured = Boolean(process.env.TWILIO_INBOUND_OWNER_USER_ID?.trim());

  return NextResponse.json({
    ok: true,
    configured,
    phoneNumber,
    inboundPipelineReady: configured && inboundOwnerConfigured,
  });
}
