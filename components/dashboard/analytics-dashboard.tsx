"use client";

import type { DashboardAnalyticsSummary } from "@/types";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BarChart3, Heart, LayoutGrid, MessageSquare } from "lucide-react";
import Link from "next/link";

type Props = {
  data: DashboardAnalyticsSummary;
};

function StatCard({
  title,
  value,
  hint,
  icon: Icon,
}: {
  title: string;
  value: string;
  hint: string;
  icon: typeof LayoutGrid;
}) {
  return (
    <Card className="rounded-xl border-border/70 bg-card/95 shadow-md ring-1 ring-border/12 dark:ring-white/[0.05]">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <span className="rounded-lg border border-border/50 bg-muted/30 p-2 text-primary">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold tabular-nums tracking-tight">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export function AnalyticsDashboard({ data }: Props) {
  const {
    campaignCount,
    avgCompositeScore,
    replyAnalyzedCount,
    avgReplyInterest,
    strengthBuckets,
  } = data;

  return (
    <div className="space-y-10">
      <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-primary/[0.05] via-card to-card px-5 py-6 shadow-sm ring-1 ring-border/10 dark:from-primary/[0.08] sm:px-7 sm:py-7">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Workspace analytics</h1>
          <Badge variant="outline" className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Live data
          </Badge>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Aggregates from saved campaigns (composite strength) and every reply analysis in{" "}
          <Link href="/replies" className="font-medium text-primary underline-offset-4 hover:underline">
            Replies
          </Link>
          . Numbers refresh when you run campaigns or paste replies.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Campaigns"
          value={String(campaignCount)}
          hint="Rows in your history with a parseable snapshot."
          icon={LayoutGrid}
        />
        <StatCard
          title="Avg composite"
          value={avgCompositeScore != null ? `${avgCompositeScore}/100` : "—"}
          hint="Mean overall campaign strength across saved runs."
          icon={BarChart3}
        />
        <StatCard
          title="Replies analyzed"
          value={String(replyAnalyzedCount)}
          hint="Paste Reply runs persisted for your workspace."
          icon={MessageSquare}
        />
        <StatCard
          title="Avg interest"
          value={avgReplyInterest != null ? `${avgReplyInterest}/10` : "—"}
          hint="Mean interest score from saved reply analyses."
          icon={Heart}
        />
      </div>

      <Card className="rounded-xl border-border/70 bg-card/95 shadow-md">
        <CardHeader>
          <CardTitle className="text-lg">Campaign strength distribution</CardTitle>
          <CardDescription>
            How saved campaigns spread across composite score bands (same index as the results header).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {strengthBuckets.every((b) => b.count === 0) ? (
            <p className="text-sm text-muted-foreground">
              No campaign snapshots yet — run a campaign from the dashboard to populate this chart.
            </p>
          ) : (
            strengthBuckets.map((b) => (
              <div key={b.label} className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-muted-foreground">{b.label}</span>
                  <span className="tabular-nums text-foreground">{b.count}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-black/[0.07] dark:bg-white/[0.1]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary transition-all duration-500"
                    style={{ width: `${b.pct}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
