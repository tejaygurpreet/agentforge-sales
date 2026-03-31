import "server-only";

import { Resend } from "resend";
import { DEFAULT_BRAND_DISPLAY_NAME } from "@/lib/brand-prompt";
import { getServerEnv } from "@/lib/env";

const RESEND_KEY_MISSING =
  "Email not sent – RESEND_API_KEY missing";

export function getResendClient(): Resend | null {
  const key = getServerEnv().RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

/**
 * Extract the domain from `RESEND_FROM_EMAIL` (e.g. `Name <local@agentforgesales.com>`).
 * Falls back to agentforgesales.com if parsing fails.
 */
export function domainFromResendFromHeader(header: string | undefined): string {
  if (!header?.trim()) return "agentforgesales.com";
  const inBrackets = header.match(/<([^>]+)>/);
  if (inBrackets?.[1]) {
    const email = inBrackets[1].trim();
    const at = email.lastIndexOf("@");
    if (at !== -1 && at < email.length - 1) {
      return email.slice(at + 1).trim();
    }
  }
  const bare = header.match(/@([a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,})/);
  if (bare?.[1]) return bare[1];
  return "agentforgesales.com";
}

/**
 * Default local-part from env (e.g. `noreply` from `Name <noreply@domain>`) when no display name.
 */
function defaultLocalPartFromEnv(header: string | undefined): string {
  if (!header?.trim()) return "noreply";
  const m = header.match(/<([^>@\s]+)@/);
  if (m?.[1]?.trim()) return m[1].trim().slice(0, 64);
  const bare = header.match(/^([a-zA-Z0-9._+-]+)@/);
  if (bare?.[1]) return bare[1].slice(0, 64);
  return "noreply";
}

/**
 * Safe RFC 5322 local-part from the user's full name (e.g. "Gurpreet Singh" → "gurpreet.singh").
 * Exported for Prompt 115 inbox routing (must match `profiles.inbox_local_part`).
 */
export function slugifyLocalPartFromName(name: string): string {
  const raw = name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  const parts = raw.split(/\s+/).filter(Boolean);
  const joined =
    parts.length > 0
      ? parts.join(".")
      : "";
  const cleaned = joined.replace(/[^a-z0-9.]+/g, ".").replace(/^\.+|\.+$/g, "");
  const out = cleaned.slice(0, 64);
  return out.length > 0 ? out : "noreply";
}

function escapeDisplayNameForFromHeader(name: string): string {
  return name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Bare `local@domain` from a full From header (Prompt 115 — Reply-To same as From for inbox).
 */
export function extractBareEmailFromFromHeader(fromHeader: string): string | null {
  if (!fromHeader?.trim()) return null;
  const inBrackets = fromHeader.match(/<([^>]+)>/);
  const inner = (inBrackets?.[1] ?? fromHeader).trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inner)) return inner.toLowerCase();
  return null;
}

/**
 * Builds Resend `from` using the signed-in user's full name and the **same verified domain**
 * as `RESEND_FROM_EMAIL` (no new env vars).
 *
 * Format: `"Gurpreet Singh" <gurpreet.singh@your-verified-domain>` — display name matches the
 * profile; local-part is slugified for deliverability, or **`inboxLocalPart`** when set (Prompt 115).
 */
export function buildDynamicFromEmail(
  senderFullName: string | undefined | null,
  inboxLocalPart?: string | null,
): string {
  const env = getServerEnv();
  const baseHeader = env.RESEND_FROM_EMAIL;
  const domain = domainFromResendFromHeader(baseHeader);
  const display =
    typeof senderFullName === "string" && senderFullName.trim().length > 0
      ? senderFullName.trim()
      : (() => {
          const h = baseHeader ?? "";
          const m = h.match(/^["']?([^"'<]+?)["']?\s*</);
          if (m?.[1]?.trim()) return m[1].trim();
          return DEFAULT_BRAND_DISPLAY_NAME;
        })();
  const local =
    typeof inboxLocalPart === "string" && inboxLocalPart.trim().length > 0
      ? inboxLocalPart
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9._+-]/g, "")
          .slice(0, 64) || defaultLocalPartFromEnv(baseHeader)
      : typeof senderFullName === "string" && senderFullName.trim().length > 0
        ? slugifyLocalPartFromName(senderFullName)
        : defaultLocalPartFromEnv(baseHeader);
  return `"${escapeDisplayNameForFromHeader(display)}" <${local}@${domain}>`;
}

export async function sendTransactionalEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  /** Full `From` header. Prefer {@link buildDynamicFromEmail} for dashboard campaigns. */
  from?: string;
  /** Logged-in user's real inbox — prospect replies route here (Prompt 73). */
  reply_to?: string | string[];
  /** Prompt 86 — PDF/CSV attachments (Buffer or base64 content). */
  attachments?: { filename: string; content: Buffer | string }[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = getResendClient();
  const env = getServerEnv();
  const from =
    params.from ??
    env.RESEND_FROM_EMAIL ??
    `${DEFAULT_BRAND_DISPLAY_NAME} <onboarding@resend.dev>`;
  if (!client) {
    return { ok: false, error: RESEND_KEY_MISSING };
  }
  try {
    const { error } = await client.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      ...(params.attachments?.length
        ? { attachments: params.attachments.map((a) => ({ filename: a.filename, content: a.content })) }
        : {}),
      ...(params.reply_to != null && params.reply_to !== ""
        ? { reply_to: params.reply_to }
        : {}),
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
