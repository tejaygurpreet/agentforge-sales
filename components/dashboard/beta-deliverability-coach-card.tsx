"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { dashboardOutlineActionClass } from "@/lib/dashboard-action-classes";
import { cn } from "@/lib/utils";
import type { DeliverabilitySuitePayload } from "@/types";
import { Gauge, HeartPulse, Sparkles } from "lucide-react";
import Link from "next/link";

type Props = {
  suite: DeliverabilitySuitePayload | null;
};

function pctLabel(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Math.round(Math.max(0, Math.min(100, n)))}`;
}

/**
 * Prompt 136 — Compact deliverability summary + “Open Coach” dialog (tips).
 */
export function BetaDeliverabilityCoachCard({ suite }: Props) {
  const coach = suite?.coach;
  const health = coach?.healthScore ?? null;
  const warmupPct = coach?.warmupProgressPct ?? null;
  const tips =
    coach?.quickTips?.length ? coach.quickTips : ["Keep sends steady and subjects human-first."];
  const warmupLabel = suite?.warmupEnabled ? "Warm-up on" : "Warm-up off";
  const sent7d = suite?.emailsSentLast7Days ?? 0;
  const hasCoach = Boolean(suite && coach);

  return (
    <div
      className={cn(
        "premium-card-spec flex flex-col gap-6 rounded-[var(--card-radius)] border border-border/40 bg-[#FAF7F2] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8",
        "shadow-[var(--card-shadow-spec)] transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-glow",
      )}
    >
      <div className="min-w-0 space-y-3">
        <div className="flex items-center gap-2 text-sage">
          <Sparkles className="h-5 w-5 shrink-0" aria-hidden />
          <h2 className="text-lg font-bold tracking-tight text-foreground">Deliverability coach</h2>
        </div>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          Health score and warm-up status at a glance. Open the coach for actionable tips — reply analysis
          lives on <Link className="font-medium text-sage underline-offset-4 hover:underline" href="/replies">Replies</Link>.
        </p>
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2 rounded-[var(--card-radius)] border border-sage/25 bg-white/70 px-3 py-2">
            <HeartPulse className="h-4 w-4 text-coral" aria-hidden />
            <span className="text-muted-foreground">Health</span>
            <span className="font-semibold tabular-nums text-foreground">
              {hasCoach ? `${pctLabel(health)}/100` : "—"}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-[var(--card-radius)] border border-terracotta/25 bg-white/70 px-3 py-2">
            <Gauge className="h-4 w-4 text-terracotta" aria-hidden />
            <span className="text-muted-foreground">Warm-up</span>
            <span className="font-semibold text-foreground">{suite ? warmupLabel : "—"}</span>
            <span className="tabular-nums text-muted-foreground">
              {suite ? (
                <>
                  {" "}
                  · {hasCoach ? `${pctLabel(warmupPct)}%` : "—"} · {sent7d} sent (7d)
                </>
              ) : (
                " · run a campaign to populate"
              )}
            </span>
          </div>
        </div>
      </div>

      <Dialog>
        <DialogTrigger asChild>
          <Button
            type="button"
            size="lg"
            className={cn("h-12 shrink-0 rounded-[var(--card-radius)] px-8 font-semibold shadow-soft", dashboardOutlineActionClass)}
          >
            Open Coach
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg border-border/60 sm:rounded-[var(--card-radius)]">
          <DialogHeader>
            <DialogTitle>Deliverability tips</DialogTitle>
            <DialogDescription>
              Quick wins from your workspace signals. Tune volume and content before scaling sends.
            </DialogDescription>
          </DialogHeader>
          <ul className="list-inside list-disc space-y-2 text-sm leading-relaxed text-foreground">
            {tips.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Full warm-up logs and DNS checks live under{" "}
            <Link href="/setup" className="font-medium text-sage underline-offset-4 hover:underline">
              Setup
            </Link>
            .
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
