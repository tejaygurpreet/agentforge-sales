"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase";

const DEFAULT_CONFIRM = "/auth/confirm";

/** Prevents duplicate PKCE exchange when React Strict Mode runs effects twice in dev. */
let authCallbackStarted = false;

/** Allow only same-origin relative paths (no open redirects). */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return DEFAULT_CONFIRM;
  }
  return raw;
}

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    if (authCallbackStarted) return;
    authCallbackStarted = true;

    let cancelled = false;

    async function run() {
      const supabase = createClient();

      const search = window.location.search;
      const params = new URLSearchParams(search);
      const next = safeNext(params.get("next"));

      const oauthError = params.get("error");
      const oauthDescription = params.get("error_description");
      if (oauthError) {
        const msg = oauthDescription || oauthError;
        router.replace(`/login?error=${encodeURIComponent(msg)}`);
        return;
      }

      const code = params.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (error) {
          router.replace(
            `/login?error=${encodeURIComponent(error.message)}`,
          );
          return;
        }
        router.replace(next);
        router.refresh();
        return;
      }

      const hash = window.location.hash?.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
      if (hash) {
        const hashParams = new URLSearchParams(hash);
        const access_token = hashParams.get("access_token");
        const refresh_token = hashParams.get("refresh_token");
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (cancelled) return;
          if (error) {
            router.replace(
              `/login?error=${encodeURIComponent(error.message)}`,
            );
            return;
          }
          window.history.replaceState(
            null,
            "",
            `${window.location.pathname}${window.location.search}`,
          );
          router.replace(next);
          router.refresh();
          return;
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) {
        router.replace(next);
        router.refresh();
        return;
      }

      router.replace("/login?error=auth");
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <p className="text-sm text-muted-foreground">Signing you in…</p>
    </div>
  );
}
