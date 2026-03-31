"use client";

import {
  checkSpamScoreAction,
  getDeliverabilitySuiteAction,
  recordWarmupEmailAction,
  refreshDeliverabilityCoachAction,
  setWarmupEnabledAction,
} from "@/app/(dashboard)/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { dashboardOutlineActionClass } from "@/lib/dashboard-action-classes";
import { cn } from "@/lib/utils";
import type { DashboardAnalyticsSummary, DeliverabilitySuitePayload } from "@/types";
import { Activity, Flame, Loader2, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "@/hooks/use-toast";

type Props = {
  initial: DeliverabilitySuitePayload | null;
  analytics: DashboardAnalyticsSummary;
};

function ProgressBar({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-gradient-to-r from-primary/90 to-primary/90 transition-all duration-500"
        style={{ width: `${p}%` }}
      />
    </div>
  );
}

function statusTone(s: string): string {
  if (s === "excellent") return "text-primary";
  if (s === "good") return "text-primary/80";
  if (s === "fair") return "text-amber-400";
  return "text-rose-400";
}

export function DeliverabilityPanel({ initial, analytics }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [suite, setSuite] = useState<DeliverabilitySuitePayload | null>(initial);
  const [warmupOn, setWarmupOn] = useState(analytics.warmupEnabled);
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [checkResult, setCheckResult] = useState<{
    inboxHealthScore: number;
    spamRiskScore: number;
    status: string;
    flags: string[];
    estimatedWeekPlacement: number;
  } | null>(null);

  const refresh = useCallback(() => {
    startTransition(async () => {
      const next = await getDeliverabilitySuiteAction();
      setSuite(next);
      router.refresh();
    });
  }, [router]);

  const onToggleWarmup = (enabled: boolean) => {
    setWarmupOn(enabled);
    startTransition(async () => {
      const res = await setWarmupEnabledAction({ enabled });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Warm-up toggle failed", description: res.error });
        setWarmupOn(!enabled);
        return;
      }
      toast({ title: enabled ? "Warm-up tracking on" : "Warm-up tracking off" });
      refresh();
    });
  };

  const onRecordWarmup = () => {
    startTransition(async () => {
      const res = await recordWarmupEmailAction();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Could not record", description: res.error });
        return;
      }
      toast({ title: "Warm-up sent recorded", description: "Today’s volume updated." });
      refresh();
    });
  };

  const onCheckSpam = () => {
    startTransition(async () => {
      const res = await checkSpamScoreAction({ subject, html });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Check failed", description: res.error });
        return;
      }
      setCheckResult({
        inboxHealthScore: res.inboxHealthScore,
        spamRiskScore: res.spamRiskScore,
        status: res.status,
        flags: res.flags,
        estimatedWeekPlacement: res.estimatedWeekPlacement,
      });
    });
  };

  const weekProgress = suite
    ? Math.min(100, Math.round((suite.emailsSentLast7Days / 35) * 100))
    : 0;

  const onRefreshCoach = () => {
    startTransition(async () => {
      const res = await refreshDeliverabilityCoachAction();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Coach refresh failed", description: res.error });
        return;
      }
      toast({ title: "Coach updated", description: "Suggestions refreshed for your workspace." });
      refresh();
    });
  };

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-primary/[0.03] via-card to-card px-5 py-6 shadow-sm sm:px-7">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" aria-hidden />
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Deliverability</h2>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Inbox health scoring is heuristic (offline) — use it to tighten copy before sending. Warm-up
          tracking logs simulated daily volume for your own discipline; it does not send mail.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-xl border-border/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Avg inbox health</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">
              {analytics.avgInboxHealthScore != null ? `${analytics.avgInboxHealthScore}` : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {analytics.deliverabilitySampleCount} campaigns with scores
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-border/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Warm-up (7d)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{analytics.warmupEmailsLast7Days}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              emails logged · placement avg{" "}
              {analytics.avgWarmupPlacementScore != null ? `${analytics.avgWarmupPlacementScore}` : "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-border/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Warm-up mode</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <Flame className="h-5 w-5 text-amber-500" aria-hidden />
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={warmupOn}
                onChange={(e) => onToggleWarmup(e.target.checked)}
                disabled={pending}
                aria-label="Toggle warm-up tracking"
              />
              <span className="text-muted-foreground">{warmupOn ? "On" : "Off"}</span>
            </label>
          </CardContent>
        </Card>
        <Card className="rounded-xl border-border/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Campaigns</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{analytics.campaignCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">Runs in analytics window</p>
          </CardContent>
        </Card>
      </div>

      {suite ? (
        <Card className="rounded-2xl border-border/80 border-primary/20 bg-primary/[0.02]">
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5 text-primary" aria-hidden />
                AI deliverability coach
              </CardTitle>
              <CardDescription>
                Real-time health score, inbox placement outlook, and Groq-powered suggestions (refresh to
                update). Scheduling hints are informational — they do not send mail.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn("shrink-0 gap-2", dashboardOutlineActionClass)}
              disabled={pending}
              onClick={onRefreshCoach}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Refresh AI coach
            </Button>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Health score
                  </p>
                  <p className="text-2xl font-bold tabular-nums">{suite.coach.healthScore}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Placement prediction
                  </p>
                  <p className="text-2xl font-bold tabular-nums">{suite.coach.placementPrediction}</p>
                  <p className="text-xs text-muted-foreground">{suite.coach.inboxPlacementLabel}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Warm-up progress
                  </p>
                  <p className="text-2xl font-bold tabular-nums">{suite.coach.warmupProgressPct}%</p>
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Smart scheduling (UTC)</p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {suite.coach.suggestedSendWindows.map((w) => (
                    <li key={w} className="leading-snug">
                      {w}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">
                  Next suggested log window:{" "}
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
                {suite.cachedCoachAt ? (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    AI layer last merged: {new Date(suite.cachedCoachAt).toLocaleString()}
                  </p>
                ) : null}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Coaching tips</p>
              <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
                {suite.coach.quickTips.map((t) => (
                  <li
                    key={t}
                    className="rounded-md border border-border/50 bg-muted/15 px-3 py-2 leading-snug"
                  >
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl border-border/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5 text-primary" aria-hidden />
              Warm-up progress
            </CardTitle>
            <CardDescription>
              Target ~5 warm-up touches/day (35/week). Progress is illustrative — pair with your ESP
              warm-up if applicable.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>7-day volume vs target</span>
                <span>{suite?.emailsSentLast7Days ?? 0} / 35</span>
              </div>
              <ProgressBar pct={weekProgress} />
            </div>
            {suite ? (
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                <p>
                  <span className="font-medium text-foreground">Today:</span> {suite.todayEmails}{" "}
                  logged · placement{" "}
                  <span className="tabular-nums">
                    {suite.todayPlacement != null ? `${suite.todayPlacement}` : "—"}
                  </span>
                </p>
              </div>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn("gap-2", dashboardOutlineActionClass)}
              disabled={pending || !warmupOn}
              onClick={onRecordWarmup}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
              Log one warm-up
            </Button>
            {!warmupOn ? (
              <p className="text-xs text-muted-foreground">Turn on warm-up mode to log volume.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/80">
          <CardHeader>
            <CardTitle className="text-lg">Spam score check</CardTitle>
            <CardDescription>Paste subject + HTML before you send from the workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dv-subject">Subject</Label>
              <input
                id="dv-subject"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject line"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dv-html">HTML body</Label>
              <Textarea
                id="dv-html"
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                placeholder="<p>Hi …</p>"
                className="min-h-[140px] font-mono text-xs"
              />
            </div>
            <Button
              type="button"
              className="gap-2"
              disabled={pending}
              onClick={onCheckSpam}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Check inbox health
            </Button>
            {checkResult ? (
              <div className="space-y-2 rounded-lg border border-border/60 bg-muted/15 p-4 text-sm">
                <p>
                  <span className="font-medium">Inbox health:</span>{" "}
                  <span className="tabular-nums">{checkResult.inboxHealthScore}</span>/100 ·{" "}
                  <span className="text-muted-foreground">spam risk</span>{" "}
                  <span className="tabular-nums">{checkResult.spamRiskScore}</span>/100
                </p>
                <p>
                  <span className="font-medium">Status:</span>{" "}
                  <span className={cn("font-semibold capitalize", statusTone(checkResult.status))}>
                    {checkResult.status}
                  </span>
                </p>
                <p className="text-muted-foreground">
                  Est. week placement (warm-up curve):{" "}
                  <span className="tabular-nums text-foreground">{checkResult.estimatedWeekPlacement}</span>
                  /100
                </p>
                {checkResult.flags.length > 0 ? (
                  <ul className="list-inside list-disc text-xs text-muted-foreground">
                    {checkResult.flags.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-primary/90 dark:text-primary">No major flags.</p>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {suite && suite.logs14d.length > 0 ? (
        <Card className="rounded-2xl border-border/80">
          <CardHeader>
            <CardTitle className="text-lg">Daily warm-up (14 days)</CardTitle>
            <CardDescription>Emails logged per day and synthetic placement score.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="max-h-56 space-y-1.5 overflow-y-auto text-sm">
              {suite.logs14d.map((row) => (
                <li
                  key={row.log_date}
                  className="flex justify-between gap-4 rounded-md border border-border/50 px-3 py-2"
                >
                  <span className="text-muted-foreground">{row.log_date}</span>
                  <span>
                    sent <span className="font-medium tabular-nums">{row.emails_sent}</span> · placement{" "}
                    <span className="tabular-nums">{row.inbox_placement_score}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
