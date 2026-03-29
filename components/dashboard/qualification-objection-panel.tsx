"use client";

import type {
  QualificationInsightRow,
  ReplyObjectionCardRow,
} from "@/types";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MessageCircleWarning, ShieldQuestion, Sparkles, Target } from "lucide-react";

function patternLabel(id: string): string {
  return id.replace(/_/g, " ");
}

type Props = {
  qualificationRows: QualificationInsightRow[];
  objectionCards: ReplyObjectionCardRow[];
};

export function QualificationObjectionPanel({
  qualificationRows,
  objectionCards,
}: Props) {
  const hasQual = qualificationRows.length > 0;
  const hasObj = objectionCards.length > 0;
  if (!hasQual && !hasObj) {
    return (
      <Card className="premium-card-interactive rounded-2xl border-border/80 bg-card/95 shadow-lg ring-1 ring-border/20 dark:ring-white/[0.06]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Target className="h-5 w-5 text-primary" aria-hidden />
            Qualification and objections
          </CardTitle>
          <CardDescription>
            Completed campaigns surface a live qualification score (refined when reply analyses exist)
            and recent replies show suggested responses for common objections.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Run a campaign through qualification and analyze a prospect reply to populate this panel.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="premium-card-interactive rounded-2xl border-border/80 bg-card/95 shadow-lg ring-1 ring-border/20 dark:ring-white/[0.06]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Target className="h-5 w-5 text-primary" aria-hidden />
            Qualification scores
          </CardTitle>
          <CardDescription>
            Base score from the qualification agent; refined score nudges with latest reply interest
            when a thread match exists. Next action comes from qualification output.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasQual ? (
            <p className="text-sm text-muted-foreground">No qualification data yet.</p>
          ) : (
            <ul className="max-h-[min(420px,55vh)] space-y-3 overflow-y-auto pr-1">
              {qualificationRows.slice(0, 14).map((row) => (
                <li
                  key={row.thread_id}
                  className="rounded-xl border border-border/60 bg-muted/15 px-3 py-3 dark:bg-muted/10"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">{row.lead_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{row.company}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                      {row.qualification_base != null ? (
                        <Badge variant="outline" className="font-mono text-[11px]">
                          Base {row.qualification_base}
                        </Badge>
                      ) : null}
                      {row.qualification_refined != null ? (
                        <Badge
                          className={cn(
                            "font-mono text-[11px]",
                            row.qualification_refined >= 70
                              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-950 dark:text-emerald-50"
                              : row.qualification_refined >= 45
                                ? "border-amber-500/40 bg-amber-500/15 text-amber-950 dark:text-amber-50"
                                : "border-border/50 bg-muted/50",
                          )}
                        >
                          Live {row.qualification_refined}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  {row.next_best_action ? (
                    <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-foreground/85">
                      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                      <span>{row.next_best_action}</span>
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">No next action text stored.</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="premium-card-interactive rounded-2xl border-border/80 bg-card/95 shadow-lg ring-1 ring-border/20 dark:ring-white/[0.06]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldQuestion className="h-5 w-5 text-primary" aria-hidden />
            Objection handling
          </CardTitle>
          <CardDescription>
            Heuristic patterns on recent replies plus analyzer labels — copy is a starting point; edit
            before sending.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasObj ? (
            <p className="text-sm text-muted-foreground">No recent replies with objection signals.</p>
          ) : (
            <ul className="max-h-[min(420px,55vh)] space-y-4 overflow-y-auto pr-1">
              {objectionCards.map((card) => (
                <li
                  key={card.id}
                  className="rounded-xl border border-border/60 bg-muted/15 px-3 py-3 dark:bg-muted/10"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <MessageCircleWarning className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span className="truncate font-medium text-foreground">
                      {card.lead_name ?? "Prospect"}
                      {card.company ? (
                        <span className="text-muted-foreground"> · {card.company}</span>
                      ) : null}
                    </span>
                  </div>
                  {card.reply_preview ? (
                    <p className="mt-2 line-clamp-3 text-xs italic text-muted-foreground">
                      “{card.reply_preview}”
                    </p>
                  ) : null}
                  {card.analyzer_objections.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {card.analyzer_objections.slice(0, 5).map((o) => (
                        <Badge key={o} variant="secondary" className="max-w-full truncate text-[10px]">
                          {o}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {card.detected_patterns.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {card.detected_patterns.map((p) => (
                        <Badge key={p} variant="outline" className="text-[10px] capitalize">
                          {patternLabel(p)}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-3 space-y-2 border-t border-border/40 pt-3">
                    {card.suggested_responses.slice(0, 2).map((s) => (
                      <div key={s.pattern} className="rounded-lg bg-background/80 px-2 py-2 text-xs">
                        <p className="font-semibold text-foreground">{s.headline}</p>
                        <p className="mt-1 leading-relaxed text-muted-foreground">{s.body}</p>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
