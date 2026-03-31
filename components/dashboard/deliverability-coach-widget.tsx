"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { dashboardOutlineActionClass } from "@/lib/dashboard-action-classes";
import { cn } from "@/lib/utils";
import type { DeliverabilitySuitePayload } from "@/types";
import { Gauge, Sparkles } from "lucide-react";

type Props = {
  suite: DeliverabilitySuitePayload | null;
  onOpenDeliverability: () => void;
};

function MiniBar({ pct, label }: { pct: number; label: string }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="min-w-[120px] space-y-1">
      <div className="flex justify-between text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums text-foreground">{p}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500/90 to-sky-500/90 transition-all duration-500"
          style={{ width: `${p}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Prompt 99 — compact Workspace summary: warm-up progress + deliverability health + coach CTA.
 */
export function DeliverabilityCoachWidget({ suite, onOpenDeliverability }: Props) {
  const coach = suite?.coach;
  const health = coach?.healthScore ?? 0;
  const place = coach?.placementPrediction ?? 0;
  const progress = coach?.warmupProgressPct ?? 0;

  return (
    <Card className="overflow-hidden rounded-2xl border-border/80 bg-gradient-to-br from-primary/[0.04] via-card to-card shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" aria-hidden />
              Deliverability coach
            </CardTitle>
            <CardDescription>
              Daily warm-up target, inbox placement outlook, and AI tips — open Deliverability for controls.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("shrink-0", dashboardOutlineActionClass)}
            onClick={onOpenDeliverability}
          >
            Open tab
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        {suite && coach ? (
          <>
            <div className="flex flex-col gap-4 sm:min-w-[240px]">
              <MiniBar pct={health} label="Health score" />
              <MiniBar pct={progress} label="Warm-up" />
              <div className="flex flex-col gap-1 text-center sm:text-left">
                <p className="text-xs font-medium text-muted-foreground">Inbox placement</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {place}
                  <span className="text-sm font-normal text-muted-foreground">/100</span>
                </p>
                <p className="text-sm font-medium text-foreground">{coach.inboxPlacementLabel}</p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  Next suggested window:{" "}
                  {suite.nextSuggestedSendAt
                    ? new Date(suite.nextSuggestedSendAt).toLocaleString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </p>
              </div>
            </div>
            <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-4 sm:max-w-md">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Gauge className="h-3.5 w-3.5" aria-hidden />
                Coach tip
              </p>
              <p className="text-sm leading-relaxed">{coach.quickTips[0] ?? "Keep volume steady and subjects human."}</p>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Sign in and load the workspace to see warm-up progress and health scores.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
