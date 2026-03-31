import "server-only";

import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const GCAL_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const MS_SCOPE = "offline_access Calendars.ReadWrite User.Read";

/** Prompt 100 — demo invites reuse `createGoogleCalendarEvent` / `createMicrosoftCalendarEvent` with a richer description from `lib/demo-generator.formatDemoScriptForCalendarDescription`. */

function appBaseUrl(): string {
  const u =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000";
  return u.replace(/\/$/, "");
}

function oauthSecret(): string {
  return (
    process.env.CALENDAR_OAUTH_STATE_SECRET?.trim() ||
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY?.trim() ||
    ""
  );
}

function encryptionKey(): Buffer | null {
  const s = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY?.trim();
  if (!s || s.length < 16) return null;
  return scryptSync(s, "agentforge-calendar-v1", 32);
}

/** AES-256-GCM; if no key, stores plaintext (dev only — set CALENDAR_TOKEN_ENCRYPTION_KEY in prod). */
export function encryptRefreshToken(plain: string): string {
  const key = encryptionKey();
  if (!key) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptRefreshToken(stored: string): string {
  const key = encryptionKey();
  if (!key) return stored;
  try {
    const buf = Buffer.from(stored, "base64url");
    if (buf.length < 29) return stored;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return stored;
  }
}

export type CalendarProvider = "google" | "microsoft";

export type CalendarOAuthStatePayload = {
  userId: string;
  provider: CalendarProvider;
  exp: number;
};

export function signCalendarOAuthState(payload: Omit<CalendarOAuthStatePayload, "exp">): string {
  const secret = oauthSecret();
  if (!secret) throw new Error("CALENDAR_OAUTH_STATE_SECRET or CALENDAR_TOKEN_ENCRYPTION_KEY required");
  const body: CalendarOAuthStatePayload = {
    ...payload,
    exp: Date.now() + 12 * 60 * 1000,
  };
  const raw = JSON.stringify(body);
  const sig = createHmac("sha256", secret).update(raw).digest("hex");
  return Buffer.from(JSON.stringify({ raw, sig }), "utf8").toString("base64url");
}

export function verifyCalendarOAuthState(token: string): CalendarOAuthStatePayload | null {
  const secret = oauthSecret();
  if (!secret) return null;
  try {
    const parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as {
      raw: string;
      sig: string;
    };
    const expected = createHmac("sha256", secret).update(parsed.raw).digest("hex");
    const a = Buffer.from(parsed.sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const body = JSON.parse(parsed.raw) as CalendarOAuthStatePayload;
    if (typeof body.exp !== "number" || Date.now() > body.exp) return null;
    if (body.provider !== "google" && body.provider !== "microsoft") return null;
    if (typeof body.userId !== "string" || !body.userId) return null;
    return body;
  } catch {
    return null;
  }
}

export function buildGoogleCalendarAuthUrl(state: string): string {
  const id = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
  const redirect = `${appBaseUrl()}/api/calendar/google/callback`;
  if (!id) throw new Error("GOOGLE_CALENDAR_CLIENT_ID missing");
  const q = new URLSearchParams({
    client_id: id,
    redirect_uri: redirect,
    response_type: "code",
    scope: GCAL_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
}

export function buildMicrosoftCalendarAuthUrl(state: string): string {
  const id = process.env.MICROSOFT_CALENDAR_CLIENT_ID?.trim();
  const redirect = `${appBaseUrl()}/api/calendar/microsoft/callback`;
  if (!id) throw new Error("MICROSOFT_CALENDAR_CLIENT_ID missing");
  const q = new URLSearchParams({
    client_id: id,
    response_type: "code",
    redirect_uri: redirect,
    response_mode: "query",
    scope: MS_SCOPE,
    state,
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${q.toString()}`;
}

export async function exchangeGoogleAuthorizationCode(code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}> {
  const id = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
  const sec = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
  const redirect = `${appBaseUrl()}/api/calendar/google/callback`;
  if (!id || !sec) throw new Error("Google OAuth env incomplete");
  const body = new URLSearchParams({
    code,
    client_id: id,
    client_secret: sec,
    redirect_uri: redirect,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(typeof json.error === "string" ? json.error : "google_token_exchange_failed");
  }
  return json as { access_token: string; refresh_token?: string; expires_in: number };
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const id = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
  const sec = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
  if (!id || !sec) throw new Error("Google OAuth env incomplete");
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: id,
    client_secret: sec,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(typeof json.error === "string" ? json.error : "google_refresh_failed");
  }
  return json as { access_token: string; expires_in: number };
}

export async function exchangeMicrosoftAuthorizationCode(code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}> {
  const id = process.env.MICROSOFT_CALENDAR_CLIENT_ID?.trim();
  const sec = process.env.MICROSOFT_CALENDAR_CLIENT_SECRET?.trim();
  const redirect = `${appBaseUrl()}/api/calendar/microsoft/callback`;
  if (!id || !sec) throw new Error("Microsoft OAuth env incomplete");
  const body = new URLSearchParams({
    client_id: id,
    client_secret: sec,
    code,
    redirect_uri: redirect,
    grant_type: "authorization_code",
    scope: MS_SCOPE,
  });
  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(typeof json.error === "string" ? json.error : "microsoft_token_exchange_failed");
  }
  return json as { access_token: string; refresh_token?: string; expires_in: number };
}

export async function refreshMicrosoftAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const id = process.env.MICROSOFT_CALENDAR_CLIENT_ID?.trim();
  const sec = process.env.MICROSOFT_CALENDAR_CLIENT_SECRET?.trim();
  if (!id || !sec) throw new Error("Microsoft OAuth env incomplete");
  const body = new URLSearchParams({
    client_id: id,
    client_secret: sec,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: MS_SCOPE,
  });
  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(typeof json.error === "string" ? json.error : "microsoft_refresh_failed");
  }
  return json as { access_token: string; expires_in: number };
}

export async function createGoogleCalendarEvent(
  accessToken: string,
  event: {
    summary: string;
    description?: string;
    startIso: string;
    endIso: string;
    attendeeEmail?: string;
  },
): Promise<{ id: string; htmlLink?: string }> {
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.startIso, timeZone: "UTC" },
      end: { dateTime: event.endIso, timeZone: "UTC" },
      attendees: event.attendeeEmail
        ? [{ email: event.attendeeEmail, responseStatus: "needsAction" }]
        : undefined,
    }),
  });
  const json = (await res.json()) as { id?: string; htmlLink?: string; error?: { message?: string } };
  if (!res.ok) {
    throw new Error(json.error?.message ?? "google_create_event_failed");
  }
  return { id: json.id ?? "", htmlLink: json.htmlLink };
}

export async function createMicrosoftCalendarEvent(
  accessToken: string,
  event: {
    summary: string;
    description?: string;
    startIso: string;
    endIso: string;
    attendeeEmail?: string;
  },
): Promise<{ id: string; webLink?: string }> {
  const body: Record<string, unknown> = {
    subject: event.summary,
    body: { contentType: "text", content: event.description ?? "" },
    start: { dateTime: event.startIso, timeZone: "UTC" },
    end: { dateTime: event.endIso, timeZone: "UTC" },
  };
  if (event.attendeeEmail) {
    body.attendees = [
      {
        emailAddress: { address: event.attendeeEmail },
        type: "required",
      },
    ];
  }
  const res = await fetch("https://graph.microsoft.com/v1.0/me/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { id?: string; webLink?: string; error?: { message?: string } };
  if (!res.ok) {
    throw new Error(json.error?.message ?? "microsoft_create_event_failed");
  }
  return { id: json.id ?? "", webLink: json.webLink };
}

export async function saveUserCalendarRefreshToken(
  admin: SupabaseClient,
  userId: string,
  provider: CalendarProvider,
  refreshToken: string,
  emailHint?: string | null,
): Promise<void> {
  const enc = encryptRefreshToken(refreshToken);
  const { error } = await admin.from("user_calendar_connections").upsert(
    {
      user_id: userId,
      provider,
      refresh_token_enc: enc,
      email_hint: emailHint ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  );
  if (error) throw new Error(error.message);
}

export async function getValidAccessTokenForUser(
  supabase: SupabaseClient,
  userId: string,
  provider: CalendarProvider,
): Promise<{ accessToken: string; refreshEnc: string } | null> {
  const { data, error } = await supabase
    .from("user_calendar_connections")
    .select("refresh_token_enc")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (error || !data?.refresh_token_enc) return null;
  const refreshEnc = String(data.refresh_token_enc);
  const refresh = decryptRefreshToken(refreshEnc);
  if (provider === "google") {
    const t = await refreshGoogleAccessToken(refresh);
    return { accessToken: t.access_token, refreshEnc };
  }
  const t = await refreshMicrosoftAccessToken(refresh);
  return { accessToken: t.access_token, refreshEnc };
}
