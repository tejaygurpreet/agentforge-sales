"use client";

import type { DealCloseQualificationRow } from "@/types";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Gauge, ListChecks, Sparkles } from "lucide-react";

function confidenceBadgeClass(c: string): string {
  switch (c) {
    case "high":
      return "border-primary/45 bg-primary/20 text-foreground dark:text-primary-foreground";
    case "medium":
      return "border-amber-500/45 bg-amber-500/18 text-amber-950 dark:text-amber-50";
    default:
      return "border-muted-foreground/35 bg-muted/40 text-muted-foreground";
  }
}

type Props = {
  rows: DealCloseQualificationRow[];
  avgCloseProbability: number | null;
};

export function DealClosePanel({ rows, avgCloseProbability }: Props) {
  return (
    <Card className="premium-card-interactive rounded-2xl border-border/80 bg-card/95 shadow-lg ring-1 ring-border/20 dark:ring-white/[0.06]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Gauge className="h-5 w-5 text-primary" aria-hidden />
          Deal close probability
        </CardTitle>
        <CardDescription>
          Blends ICP fit, lead priority dimensions, qualification depth, forecast win %, reply interest,
          and objection load. Confidence rises when enrichment, replies, and qualification JSON are
          present.
        </CardDescription>
        {avgCloseProbability != null ? (
          <p className="mt-3 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm font-semibold tabular-nums text-foreground">
            <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            Workspace average close estimate: {avgCloseProbability}%
          </p>
        ) : null}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Complete campaigns to populate deal-level close estimates.
          </p>
        ) : (
          <ul className="max-h-[min(420px,55vh)] space-y-3 overflow-y-auto pr-1">
            {rows.slice(0, 14).map((row) => (
              <li
                key={row.thread_id}
                className="rounded-xl border border-border/60 bg-muted/15 px-3 py-3 dark:bg-muted/10"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{row.lead_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{row.company}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className="font-mono text-[11px] tabular-nums"
                      title="Estimated close probability"
                    >
                      {row.close_probability}%
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] uppercase tracking-wide",
                        confidenceBadgeClass(row.confidence),
                      )}
                    >
                      {row.confidence} conf
                    </Badge>
                  </div>
                </div>
                <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                  {row.factors.slice(0, 4).map((f) => (
                    <li key={f.key} className="flex gap-2">
                      <span
                        className={cn(
                          "shrink-0 font-mono text-[10px]",
                          f.impact >= 0 ? "text-primary dark:text-primary" : "text-amber-700 dark:text-amber-400",
                        )}
                      >
                        {f.impact >= 0 ? "+" : ""}
                        {f.impact}
                      </span>
                      <span>
                        <span className="font-medium text-foreground/90">{f.label}:</span> {f.detail}
                      </span>
                    </li>
                  ))}
                </ul>
                {row.suggested_actions.length > 0 ? (
                  <div className="mt-3 border-t border-border/40 pt-2">
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <ListChecks className="h-3.5 w-3.5" aria-hidden />
                      Lift win rate
                    </p>
                    <ul className="list-inside list-disc space-y-1 text-xs leading-relaxed text-foreground/85">
                      {row.suggested_actions.slice(0, 3).map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
