"use client";

import type { DashboardAnalyticsSummary } from "@/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  BarChart3,
  Heart,
  LayoutGrid,
  MessageSquare,
  Radio,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";

type Props = {
  data: DashboardAnalyticsSummary;
  /** Prompt 70 — hide duplicate page chrome when embedded on the main dashboard tab. */
  variant?: "page" | "embedded";
};

const CHART_COLORS = ["#64748b", "#38bdf8", "#34d399", "#a78bfa"];

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
    <Card className="premium-card-interactive rounded-xl border-border/70 bg-card/95 shadow-md ring-1 ring-border/12 dark:ring-white/[0.05]">
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

export function AnalyticsDashboard({ data, variant = "page" }: Props) {
  const {
    campaignCount,
    avgCompositeScore,
    replyAnalyzedCount,
    avgReplyInterest,
    strengthBuckets,
    liveSignalsFeed,
    estimatedPipelineValueUsd,
    estimatedRoiMultiplier,
  } = data;

  const chartData = strengthBuckets.map((b, i) => ({
    name: b.label,
    count: b.count,
    fill: CHART_COLORS[i % CHART_COLORS.length]!,
  }));

  const embedded = variant === "embedded";

  return (
    <div className="space-y-10">
      <div
        className={cn(
          "premium-surface rounded-2xl border border-border/60 bg-gradient-to-br from-primary/[0.06] via-card to-card px-5 py-6 shadow-sm ring-1 ring-white/[0.05] dark:from-primary/[0.1] sm:px-7 sm:py-7",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {embedded ? "Workspace analytics" : "Analytics"}
          </h1>
          <Badge variant="outline" className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Live data
          </Badge>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Aggregates from saved campaigns and reply analyses.{" "}
          {!embedded ? (
            <Link href="/replies" className="font-medium text-primary underline-offset-4 hover:underline">
              Replies
            </Link>
          ) : (
            <span className="font-medium text-foreground/90">Replies</span>
          )}{" "}
          tab holds full reply intelligence. Pipeline and ROI figures below are directional placeholders
          until CRM sync.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Campaigns"
          value={String(campaignCount)}
          hint="Saved runs with a parseable snapshot."
          icon={LayoutGrid}
        />
        <StatCard
          title="Avg composite"
          value={avgCompositeScore != null ? `${avgCompositeScore}/100` : "—"}
          hint="Mean composite strength across history."
          icon={BarChart3}
        />
        <StatCard
          title="Replies analyzed"
          value={String(replyAnalyzedCount)}
          hint="Paste Reply rows persisted."
          icon={MessageSquare}
        />
        <StatCard
          title="Avg interest"
          value={avgReplyInterest != null ? `${avgReplyInterest}/10` : "—"}
          hint="Mean interest score from reply analyses."
          icon={Heart}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="premium-card-interactive rounded-xl border-border/70 bg-card/95 shadow-md dark:bg-card/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <span className="rounded-lg border border-border/50 bg-muted/30 p-2 text-primary">
                <Wallet className="h-4 w-4" aria-hidden />
              </span>
              Pipeline value (estimate)
            </CardTitle>
            <CardDescription>
              Placeholder: composite score × campaign count × simple factor — replace with CRM ACV.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums text-foreground">
              ${estimatedPipelineValueUsd.toLocaleString()}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Not financial advice — demo math for executive visibility.
            </p>
          </CardContent>
        </Card>
        <Card className="premium-card-interactive rounded-xl border-border/70 bg-card/95 shadow-md dark:bg-card/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <span className="rounded-lg border border-border/50 bg-muted/30 p-2 text-primary">
                <TrendingUp className="h-4 w-4" aria-hidden />
              </span>
              ROI multiple (estimate)
            </CardTitle>
            <CardDescription>
              Placeholder vs a baseline tooling cost — tune with your stack.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums text-foreground">
              {estimatedRoiMultiplier > 0 ? `${estimatedRoiMultiplier}×` : "—"}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Derived from average composite score when campaigns exist.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="premium-card-interactive rounded-xl border-border/70 bg-card/95 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5 text-primary" aria-hidden />
              Campaign strength distribution
            </CardTitle>
            <CardDescription>Composite score bands across saved campaigns.</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px] min-h-[200px]">
            {chartData.every((d) => d.count === 0) ? (
              <p className="text-sm text-muted-foreground">
                No campaign snapshots yet — run a campaign to populate this chart.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {chartData.map((entry) => (
                      <Cell key={`cell-${entry.name}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="premium-card-interactive rounded-xl border-border/70 bg-card/95 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Radio className="h-5 w-5 text-primary" aria-hidden />
              Live signals feed
            </CardTitle>
            <CardDescription>
              Latest post-research signals across campaigns (requires{" "}
              <code className="text-xs">campaign_signals</code> table).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {liveSignalsFeed.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No signals yet — run campaigns after applying the Prompt 70 migration, or confirm
                TAVILY_API_KEY for richer pulls.
              </p>
            ) : (
              <ul className="max-h-[280px] space-y-3 overflow-y-auto pr-1">
                {liveSignalsFeed.slice(0, 24).map((s) => (
                  <li
                    key={s.id}
                    className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm dark:bg-muted/10"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {s.signal_type.replace(/_/g, " ")}
                      </Badge>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {s.thread_id.slice(0, 14)}…
                      </span>
                    </div>
                    <p className="mt-1.5 leading-relaxed text-foreground/90">{s.signal_text}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {new Date(s.created_at).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
