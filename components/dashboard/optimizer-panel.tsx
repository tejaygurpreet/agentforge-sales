"use client";

import type { CampaignClientSnapshot } from "@/agents/types";
import { hydrateCampaignOptimizerFromSnapshot } from "@/lib/optimizer";
import type { DashboardOptimizerRow } from "@/types";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Cpu, PauseCircle, Sparkles, SplitSquareHorizontal } from "lucide-react";

function statusBadgeClass(status: string): string {
  switch (status) {
    case "healthy":
      return "border-primary/40 bg-primary/12 text-foreground dark:text-primary-foreground";
    case "at_risk":
    case "monitoring":
      return "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-50";
    case "auto_pause_suggested":
      return "border-red-500/40 bg-red-500/10 text-red-950 dark:text-red-50";
    case "variant_switch_suggested":
      return "border-primary/40 bg-primary/10 text-foreground dark:text-primary-foreground";
    default:
      return "border-border/60 bg-muted/30";
  }
}

function formatStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

type CampaignProps = {
  mode: "campaign";
  snapshot: CampaignClientSnapshot | null;
  replyInterest10: number | null;
};

type FeedProps = {
  mode: "feed";
  rows: DashboardOptimizerRow[];
};

export type OptimizerPanelProps = CampaignProps | FeedProps;

export function OptimizerPanel(props: OptimizerPanelProps) {
  if (props.mode === "feed") {
    const { rows } = props;
    if (!rows.length) {
      return (
        <Card className="rounded-xl border-border/70 bg-card/95 shadow-md ring-1 ring-border/10 dark:bg-card/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Cpu className="h-5 w-5 text-primary" aria-hidden />
              AI campaign optimizer
            </CardTitle>
            <CardDescription>
              Live recommendations from saved runs — run campaigns to populate this feed.
            </CardDescription>
          </CardHeader>
        </Card>
      );
    }
    return (
      <Card className="rounded-xl border-border/70 bg-card/95 shadow-md ring-1 ring-border/10 dark:bg-card/90">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
            <Cpu className="h-5 w-5 text-primary" aria-hidden />
            AI campaign optimizer
            <Badge variant="outline" className="text-[10px] uppercase tracking-widest">
              Live
            </Badge>
          </CardTitle>
          <CardDescription>
            Sequences ranked by composite health (reply interest, qualification, meeting hooks).
            Auto-pause is suggested when signals collapse — approvals stay manual.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-3">
            {rows.map((row) => (
              <li
                key={row.thread_id}
                className="rounded-lg border border-border/60 bg-muted/10 px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{row.lead_name}</span>
                  <span className="text-xs text-muted-foreground">{row.company}</span>
                  <Badge
                    variant="outline"
                    className={cn("text-[10px] capitalize", statusBadgeClass(row.optimization_status))}
                  >
                    {formatStatusLabel(row.optimization_status)}
                  </Badge>
                  {row.auto_pause_suggested ? (
                    <Badge variant="secondary" className="gap-1 text-[10px]">
                      <PauseCircle className="h-3 w-3" aria-hidden />
                      Pause suggested
                    </Badge>
                  ) : null}
                  {row.suggested_variant ? (
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      <SplitSquareHorizontal className="h-3 w-3" aria-hidden />
                      Try variant {row.suggested_variant}
                    </Badge>
                  ) : null}
                  {row.composite_health != null ? (
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                      Health {row.composite_health}/100
                    </span>
                  ) : null}
                </div>
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted-foreground">
                  {row.top_recommendations.map((r, i) => (
                    <li key={`${row.thread_id}-rec-${i}`}>{r}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    );
  }

  const { snapshot, replyInterest10 } = props;
  if (!snapshot) return null;
  const opt = hydrateCampaignOptimizerFromSnapshot(snapshot, {
    replyInterest0to10: replyInterest10,
    abVariant: snapshot.ab_variant ?? null,
  });

  return (
    <Card className="rounded-xl border-border/70 bg-card/95 shadow-md ring-1 ring-border/10 dark:bg-card/90">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden />
          AI campaign optimizer
          <Badge
            variant="outline"
            className={cn("text-[10px] capitalize", statusBadgeClass(opt.status))}
          >
            {formatStatusLabel(opt.status)}
          </Badge>
        </CardTitle>
        <CardDescription>
          Heuristic performance blend — use with follow-up approvals (nothing auto-sends).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {opt.auto_pause_follow_ups ? (
            <Badge variant="secondary" className="gap-1">
              <PauseCircle className="h-3.5 w-3.5" aria-hidden />
              Auto-pause follow-ups suggested
            </Badge>
          ) : (
            <Badge variant="outline" className="text-primary dark:text-primary">
              Sequences active — monitor signals
            </Badge>
          )}
          {opt.suggested_ab_variant ? (
            <Badge variant="outline" className="gap-1">
              <SplitSquareHorizontal className="h-3.5 w-3.5" aria-hidden />
              Try variant {opt.suggested_ab_variant}
            </Badge>
          ) : null}
        </div>
        <div className="grid gap-2 rounded-lg border border-border/50 bg-muted/15 px-3 py-2 text-xs text-muted-foreground sm:grid-cols-2">
          <p>
            <span className="font-semibold text-foreground">Composite health: </span>
            {opt.metrics.composite_health}/100
          </p>
          <p>
            <span className="font-semibold text-foreground">Qualification: </span>
            {opt.metrics.qualification_score ?? "—"}
          </p>
          <p>
            <span className="font-semibold text-foreground">Reply interest: </span>
            {opt.metrics.interest_score_0_to_10 != null
              ? `${opt.metrics.interest_score_0_to_10}/10`
              : "—"}
          </p>
          <p>
            <span className="font-semibold text-foreground">Meeting signal: </span>
            {Math.round(opt.metrics.meeting_booking_signal * 100)}%
          </p>
        </div>
        <ul className="list-inside list-disc space-y-1.5 text-sm leading-relaxed text-muted-foreground">
          {opt.recommendations.map((r, i) => (
            <li key={`opt-rec-${i}`}>{r}</li>
          ))}
        </ul>
        {opt.sequence_notes.length > 0 ? (
          <p className="text-xs text-muted-foreground">{opt.sequence_notes.join(" ")}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
