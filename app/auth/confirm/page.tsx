"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase";

const DASHBOARD_PATH = "/";

export default function AuthConfirmPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(3);

  const goToDashboard = useCallback(() => {
    router.replace(DASHBOARD_PATH);
    router.refresh();
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      setHasSession(Boolean(session));
      setReady(true);
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasSession || !ready) return;

    const intervalId = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(intervalId);
          router.replace(DASHBOARD_PATH);
          router.refresh();
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [hasSession, ready, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md border-emerald-500/20 shadow-lg">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
            <CheckCircle2
              className="h-8 w-8 text-emerald-600 dark:text-emerald-400"
              aria-hidden
            />
          </div>
          <CardTitle className="text-2xl font-semibold tracking-tight">
            {hasSession ? "Email confirmed" : "Almost there"}
          </CardTitle>
          <CardDescription className="text-base">
            {hasSession
              ? "Your email has been confirmed successfully!"
              : ready
                ? "We couldn’t find an active session. Open the confirmation link from your email, or sign in if you already confirmed your account."
                : "Verifying your session…"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ready && hasSession && secondsLeft > 0 && (
            <p className="text-center text-sm text-muted-foreground">
              Redirecting to your dashboard in{" "}
              <span className="font-medium tabular-nums text-foreground">
                {secondsLeft}
              </span>{" "}
              {secondsLeft === 1 ? "second" : "seconds"}…
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            {hasSession ? (
              <Button className="w-full sm:w-auto" onClick={goToDashboard}>
                Go to Dashboard
              </Button>
            ) : ready ? (
              <>
                <Button asChild variant="default" className="w-full sm:w-auto">
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <Link href="/signup">Create account</Link>
                </Button>
              </>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
