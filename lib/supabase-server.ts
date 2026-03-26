import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getClientEnv, getServerEnv } from "@/lib/env";

/**
 * Server Actions / Route Handlers: cookie writes are allowed — session cookies must persist.
 */
export async function createServerSupabaseActionClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  type CookieSetOptions = NonNullable<Parameters<typeof cookieStore.set>[2]>;
  const env = getClientEnv();
  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieSetOptions;
          }[],
        ) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );
}

export async function createServerSupabaseClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  type CookieSetOptions = NonNullable<Parameters<typeof cookieStore.set>[2]>;
  const env = getClientEnv();
  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieSetOptions;
          }[],
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            /* Server Component — read-only cookie context */
          }
        },
      },
    },
  );
}

export function createServiceRoleSupabase(): SupabaseClient {
  const env = getClientEnv();
  const { SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required (agents, checkpoints, server-side signup).",
    );
  }
  return createSupabaseJsClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export function getServiceRoleSupabaseOrNull(): SupabaseClient | null {
  try {
    return createServiceRoleSupabase();
  } catch {
    return null;
  }
}
