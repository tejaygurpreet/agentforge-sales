import "server-only";

import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGroq } from "@langchain/groq";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { getServerEnv } from "@/lib/env";

const LLM_MISSING_MESSAGE =
  "Missing GROQ_API_KEY – please add it to .env.local";

/** Default primary when `GROQ_MODEL` is unset — Groq flagship for structured JSON (Prompt 19). */
export const GROQ_DEFAULT_PRIMARY_MODEL = "llama-3.3-70b-versatile";

/**
 * Lighter Groq models when the primary hits rate limits (Prompt 18).
 * Tried in order after primary retries are exhausted.
 */
export const GROQ_LIGHT_FALLBACK_MODEL_IDS: readonly string[] = [
  "llama-3.1-8b-instant",
  "mixtral-8x7b-32768",
];

/** Wait between Groq rate-limit retries (ms). */
export const GROQ_RATE_LIMIT_RETRY_DELAY_MS = 5_000;

/** Primary: one retry after delay, then switch to lighter models (faster recovery). */
const PRIMARY_RATE_LIMIT_ATTEMPTS = 2;
const FALLBACK_RATE_LIMIT_ATTEMPTS = 2;

export type GroqInvokeMeta = {
  /** Groq model id or Anthropic model name used for the successful call. */
  modelUsed: string;
  /** True when the successful call used a lighter Groq model after primary hit rate limits. */
  usedLighterModelAfterRateLimit: boolean;
};

/**
 * Ensures at least one LLM key is present before invoking agents.
 */
export function assertLlmConfigured(): void {
  const env = getServerEnv();
  if (!env.GROQ_API_KEY?.trim() && !env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error(LLM_MISSING_MESSAGE);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isGroqRateLimitError(e: unknown): boolean {
  const collect = (v: unknown): string => {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (v instanceof Error) return `${v.message} ${v.name} ${collect((v as Error & { cause?: unknown }).cause)}`;
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      return [
        o.message,
        o.error,
        (o.error as { message?: string })?.message,
        o.status,
        o.statusCode,
        o.lc_error_code,
      ]
        .map((x) => (typeof x === "string" || typeof x === "number" ? String(x) : ""))
        .join(" ");
    }
    return String(v);
  };
  const msg = collect(e);
  if (
    /rate\s*limit|429|too many requests|tokens per minute|tpm|requests per minute|rpm|capacity|throttl/i.test(
      msg,
    )
  ) {
    return true;
  }
  const rec = e as {
    status?: number;
    statusCode?: number;
    lc_error_code?: string;
    response?: { status?: number };
  };
  if (rec?.status === 429 || rec?.statusCode === 429 || rec?.response?.status === 429) {
    return true;
  }
  if (rec?.lc_error_code === "MODEL_RATE_LIMIT") return true;
  return false;
}

function createGroqModel(apiKey: string, modelId: string, temperature: number): ChatGroq {
  return new ChatGroq({
    apiKey,
    model: modelId,
    temperature,
  });
}

/**
 * Groq first (@langchain/groq: llama-3.3-70b-versatile or GROQ_MODEL e.g. mixtral-8x7b-32768).
 * Anthropic only if Groq is not configured.
 */
export function createSalesLlm(temperature: number): BaseChatModel {
  assertLlmConfigured();
  const env = getServerEnv();
  const groqModel =
    env.GROQ_MODEL?.trim() || GROQ_DEFAULT_PRIMARY_MODEL;

  if (env.GROQ_API_KEY?.trim()) {
    return createGroqModel(env.GROQ_API_KEY, groqModel, temperature);
  }

  if (env.ANTHROPIC_API_KEY?.trim()) {
    console.warn(
      "[AgentForge] GROQ_API_KEY not set — using Anthropic fallback (claude-3-5-sonnet).",
    );
    return new ChatAnthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      model: "claude-3-5-sonnet-20241022",
      temperature,
    });
  }

  throw new Error(LLM_MISSING_MESSAGE);
}

/**
 * Groq: on rate limit, wait 5s and retry on the same model (limited attempts), then try lighter models.
 * Logs each rate-limit event, wait, model switch, and successful `modelUsed`.
 * Anthropic: single invoke, no rate-limit chain.
 */
export async function invokeWithGroqRateLimitResilience<T>(
  label: string,
  temperature: number,
  run: (model: BaseChatModel) => Promise<T>,
): Promise<{ value: T; meta: GroqInvokeMeta }> {
  assertLlmConfigured();
  const env = getServerEnv();

  if (!env.GROQ_API_KEY?.trim()) {
    const model = createSalesLlm(temperature);
    const value = await run(model);
    const modelUsed =
      env.ANTHROPIC_API_KEY?.trim()
        ? "claude-3-5-sonnet-20241022"
        : GROQ_DEFAULT_PRIMARY_MODEL;
    console.log(`[AgentForge] ${label}: completed model=${modelUsed} (non-Groq or primary path)`);
    return {
      value,
      meta: { modelUsed, usedLighterModelAfterRateLimit: false },
    };
  }

  const apiKey = env.GROQ_API_KEY;
  const primaryId = env.GROQ_MODEL?.trim() || GROQ_DEFAULT_PRIMARY_MODEL;
  const fallbackIds = GROQ_LIGHT_FALLBACK_MODEL_IDS.filter((id) => id !== primaryId);
  const modelChain = [primaryId, ...fallbackIds];

  let lastError: unknown;

  for (const modelId of modelChain) {
    const isPrimary = modelId === primaryId;
    const maxAttempts = isPrimary
      ? PRIMARY_RATE_LIMIT_ATTEMPTS
      : FALLBACK_RATE_LIMIT_ATTEMPTS;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const groq = createGroqModel(apiKey, modelId, temperature);
        if (!isPrimary) {
          console.warn(
            `[AgentForge] ${label}: switching to lighter Groq model "${modelId}" (attempt ${attempt}/${maxAttempts}) — primary rate-limited or exhausted`,
          );
        }
        const value = await run(groq);
        const usedLighterModelAfterRateLimit = modelId !== primaryId;
        console.log(
          `[AgentForge] ${label}: OK model="${modelId}" rate_limit_fallback=${usedLighterModelAfterRateLimit}`,
        );
        return {
          value,
          meta: { modelUsed: modelId, usedLighterModelAfterRateLimit },
        };
      } catch (e) {
        lastError = e;
        if (isGroqRateLimitError(e)) {
          const hint = e instanceof Error ? e.message.slice(0, 180) : String(e);
          console.warn(
            `[AgentForge] ${label}: RATE_LIMIT model="${modelId}" attempt ${attempt}/${maxAttempts} — ${hint}`,
          );
          if (attempt < maxAttempts) {
            console.warn(
              `[AgentForge] ${label}: backoff ${GROQ_RATE_LIMIT_RETRY_DELAY_MS}ms then retry`,
            );
            await sleep(GROQ_RATE_LIMIT_RETRY_DELAY_MS);
            continue;
          }
          console.warn(
            `[AgentForge] ${label}: exhausted model="${modelId}" — next model in chain`,
          );
          break;
        }
        console.error(`[AgentForge] ${label}: non-rate-limit error on "${modelId}"`, e);
        throw e;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? "Groq invoke failed"));
}
