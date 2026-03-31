"use client";

import { generateExecutiveReportAction } from "@/app/(dashboard)/actions";
import type { SdrManagerPayloadDTO } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Activity,
  BarChart3,
  FileText,
  HeartPulse,
  Loader2,
  Sparkles,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "@/hooks/use-toast";

type Props = {
  initial: SdrManagerPayloadDTO;
  onOpenDeliverability?: () => void;
  onOpenCoaching?: () => void;
};

function healthBadgeClass(overall: SdrManagerPayloadDTO["health"]["overall"]) {
  if (overall === "healthy") return "border-primary/40 bg-primary/10 text-foreground dark:text-primary-foreground";
  if (overall === "degraded") return "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-50";
  return "border-rose-500/40 bg-rose-500/10 text-rose-950 dark:text-rose-50";
}

/**
 * Prompt 102 — executive KPIs, system health, cached AI executive report, one-click regeneration.
 */
export function SdrManagerSection({ initial, onOpenDeliverability, onOpenCoaching }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [localReport, setLocalReport] = useState<string | null>(initial.cachedExecutiveReportMarkdown);
  const [localReportAt, setLocalReportAt] = useState<string | null>(initial.cachedReportAt);

  const onGenerate = useCallback(async () => {
    setBusy(true);
    try {
      const res = await generateExecutiveReportAction();
      if (!res.ok) {
        toast({ title: "Report failed", description: res.error, variant: "destructive" });
        return;
      }
      setLocalReport(res.markdown);
      setLocalReportAt(res.generatedAt);
      toast({ title: "Executive report ready", description: "Saved to your profile and shown below." });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [router]);

  const m = initial.metrics;
  const h = initial.health;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">AI SDR Manager</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Executive view: pipeline ROI themes, team productivity index, system health, and a one-click AI
            executive report aligned with your live analytics (Prompt 102).
          </p>
        </div>
        <Button
          type="button"
          onClick={onGenerate}
          disabled={busy}
          className="shrink-0 gap-2"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
          Generate Executive Report
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="premium-card-interactive rounded-xl border-border/70 bg-card/95 shadow-md ring-1 ring-border/12 dark:ring-white/[0.05]">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Weighted pipeline</CardTitle>
            <BarChart3 className="h-4 w-4 text-primary" aria-hidden />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">${m.weightedPipelineUsd.toLocaleString()}</p>
            <p className="mt-1 text-xs text-muted-foreground">Σ(deal × P(win)) · forecast window</p>
          </CardContent>
        </Card>
        <Card className="premium-card-interactive rounded-xl border-border/70 bg-card/95 shadow-md ring-1 ring-border/12 dark:ring-white/[0.05]">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Est. ROI multiple</CardTitle>
            <Activity className="h-4 w-4 text-primary" aria-hidden />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{m.estimatedRoiMultiple.toFixed(1)}×</p>
            <p className="mt-1 text-xs text-muted-foreground">Vs. tooling cost placeholder (analytics)</p>
          </CardContent>
        </Card>
        <Card className="premium-card-interactive rounded-xl border-border/70 bg-card/95 shadow-md ring-1 ring-border/12 dark:ring-white/[0.05]">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Productivity index</CardTitle>
            <Users className="h-4 w-4 text-primary" aria-hidden />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{m.productivityIndex}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Blend of composite, reply coverage, volume, win rate ({m.teamMembers} seat
              {m.teamMembers === 1 ? "" : "s"})
            </p>
          </CardContent>
        </Card>
        <Card className="premium-card-interactive rounded-xl border-border/70 bg-card/95 shadow-md ring-1 ring-border/12 dark:ring-white/[0.05]">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Reply coverage</CardTitle>
            <FileText className="h-4 w-4 text-primary" aria-hidden />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{m.replyCoveragePct}%</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Analyzed replies per campaign in window ({m.campaignVolume} campaigns)
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <HeartPulse className="h-5 w-5 text-primary" aria-hidden />
            <div>
              <CardTitle className="text-base">System health</CardTitle>
              <CardDescription>
                Deliverability, warm-up coach, calendar, HubSpot, and environment checks — live from your
                dashboard signals.
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn("font-semibold", healthBadgeClass(h.overall))}>
              {h.overall}
            </Badge>
            <span className="text-sm tabular-nums text-muted-foreground">Score {h.score}/100</span>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {h.checks.map((c) => (
            <div
              key={c.id}
              className={cn(
                "rounded-xl border px-4 py-3 text-sm",
                c.status === "ok" && "border-primary/25 bg-primary/[0.06]",
                c.status === "warn" && "border-amber-500/25 bg-amber-500/[0.06]",
                c.status === "critical" && "border-rose-500/25 bg-rose-500/[0.06]",
              )}
            >
              <p className="font-medium text-foreground">{c.label}</p>
              <p className="mt-1 text-muted-foreground">{c.detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {initial.aiRecommendations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI recommendations</CardTitle>
            <CardDescription>
              Pulled from your latest coaching or executive report cache — use Coaching for voice-level
              depth.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
              {initial.aiRecommendations.map((line, i) => (
                <li key={i} className="text-foreground/90">
                  {line}
                </li>
              ))}
            </ul>
            {onOpenCoaching ? (
              <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onOpenCoaching}>
                Open Coaching tab
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">Executive summary report</CardTitle>
            <CardDescription>
              {localReportAt
                ? `Last generated ${new Date(localReportAt).toLocaleString()}`
                : "No report yet — click Generate Executive Report for a structured AI narrative."}
            </CardDescription>
          </div>
          {onOpenDeliverability ? (
            <Button type="button" variant="ghost" size="sm" onClick={onOpenDeliverability}>
              Deliverability details
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {localReport ? (
            <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded-xl border bg-muted/30 p-4 font-sans text-sm leading-relaxed text-foreground">
              {localReport}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">
              Generate a report to cache Markdown in your profile (`executive_metrics`) for leadership
              reviews. Advanced PDF/CSV exports remain on the Reports tab.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
