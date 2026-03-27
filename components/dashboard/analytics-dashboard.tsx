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
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  BarChart3,
  Flame,
  GitCompare,
  Heart,
  LayoutGrid,
  MessageSquare,
  Radio,
  ShieldCheck,
  Sparkles,
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
    avgInboxHealthScore,
    deliverabilitySampleCount,
    warmupEmailsLast7Days,
    avgWarmupPlacementScore,
    warmupEnabled,
    abTestComparisons,
    forecastWeightedPipelineUsd,
    forecastTotalPipelineUsd,
    forecastAvgWinProbability,
    forecastDealCount,
    forecastTrend,
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
          tab holds full reply intelligence. Pipeline forecast (below) blends composite, qualification,
          ICP, BANT proxy, and reply interest — heuristic until CRM sync.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Weighted pipeline"
          value={`$${forecastWeightedPipelineUsd.toLocaleString()}`}
          hint={`Σ(deal × P(win)) · ${forecastDealCount} deal${forecastDealCount === 1 ? "" : "s"}`}
          icon={Sparkles}
        />
        <StatCard
          title="Total deal value"
          value={`$${forecastTotalPipelineUsd.toLocaleString()}`}
          hint="Unweighted sum of predicted revenue per campaign."
          icon={Wallet}
        />
        <StatCard
          title="Avg win probability"
          value={forecastAvgWinProbability != null ? `${forecastAvgWinProbability}%` : "—"}
          hint="Mean close score across saved snapshots (forecast engine)."
          icon={TrendingUp}
        />
      </div>

      <Card className="premium-card-interactive rounded-xl border-border/70 bg-card/95 shadow-md dark:bg-card/90">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden />
            Pipeline forecast trend
          </CardTitle>
          <CardDescription>
            Weekly weighted pipeline (UTC week start) from completed campaign timestamps.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[260px] min-h-[200px]">
          {forecastTrend.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No weekly trend yet — run campaigns with completion timestamps to populate.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={forecastTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(v) => `$${Number(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                  formatter={(value) => [
                    typeof value === "number" ? `$${value.toLocaleString()}` : "—",
                    "Weighted",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="weightedPipelineUsd"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Weighted pipeline"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Inbox health (avg)"
          value={avgInboxHealthScore != null ? `${avgInboxHealthScore}/100` : "—"}
          hint={
            deliverabilitySampleCount > 0
              ? `From ${deliverabilitySampleCount} outreach sends with scores.`
              : "Scores appear after you send outreach from the workspace."
          }
          icon={ShieldCheck}
        />
        <StatCard
          title="Warm-up (7d)"
          value={String(warmupEmailsLast7Days)}
          hint="Logged warm-up touches (Deliverability tab)."
          icon={Activity}
        />
        <StatCard
          title="Warm-up placement"
          value={avgWarmupPlacementScore != null ? `${avgWarmupPlacementScore}/100` : "—"}
          hint="Synthetic placement from daily warm-up logs."
          icon={Radio}
        />
        <StatCard
          title="Warm-up mode"
          value={warmupEnabled ? "On" : "Off"}
          hint="Toggle in the Deliverability tab."
          icon={Flame}
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

      {abTestComparisons.length > 0 ? (
        <Card className="premium-card-interactive rounded-xl border-border/70 bg-card/95 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <GitCompare className="h-5 w-5 text-primary" aria-hidden />
              A/B voice tests
            </CardTitle>
            <CardDescription>
              Side-by-side composite, qualification, and ICP scores for the same lead pair (two SDR
              voices or variant B notes).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {abTestComparisons.map((row) => (
              <div
                key={row.ab_test_id}
                className="rounded-xl border border-border/60 bg-muted/10 p-4 dark:bg-muted/5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-foreground">{row.lead_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(row.completed_at).toLocaleString()}
                  </p>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border border-border/50 bg-background/80 px-3 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Variant A ({row.variantA.voice_label})
                    </p>
                    <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                      {row.variantA.thread_id.slice(0, 14)}…
                    </p>
                    <dl className="mt-3 space-y-1 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Composite</dt>
                        <dd className="tabular-nums font-semibold">{row.variantA.composite}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Qual</dt>
                        <dd className="tabular-nums">
                          {row.variantA.qual != null ? row.variantA.qual : "—"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">ICP</dt>
                        <dd className="tabular-nums">
                          {row.variantA.icp != null ? row.variantA.icp : "—"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <div className="rounded-lg border border-border/50 bg-background/80 px-3 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Variant B ({row.variantB.voice_label})
                    </p>
                    <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                      {row.variantB.thread_id.slice(0, 14)}…
                    </p>
                    <dl className="mt-3 space-y-1 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Composite</dt>
                        <dd className="tabular-nums font-semibold">{row.variantB.composite}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Qual</dt>
                        <dd className="tabular-nums">
                          {row.variantB.qual != null ? row.variantB.qual : "—"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">ICP</dt>
                        <dd className="tabular-nums">
                          {row.variantB.icp != null ? row.variantB.icp : "—"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

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
