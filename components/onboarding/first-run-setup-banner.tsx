"use client";

import { Button } from "@/components/ui/button";
import { ONBOARDING_DISMISS_STORAGE_KEY } from "@/lib/onboarding-storage";
import { cn } from "@/lib/utils";
import { ArrowRight, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export function FirstRunSetupBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(ONBOARDING_DISMISS_STORAGE_KEY)) {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(ONBOARDING_DISMISS_STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="First-time setup"
      className={cn(
        "relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/[0.07] via-card to-violet-500/[0.06] p-5 shadow-soft ring-1 ring-primary/15",
        "animate-in fade-in slide-in-from-top-2 duration-500",
      )}
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/[0.08] blur-2xl" aria-hidden />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-card shadow-sm">
            <Sparkles className="h-6 w-6 text-primary" aria-hidden />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-foreground">New here? Take the two-minute setup tour</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              We&apos;ll point you to brand settings, HubSpot, and your first campaign — then you&apos;re
              ready to run pipeline.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <Button type="button" className="gap-2 rounded-xl shadow-sm" asChild>
            <Link href="/onboarding">
              Open setup guide
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-xl text-muted-foreground hover:text-foreground"
            onClick={dismiss}
            aria-label="Dismiss setup reminder"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
