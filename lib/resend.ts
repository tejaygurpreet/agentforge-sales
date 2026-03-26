import "server-only";

import { Resend } from "resend";
import { getServerEnv } from "@/lib/env";

const RESEND_KEY_MISSING =
  "Email not sent – RESEND_API_KEY missing";

export function getResendClient(): Resend | null {
  const key = getServerEnv().RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export async function sendTransactionalEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = getResendClient();
  const env = getServerEnv();
  const from =
    params.from ??
    env.RESEND_FROM_EMAIL ??
    "AgentForge <onboarding@resend.dev>";
  if (!client) {
    return { ok: false, error: RESEND_KEY_MISSING };
  }
  try {
    const { error } = await client.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Resend send failed";
    return { ok: false, error: message };
  }
}
