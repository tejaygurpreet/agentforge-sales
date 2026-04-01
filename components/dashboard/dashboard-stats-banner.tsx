"use client";

import type { DashboardAnalyticsSummary } from "@/types";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { BarChart3, MessageSquare, Sparkles, Target } from "lucide-react";

type Props = {
  analytics: DashboardAnalyticsSummary;
};

/**
 * Prompt 136 — Stat tiles: sage / terracotta / coral accents, stagger + hover glow lift.
 */
export function DashboardStatsBanner({ analytics }: Props) {
  const items = [
    {
      label: "Campaigns",
      value: analytics.campaignCount.toLocaleString(),
      hint: "Workspace runs",
      icon: Target,
      accent: "text-sage",
      chip: "from-sage/15 to-sage/5 border-sage/25",
    },
    {
      label: "Avg lead score",
      value:
        analytics.avgCompositeScore != null
          ? `${Math.round(analytics.avgCompositeScore)}/100`
          : "—",
      hint: "Composite",
      icon: BarChart3,
      accent: "text-highlight",
      chip: "from-highlight/18 to-terracotta/10 border-highlight/28",
    },
    {
      label: "Replies analyzed",
      value: analytics.replyAnalyzedCount.toLocaleString(),
      hint: "AI insights",
      icon: Sparkles,
      accent: "text-terracotta",
      chip: "from-terracotta/15 to-highlight/10 border-terracotta/25",
    },
    {
      label: "Forecast deals",
      value: analytics.forecastDealCount.toLocaleString(),
      hint: "In pipeline model",
      icon: MessageSquare,
      accent: "text-sage",
      chip: "from-sage/12 to-highlight/12 border-sage/20",
    },
  ];

  return (
    <motion.section
      aria-label="Workspace overview"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      initial="hidden"
      animate="show"
      variants={{
        hidden: { opacity: 0 },
        show: {
          opacity: 1,
          transition: { staggerChildren: 0.07, delayChildren: 0.06 },
        },
      }}
    >
      {items.map((it) => (
        <motion.div
          key={it.label}
          variants={{
            hidden: { opacity: 0, y: 16 },
            show: { opacity: 1, y: 0, transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] } },
          }}
          className={cn(
            "premium-card-spec flex flex-col gap-1 rounded-[var(--card-radius)] border border-border/35 bg-[#FAF7F2] px-6 py-6",
            "transition-[transform,box-shadow] duration-300 ease-out",
            "hover:-translate-y-1 hover:scale-[1.03] hover:shadow-glow",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {it.label}
            </span>
            <span
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-[14px] border bg-gradient-to-br shadow-inner",
                it.chip,
              )}
            >
              <it.icon className={cn("h-4 w-4 shrink-0 opacity-95", it.accent)} aria-hidden />
            </span>
          </div>
          <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums">{it.value}</p>
          <p className="text-xs font-medium text-muted-foreground">{it.hint}</p>
        </motion.div>
      ))}
    </motion.section>
  );
}
