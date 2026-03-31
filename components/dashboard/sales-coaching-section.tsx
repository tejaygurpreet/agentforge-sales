"use client";

import {
  getSalesCoachingPayloadAction,
  refreshSalesCoachingAction,
  setWeeklyCoachingEmailAction,
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
import { dashboardOutlineActionClass } from "@/lib/dashboard-action-classes";
import { cn } from "@/lib/utils";
import type {
  DashboardAnalyticsSummary,
  SalesCoachingPayloadDTO,
  WorkspaceMemberDTO,
} from "@/types";
import {
  ArrowRight,
  BarChart3,
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "@/hooks/use-toast";

type Props = {
  initial: SalesCoachingPayloadDTO;
  analytics: DashboardAnalyticsSummary;
  workspaceMembers: WorkspaceMemberDTO[];
};

function MomentumBadge({ m }: { m: string }) {
  const label =
    m === "up" ? "Pipeline momentum ↑" : m === "down" ? "Pipeline momentum ↓" : m === "flat" ? "Steady" : "—";
  const cls =
    m === "up"
      ? "border-primary/40 bg-primary/10 text-foreground dark:text-primary-foreground"
      : m === "down"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-50"
        : "border-border/60 bg-muted/30 text-muted-foreground";
  return (
    <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", cls)}>{label}</span>
  );
}

/**
 * Prompt 101 — AI coaching + real-time performance (voice/sequence) + weekly email opt-in.
 */
export function SalesCoachingSection({ initial, analytics, workspaceMembers }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [payload, setPayload] = useState<SalesCoachingPayloadDTO>(initial);
  const [weekly, setWeekly] = useState(initial.weeklyEmailEnabled);

  const activeMembers = workspaceMembers.filter((m) => m.status === "active").length;

  const onRefresh = useCallback(() => {
    startTransition(async () => {
      const next = await refreshSalesCoachingAction(analytics);
      setPayload(next);
      setWeekly(next.weeklyEmailEnabled);
      toast({ title: "Coaching refreshed", description: "Latest AI tips saved to your profile." });
      router.refresh();
    });
  }, [analytics, router]);

  const onReloadPayload = useCallback(() => {
    startTransition(async () => {
      const next = await getSalesCoachingPayloadAction(analytics);
      setPayload(next);
      setWeekly(next.weeklyEmailEnabled);
      router.refresh();
    });
  }, [analytics, router]);

  const onToggleWeekly = useCallback(
    (enabled: boolean) => {
      setWeekly(enabled);
      startTransition(async () => {
        const res = await setWeeklyCoachingEmailAction({ enabled });
        if (!res.ok) {
          toast({ variant: "destructive", title: "Could not save preference", description: res.error });
          setWeekly(!enabled);
          return;
        }
        toast({
          title: enabled ? "Weekly summary on" : "Weekly summary off",
          description: "Run supabase/coaching_p101.sql — delivery hooks up via your email worker.",
        });
      });
    },
    [],
  );

  const preview = payload.preview;
  const ai = payload.ai;

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-accent/[0.05] via-card to-card px-5 py-6 shadow-sm sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
              <Sparkles className="h-6 w-6 text-primary" aria-hidden />
              AI sales coaching
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Combines live workspace analytics with personalized tips. Data refreshes in Analytics;
              coaching cache updates every few days or when you refresh.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn("gap-2", dashboardOutlineActionClass)}
              disabled={pending}
              onClick={onRefresh}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh AI coaching
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-xl border-border/70">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Users className="h-4 w-4" aria-hidden />
              Team context
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{activeMembers}</p>
            <p className="mt-1 text-xs text-muted-foreground">Active members in this workspace</p>
            {ai?.team_insight ? (
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{ai.team_insight}</p>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                Invite teammates from the Team card above to unlock shared coaching context.
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-xl border-border/70 md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <TrendingUp className="h-4 w-4" aria-hidden />
              Real-time signals
            </CardTitle>
            <CardDescription>From your latest dashboard aggregates (no extra queries).</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            {preview ? <MomentumBadge m={preview.momentum} /> : null}
            <span className="text-sm text-muted-foreground">
              Campaigns analyzed: <span className="font-medium text-foreground">{analytics.campaignCount}</span>
            </span>
            <span className="text-sm text-muted-foreground">
              Avg composite:{" "}
              <span className="font-medium text-foreground">
                {analytics.avgCompositeScore ?? "—"}
              </span>
            </span>
            {payload.cachedAt ? (
              <span className="text-xs text-muted-foreground">
                AI cache: {new Date(payload.cachedAt).toLocaleString()}
              </span>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl border-border/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="h-5 w-5 text-primary" aria-hidden />
              Strengths & gaps (voice / outcomes)
            </CardTitle>
            <CardDescription>
              Derived from campaign composites, replies, warm-up, and A/B tests across your workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {preview?.voiceStats?.length ? (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Voice performance
                </p>
                <ul className="space-y-2 text-sm">
                  {preview.voiceStats.slice(0, 8).map((v) => (
                    <li
                      key={v.voice}
                      className="flex justify-between gap-4 rounded-lg border border-border/50 bg-muted/15 px-3 py-2"
                    >
                      <span className="font-medium">{v.voice}</span>
                      <span className="tabular-nums text-muted-foreground">
                        avg {v.avgComposite} · {v.runs} runs
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Run campaigns with varied voices to see breakdowns.</p>
            )}
            {preview?.strengths?.length ? (
              <div>
                <p className="mb-1 text-xs font-medium text-primary dark:text-primary">Strengths</p>
                <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                  {preview.strengths.map((s) => (
                    <li key={s}>{s.replace(/\*\*/g, "")}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {preview?.weaknesses?.length ? (
              <div>
                <p className="mb-1 text-xs font-medium text-amber-800 dark:text-amber-200">Watch</p>
                <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                  {preview.weaknesses.map((s) => (
                    <li key={s}>{s.replace(/\*\*/g, "")}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/80 border-accent/20 bg-accent/[0.03]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" aria-hidden />
              AI recommendations
            </CardTitle>
            <CardDescription>
              Structured tips for you and your team — refresh to regenerate after big pipeline changes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {ai?.focus_areas?.length ? (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Focus areas</p>
                <ul className="list-inside list-decimal space-y-1 text-sm">
                  {ai.focus_areas.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {ai?.personalized_tips?.length ? (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Personalized tips</p>
                <ul className="space-y-2">
                  {ai.personalized_tips.map((t) => (
                    <li
                      key={t}
                      className="rounded-lg border border-border/50 bg-background/80 px-3 py-2 text-sm leading-relaxed"
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No AI tips yet — add campaign history or tap Refresh AI coaching.
              </p>
            )}
            {ai?.voice_tips?.length ? (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Per-voice ideas</p>
                <ul className="space-y-2 text-sm">
                  {ai.voice_tips.map((vt) => (
                    <li key={`${vt.voice}-${vt.tip}`} className="rounded-md bg-muted/25 px-3 py-2">
                      <span className="font-medium text-foreground">{vt.voice}:</span> {vt.tip}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {ai?.sequence_tips?.length ? (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Sequence / playbook</p>
                <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                  {ai.sequence_tips.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-border/80">
        <CardHeader>
          <CardTitle className="text-base">Weekly coaching email</CardTitle>
          <CardDescription>
            Opt in to a concise weekly summary (implementation: cron reads{" "}
            <code className="rounded bg-muted px-1 text-xs">coaching_weekly_email_enabled</code> on profiles).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <input
              id="weekly-coaching-email"
              type="checkbox"
              className="h-4 w-4 rounded border-border"
              checked={weekly}
              disabled={pending}
              onChange={(e) => onToggleWeekly(e.target.checked)}
            />
            <Label htmlFor="weekly-coaching-email" className="text-sm font-normal">
              Email me a weekly coaching summary
            </Label>
          </div>
          <Button type="button" variant="ghost" size="sm" className="gap-1 text-xs" onClick={onReloadPayload}>
            Sync state
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
