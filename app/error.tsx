"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Prompt 113 — global error boundary: calm copy, clear recovery (no feature removal).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 py-12">
      <div
        className="w-full max-w-md animate-in fade-in zoom-in-95 duration-500 motion-safe:animate-content-settle"
        role="alert"
      >
        <div className="rounded-2xl border border-border/55 bg-card/95 p-8 shadow-lift ring-1 ring-black/[0.04] backdrop-blur-sm">
          <div className="mb-6 flex justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-destructive/20 bg-gradient-to-br from-destructive/[0.08] to-muted/40 text-destructive shadow-sm ring-1 ring-destructive/10">
              <AlertCircle className="h-7 w-7" aria-hidden />
            </span>
          </div>
          <h1 className="text-center text-xl font-semibold tracking-tight text-foreground">
            Something didn&apos;t load right
          </h1>
          <p className="mt-3 text-center text-sm leading-relaxed text-muted-foreground">
            A quick refresh usually fixes this. If it keeps happening, try again in a moment or head back
            home — your data is safe.
          </p>
          {error.digest ? (
            <p className="mt-4 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-center font-mono text-[11px] text-muted-foreground">
              Ref: {error.digest}
            </p>
          ) : null}
          <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button type="button" onClick={() => reset()} className="gap-2 rounded-xl shadow-soft">
              <RefreshCw className="h-4 w-4" aria-hidden />
              Try again
            </Button>
            <Button type="button" variant="outline" asChild className="rounded-xl border-border/60">
              <Link href="/">Go to dashboard</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
