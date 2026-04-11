"use client";

import { LeadPrioritySection } from "@/components/dashboard/lead-priority-section";
import { DealClosePanel } from "@/components/dashboard/deal-close-panel";
import { OptimizerPanel } from "@/components/dashboard/optimizer-panel";
import { QualificationObjectionPanel } from "@/components/dashboard/qualification-objection-panel";
import type { DashboardAnalyticsSummary } from "@/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
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
  Briefcase,
  Flame,
  GitCompare,
  Heart,
  LayoutGrid,
  LineChart as LineChartLucide,
  MessageSquare,
  Radio,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Trophy,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type Props = {
  data: DashboardAnalyticsSummary;
  /** Prompt 70 — hide duplicate page chrome when embedded on the main dashboard tab. */
  variant?: "page" | "embedded";
  /** Prompt 101 — switch parent tab to Coaching (embedded dashboard only). */
  onOpenCoachingTab?: () => void;
  /** Prompt 102 — switch parent tab to SDR Manager (embedded dashboard only). */
  onOpenSdrManagerTab?: () => void;
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
    <Card className="group premium-card-interactive overflow-hidden rounded-2xl border-border/60 bg-gradient-to-br from-card via-card to-muted/25 shadow-soft ring-1 ring-border/20 transition-all duration-300 hover:border-primary/15 hover:shadow-md dark:from-card/95 dark:to-card/90 dark:ring-white/[0.05]">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <span className="rounded-xl border border-border/45 bg-primary/[0.06] p-2 text-primary shadow-sm transition-transform duration-300 group-hover:scale-[1.03]">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export function AnalyticsDashboard({
  data,
  variant = "page",
  onOpenCoachingTab,
  onOpenSdrManagerTab,
}: Props) {
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
    leadPriorityLeaderboard,
    leadPrioritySummary,
    qualificationInsights,
    replyObjectionCards,
    dealCloseQualifications,
    avgCloseProbability,
    optimizerFeed,
    coachingPreview,
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
          "premium-surface relative overflow-hidden rounded-2xl border border-border/55 bg-gradient-to-br from-primary/[0.07] via-card to-accent/[0.04] px-5 py-6 shadow-lift ring-1 ring-border/30 dark:from-primary/[0.1] sm:px-7 sm:py-8",
        )}
      >
        <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-primary/[0.06] blur-3xl" aria-hidden />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-2xl font-semibold tracking-tight text-transparent sm:text-3xl">
              {embedded ? "Workspace analytics" : "Analytics"}
            </h1>
            <Badge
              variant="outline"
              className="border-primary/40 bg-primary/[0.1] text-[10px] font-semibold uppercase tracking-widest text-foreground shadow-sm"
            >
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
          {campaignCount > 0 ? (
            <p className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-xl border border-border/50 bg-card/80 px-4 py-2.5 text-sm text-foreground shadow-sm ring-1 ring-black/[0.03]">
              <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span>
                <strong className="font-semibold tabular-nums">{campaignCount}</strong> campaign
                {campaignCount === 1 ? "" : "s"} in view ·{" "}
                <strong className="font-semibold tabular-nums">{replyAnalyzedCount}</strong> reply
                {replyAnalyzedCount === 1 ? "" : "ies"} analyzed
              </span>
            </p>
          ) : null}
        </div>
      </div>

      {coachingPreview ? (
        <Card className="rounded-2xl border-accent/25 bg-accent/[0.04] shadow-sm ring-1 ring-accent/10">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden />
              AI coaching (Prompt 101)
            </CardTitle>
            <CardDescription>
              Real-time voice benchmarks and pipeline momentum feed the Coaching tab — open it for full AI
              tips and weekly email options.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            {coachingPreview.voiceStats[0] ? (
              <span className="text-sm text-muted-foreground">
                Top voice:{" "}
                <span className="font-medium text-foreground">{coachingPreview.voiceStats[0].voice}</span> (
                avg {coachingPreview.voiceStats[0].avgComposite})
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">Coaching signals update as you add runs.</span>
            )}
            {onOpenCoachingTab ? (
              <Button type="button" size="sm" variant="outline" onClick={onOpenCoachingTab}>
                Open Coaching tab
              </Button>
            ) : (
              <Link
                href="/dashboard"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Go to dashboard → Coaching
              </Link>
            )}
          </CardContent>
        </Card>
      ) : null}

      {onOpenSdrManagerTab ? (
        <Card className="rounded-2xl border-primary/25 bg-primary/[0.04] shadow-sm ring-1 ring-primary/10">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Briefcase className="h-4 w-4 text-primary" aria-hidden />
              AI SDR Manager (Prompt 102)
            </CardTitle>
            <CardDescription>
              Executive pipeline, ROI themes, system health, and a one-click AI executive report — open the SDR
              Manager tab for the full dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" size="sm" variant="outline" onClick={onOpenSdrManagerTab}>
              Open SDR Manager tab
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <StatCard
          title="Avg deal close (engine)"
          value={avgCloseProbability != null ? `${avgCloseProbability}%` : "—"}
          hint="Prompt 93 — ICP + qual + reply + objections + forecast blend."
          icon={Trophy}
        />
      </div>

      <LeadPrioritySection rows={leadPriorityLeaderboard} summary={leadPrioritySummary} />

      <QualificationObjectionPanel
        qualificationRows={qualificationInsights}
        objectionCards={replyObjectionCards}
      />

      <DealClosePanel rows={dealCloseQualifications} avgCloseProbability={avgCloseProbability} />

      <OptimizerPanel mode="feed" rows={optimizerFeed} />

      <Card className="premium-card-interactive rounded-xl border-border/70 bg-card/95 shadow-soft dark:bg-card/90">
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
            <EmptyState
              className="h-full min-h-[200px] justify-center"
              size="sm"
              icon={LineChartLucide}
              title="No weekly trend yet"
              description={
                <>
                  Complete a few campaigns so we can chart weighted pipeline by week (UTC). Timestamps come
                  from saved <strong>campaign</strong> rows.
                </>
              }
            />
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
        <Card className="premium-card-interactive rounded-xl border-border/70 bg-card/95 shadow-soft dark:bg-card/90">
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
        <Card className="premium-card-interactive rounded-xl border-border/70 bg-card/95 shadow-soft dark:bg-card/90">
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
        <Card className="premium-card-interactive rounded-xl border-border/70 bg-card/95 shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <GitCompare className="h-5 w-5 text-primary" aria-hidden />
              A/B tests & auto-optimization
            </CardTitle>
            <CardDescription>
              Pair and batch experiments: composite scores, reply interest, meeting signals, and a
              recommended winner when the auto-score spread is decisive.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {abTestComparisons.map((row) => (
              <div
                key={row.ab_test_id}
                className="rounded-xl border border-border/60 bg-muted/10 p-4 dark:bg-muted/5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">{row.lead_name}</p>
                    {row.is_batch ? (
                      <Badge variant="secondary" className="text-[10px] uppercase">
                        Batch · {row.batch_pair_count ?? "—"} pairs
                      </Badge>
                    ) : null}
                    {row.winner_variant && row.winner_variant !== "tie" ? (
                      <Badge className="gap-1 border-amber-500/40 bg-amber-500/15 text-amber-950 dark:text-amber-50">
                        <Trophy className="h-3 w-3" aria-hidden />
                        Winner {row.winner_variant}
                      </Badge>
                    ) : row.winner_variant === "tie" ? (
                      <Badge variant="outline" className="text-[10px]">
                        Tie / inconclusive
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(row.completed_at).toLocaleString()}
                  </p>
                </div>
                {row.winner_recommendation ? (
                  <p className="mt-3 text-sm leading-relaxed text-foreground/90">
                    {row.winner_recommendation.replace(/\*\*(.*?)\*\*/g, "$1")}
                  </p>
                ) : null}
                {row.optimization_score_a != null && row.optimization_score_b != null ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Auto-optimization score · A: {row.optimization_score_a.toFixed(1)} · B:{" "}
                    {row.optimization_score_b.toFixed(1)}
                    {row.reply_interest_a != null || row.reply_interest_b != null ? (
                      <>
                        {" "}
                        · Reply interest (0–10): A {row.reply_interest_a ?? "—"} / B{" "}
                        {row.reply_interest_b ?? "—"}
                      </>
                    ) : null}
                  </p>
                ) : null}
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border border-border/50 bg-background/80 px-3 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Variant A ({row.variantA.voice_label})
                    </p>
                    <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                      {row.variantA.thread_id.length > 18 && !row.variantA.thread_id.startsWith("(")
                        ? `${row.variantA.thread_id.slice(0, 14)}…`
                        : row.variantA.thread_id}
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
                      {row.variantB.thread_id.length > 18 && !row.variantB.thread_id.startsWith("(")
                        ? `${row.variantB.thread_id.slice(0, 14)}…`
                        : row.variantB.thread_id}
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
        <Card className="premium-card-interactive rounded-xl border-border/70 bg-card/95 shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5 text-primary" aria-hidden />
              Campaign strength distribution
            </CardTitle>
            <CardDescription>Composite score bands across saved campaigns.</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px] min-h-[200px]">
            {chartData.every((d) => d.count === 0) ? (
              <EmptyState
                className="h-full min-h-[200px] justify-center"
                size="sm"
                icon={BarChart3}
                title="No strength distribution yet"
                description="Run at least one campaign to see how composite scores spread across Strong, Promising, Solid, and at-risk bands."
              />
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

        <Card className="premium-card-interactive rounded-xl border-border/70 bg-card/95 shadow-soft">
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
              <EmptyState
                size="sm"
                icon={Radio}
                title="No live signals yet"
                description={
                  <>
                    Signals appear after runs that write to <code>campaign_signals</code>. Confirm the
                    Prompt 70 migration and optional <code>TAVILY_API_KEY</code> for richer account intel.
                  </>
                }
              />
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
