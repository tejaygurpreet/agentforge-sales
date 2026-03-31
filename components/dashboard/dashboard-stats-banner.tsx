"use client";

import type { DashboardAnalyticsSummary } from "@/types";
import { cn } from "@/lib/utils";
import { BarChart3, MessageSquare, Sparkles, Target } from "lucide-react";

type Props = {
  analytics: DashboardAnalyticsSummary;
};

/**
 * Prompt 133 — Top stats strip; sage / terracotta, 20px cards, 12px shadow, hover lift.
 */
export function DashboardStatsBanner({ analytics }: Props) {
  const items = [
    {
      label: "Campaigns",
      value: analytics.campaignCount.toLocaleString(),
      hint: "Workspace runs",
      icon: Target,
      accent: "text-[hsl(var(--sage))]",
    },
    {
      label: "Avg lead score",
      value:
        analytics.avgCompositeScore != null
          ? `${Math.round(analytics.avgCompositeScore)}/100`
          : "—",
      hint: "Composite",
      icon: BarChart3,
      accent: "text-[hsl(var(--terracotta))]",
    },
    {
      label: "Replies analyzed",
      value: analytics.replyAnalyzedCount.toLocaleString(),
      hint: "AI insights",
      icon: Sparkles,
      accent: "text-[hsl(var(--sage))]",
    },
    {
      label: "Forecast deals",
      value: analytics.forecastDealCount.toLocaleString(),
      hint: "In pipeline model",
      icon: MessageSquare,
      accent: "text-[hsl(var(--terracotta))]",
    },
  ];

  return (
    <section
      aria-label="Workspace overview"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {items.map((it) => (
        <div
          key={it.label}
          className={cn(
            "premium-card-spec flex flex-col gap-1 rounded-[var(--card-radius)] border border-border/40 bg-card px-6 py-6 transition-[transform,box-shadow] duration-200 ease-in-out",
            "hover:-translate-y-0.5 hover:shadow-lift",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {it.label}
            </span>
            <it.icon className={cn("h-4 w-4 shrink-0 opacity-90", it.accent)} aria-hidden />
          </div>
          <p className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">{it.value}</p>
          <p className="text-xs text-muted-foreground">{it.hint}</p>
        </div>
      ))}
    </section>
  );
}
