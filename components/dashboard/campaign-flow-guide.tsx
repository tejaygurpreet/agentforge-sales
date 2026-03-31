"use client";

import { Mic, Play, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Prompt 104 — Non-interactive guided flow strip for the primary campaign path (lead → voice → launch).
 */
export function CampaignFlowGuideStrip({ className }: { className?: string }) {
  const steps = [
    {
      step: 1,
      title: "Lead",
      hint: "Who you’re reaching",
      icon: UserRound,
    },
    {
      step: 2,
      title: "Voice",
      hint: "Preset or custom SDR tone",
      icon: Mic,
    },
    {
      step: 3,
      title: "Launch",
      hint: "Optional intel, then start",
      icon: Play,
    },
  ] as const;

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/45 bg-gradient-to-br from-card via-card to-muted/25 p-4 shadow-soft ring-1 ring-border/25 sm:p-5",
        className,
      )}
      role="region"
      aria-label="Campaign creation steps"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Guided path
      </p>
      <ol className="mt-4 grid gap-4 sm:grid-cols-3">
        {steps.map((s) => (
          <li key={s.step} className="flex gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/[0.07] text-primary shadow-sm">
              <s.icon className="h-5 w-5" strokeWidth={2} aria-hidden />
            </div>
            <div className="min-w-0 pt-0.5">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <span className="tabular-nums text-primary/80">{s.step}.</span> {s.title}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{s.hint}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
