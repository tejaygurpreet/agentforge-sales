"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LeadPriorityLeaderboardRow, LeadPriorityTier } from "@/types";
import { ListOrdered, Sparkles } from "lucide-react";

function tierBadgeClass(tier: LeadPriorityTier): string {
  switch (tier) {
    case "critical":
      return "border-rose-500/50 bg-rose-500/15 text-rose-950 dark:border-rose-400/45 dark:bg-rose-500/20 dark:text-rose-50";
    case "high":
      return "border-amber-500/50 bg-amber-500/15 text-amber-950 dark:border-amber-400/45 dark:bg-amber-500/18 dark:text-amber-50";
    case "medium":
      return "border-sky-500/45 bg-sky-500/12 text-sky-950 dark:border-sky-400/45 dark:bg-sky-500/16 dark:text-sky-50";
    default:
      return "border-muted-foreground/35 bg-muted/40 text-muted-foreground";
  }
}

type Props = {
  rows: LeadPriorityLeaderboardRow[];
  summary: string | null;
};

export function LeadPrioritySection({ rows, summary }: Props) {
  if (!rows.length) {
    return (
      <Card className="premium-card-interactive rounded-2xl border-border/80 bg-card/95 shadow-lg ring-1 ring-border/20 dark:ring-white/[0.06]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ListOrdered className="h-5 w-5 text-primary" aria-hidden />
            Lead priority
          </CardTitle>
          <CardDescription>
            Run campaigns to populate ICP, intent, reply, and deal-upside scores. Reply analyses and
            enrichment sharpen the queue automatically.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="premium-card-interactive rounded-2xl border-border/80 bg-card/95 shadow-lg ring-1 ring-border/20 dark:ring-white/[0.06]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ListOrdered className="h-5 w-5 text-primary" aria-hidden />
          Lead priority leaderboard
        </CardTitle>
        <CardDescription>
          Auto-scored from saved campaigns (ICP fit, intent signals, reply probability, deal upside).
          Color bands = contact order hint — you still choose when to reach out.
        </CardDescription>
        {summary ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm leading-relaxed text-foreground/90">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span>{summary.replace(/\*\*(.*?)\*\*/g, "$1")}</span>
          </p>
        ) : null}
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {rows.slice(0, 15).map((row, idx) => (
            <li
              key={row.thread_id}
              className="rounded-xl border border-border/60 bg-muted/15 px-4 py-3 dark:bg-muted/10"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">#{idx + 1}</span>
                    <span className="truncate font-semibold text-foreground">{row.lead_name}</span>
                    <Badge
                      variant="outline"
                      className={cn("text-[10px] font-bold uppercase", tierBadgeClass(row.priority_tier))}
                    >
                      {row.tier_label}
                    </Badge>
                    <span className="tabular-nums text-sm font-bold text-foreground">
                      {row.composite_score}
                    </span>
                    <span className="text-xs text-muted-foreground">/ 100</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {row.company} · {row.email}
                  </p>
                </div>
                <div className="text-right text-[10px] text-muted-foreground">
                  {row.completed_at
                    ? new Date(row.completed_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })
                    : "—"}
                </div>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-4">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">ICP</dt>
                  <dd className="tabular-nums font-medium">{row.dimensions.icp_fit}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Intent</dt>
                  <dd className="tabular-nums font-medium">{row.dimensions.intent_signals}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Reply</dt>
                  <dd className="tabular-nums font-medium">{row.dimensions.reply_probability}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Deal</dt>
                  <dd className="tabular-nums font-medium">{row.dimensions.deal_value_potential}</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {row.ai_recommendation.replace(/\*\*(.*?)\*\*/g, "$1")}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
