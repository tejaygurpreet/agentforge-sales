import { z } from "zod";

/**
 * Treats empty string as "unset" so `.env` lines like `ANTHROPIC_API_KEY=` do not
 * trigger Zod `too_small` while the key is optional.
 */
const optionalNonEmpty = z
  .union([z.string().min(1), z.literal("")])
  .optional()
  .transform((v) => (v === undefined || v === "" ? undefined : v));

const serverSchema = z.object({
  /** Primary LLM for agents (recommended). */
  GROQ_API_KEY: optionalNonEmpty,
  /** e.g. llama-3.3-70b-versatile, mixtral-8x7b-32768 */
  GROQ_MODEL: optionalNonEmpty,
  /** Optional fallback when GROQ_API_KEY is not set. */
  ANTHROPIC_API_KEY: optionalNonEmpty,
  SUPABASE_SERVICE_ROLE_KEY: optionalNonEmpty,
  RESEND_API_KEY: optionalNonEmpty,
  RESEND_FROM_EMAIL: optionalNonEmpty,
  WEBHOOK_SECRET: z.string().optional(),
  /** Prompt 45 — Tavily search API for live web research (optional). */
  TAVILY_API_KEY: optionalNonEmpty,
  /** Prompt 45 — Serper.dev Google search (optional; used if Tavily empty / unset). */
  SERPER_API_KEY: optionalNonEmpty,
  /** Browserless REST base, e.g. https://production-sfo.browserless.io */
  BROWSERLESS_BASE_URL: optionalNonEmpty,
  /** Browserless token (query param). */
  BROWSERLESS_TOKEN: optionalNonEmpty,
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;

function parseServerEnv(): ServerEnv {
  return serverSchema.parse({
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    GROQ_MODEL: process.env.GROQ_MODEL,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
    TAVILY_API_KEY: process.env.TAVILY_API_KEY,
    SERPER_API_KEY: process.env.SERPER_API_KEY,
    BROWSERLESS_BASE_URL: process.env.BROWSERLESS_BASE_URL,
    BROWSERLESS_TOKEN: process.env.BROWSERLESS_TOKEN,
  });
}

function parseClientEnv(): ClientEnv {
  return clientSchema.parse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

let cachedServer: ServerEnv | null = null;
let cachedClient: ClientEnv | null = null;
let resendMissingLogged = false;

export function getServerEnv(): ServerEnv {
  if (!cachedServer) cachedServer = parseServerEnv();
  return cachedServer;
}

export function getClientEnv(): ClientEnv {
  if (!cachedClient) cachedClient = parseClientEnv();
  return cachedClient;
}

/** True when at least one LLM provider is configured (Groq preferred). */
export function hasLlmProviderConfigured(): boolean {
  const e = getServerEnv();
  return Boolean(e.GROQ_API_KEY?.trim()) || Boolean(e.ANTHROPIC_API_KEY?.trim());
}

/**
 * Logs once per process if Resend is not configured (email disabled).
 */
export function warnIfResendNotConfigured(): void {
  const e = getServerEnv();
  if (e.RESEND_API_KEY?.trim()) return;
  if (resendMissingLogged) return;
  resendMissingLogged = true;
  console.warn(
    "[AgentForge] RESEND_API_KEY is not set — outbound email is disabled. Add it to .env.local to send real messages.",
  );
}

/** Non-secret hints for the dashboard (server-only). */
export function getDashboardEnvWarnings(): string[] {
  const e = getServerEnv();
  const out: string[] = [];
  if (!e.GROQ_API_KEY?.trim() && !e.ANTHROPIC_API_KEY?.trim()) {
    out.push(
      "Missing GROQ_API_KEY – please add it to .env.local (or set ANTHROPIC_API_KEY as fallback).",
    );
  } else if (!e.GROQ_API_KEY?.trim() && e.ANTHROPIC_API_KEY?.trim()) {
    out.push(
      "GROQ_API_KEY is not set — agents are using the Anthropic fallback (slower / costlier).",
    );
  }
  if (!e.RESEND_API_KEY?.trim()) {
    out.push(
      "RESEND_API_KEY is not set — campaign emails will not be delivered (drafts still appear in results).",
    );
  }
  if (
    !e.TAVILY_API_KEY?.trim() &&
    !e.SERPER_API_KEY?.trim() &&
    !e.BROWSERLESS_TOKEN?.trim()
  ) {
    out.push(
      "Optional: TAVILY_API_KEY, SERPER_API_KEY, or Browserless (BROWSERLESS_BASE_URL + BROWSERLESS_TOKEN) for live web research — see .env.example.",
    );
  }
  return out;
}
