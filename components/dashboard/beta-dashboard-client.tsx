"use client";

import { DashboardCampaignRunner } from "@/components/dashboard/dashboard-campaign-runner";
import { BetaCommandCenterHero } from "@/components/dashboard/beta-command-center-hero";
import { BetaDeliverabilityCoachCard } from "@/components/dashboard/beta-deliverability-coach-card";
import { BetaRecentCampaigns } from "@/components/dashboard/beta-recent-campaigns";
import { FirstRunSetupBanner } from "@/components/onboarding/first-run-setup-banner";
import { PwaBanner } from "@/components/pwa/pwa-banner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  CalendarConnectionStatusDTO,
  CampaignSequenceRow,
  CustomVoiceRow,
  DashboardAnalyticsSummary,
  DeliverabilitySuitePayload,
  PersistedCampaignRow,
  WhiteLabelClientSettingsDTO,
} from "@/types";
import { motion } from "framer-motion";
import { Layers, LineChart, Play, Target, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

type Props = {
  analytics: DashboardAnalyticsSummary;
  recentCampaigns: PersistedCampaignRow[];
  deliverabilitySuite: DeliverabilitySuitePayload | null;
  hubspotConnected: boolean;
  customVoices: CustomVoiceRow[];
  whiteLabel: WhiteLabelClientSettingsDTO | null;
  campaignSequences: CampaignSequenceRow[];
  calendarStatus: CalendarConnectionStatusDTO;
};

function formatUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n >= 100_000 ? 0 : 1,
  }).format(n);
}

/**
 * Prompt 137 — Onyx Copper dashboard: focused hero, metrics, batch mode, last five + Show more.
 */
export function BetaDashboardClient({
  analytics,
  recentCampaigns,
  deliverabilitySuite,
  hubspotConnected,
  customVoices,
  whiteLabel,
  campaignSequences,
  calendarStatus,
}: Props) {
  const pipelineUsd = useMemo(() => {
    const v = analytics.forecastTotalPipelineUsd;
    if (v > 0) return v;
    return analytics.estimatedPipelineValueUsd;
  }, [analytics.forecastTotalPipelineUsd, analytics.estimatedPipelineValueUsd]);

  const metrics = useMemo(
    () => [
      {
        label: "Active campaigns",
        value: analytics.campaignCount.toLocaleString(),
        hint: "Workspace threads",
        icon: Target,
        accent: "text-[#111827]",
      },
      {
        label: "Pipeline value",
        value: formatUsd(pipelineUsd),
        hint: "Forecast total",
        icon: LineChart,
        accent: "text-[#B45309]",
      },
      {
        label: "Avg score",
        value:
          analytics.avgCompositeScore != null ? `${Math.round(analytics.avgCompositeScore)}/100` : "—",
        hint: "Composite fit",
        icon: Layers,
        accent: "text-[#B45309]/80",
      },
      {
        label: "ROI",
        value:
          analytics.estimatedRoiMultiplier > 0
            ? `${analytics.estimatedRoiMultiplier.toFixed(1)}×`
            : "—",
        hint: "Est. vs tooling",
        icon: TrendingUp,
        accent: "text-foreground/70",
      },
    ],
    [analytics, pipelineUsd],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="w-full space-y-10 sm:space-y-12"
    >
      <PwaBanner />
      <FirstRunSetupBanner />

      <BetaCommandCenterHero />

      <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m, i) => (
          <motion.div
            key={m.label}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "premium-card-spec warm-card-veil flex flex-col gap-1 rounded-[var(--card-radius)] border border-[#111827]/08 px-5 py-5",
              "shadow-card transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-glow-onyx",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {m.label}
              </span>
              <m.icon className={cn("h-4 w-4 opacity-90", m.accent)} aria-hidden />
            </div>
            <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums">{m.value}</p>
            <p className="text-xs font-medium text-muted-foreground">{m.hint}</p>
          </motion.div>
        ))}
      </section>

      <section aria-label="Quick actions" className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.4 }}
          className={cn(
            "flex flex-col justify-center gap-4 rounded-[var(--card-radius)] border border-[#111827]/12 bg-white bg-gradient-to-br from-white via-[#F9F6F0] to-[#EDE0D4]/35 p-6 shadow-lift sm:p-8",
            "ring-1 ring-[#B45309]/10",
          )}
        >
          <div>
            <h2 className="text-lg font-bold text-foreground">Start new campaign</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Jump straight to the lead form and voice presets.
            </p>
          </div>
          <Button
            size="lg"
            className="h-14 rounded-[var(--card-radius)] border border-[#B45309]/30 bg-[#111827] text-base font-semibold text-white shadow-glow-onyx hover:bg-[#1e293b] sm:max-w-xs"
            asChild
          >
            <a href="#campaign-workspace">
              <Play className="mr-2 h-5 w-5" aria-hidden />
              Start New Campaign
            </a>
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.4 }}
          className={cn(
            "flex flex-col justify-between gap-4 rounded-[var(--card-radius)] border-2 border-[#B45309]/40 bg-white bg-gradient-to-br from-white to-[#EDE0D4]/25 p-6 shadow-[var(--card-shadow-spec)] sm:p-8",
            "transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-glow-copper",
          )}
        >
          <div>
            <h2 className="text-lg font-bold text-foreground">Batch mode</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Run parallel campaigns from JSON or saved lead snapshots — built for operators.
            </p>
          </div>
          <Button
            size="lg"
            className="h-12 rounded-[var(--card-radius)] bg-[#B45309] font-semibold text-white shadow-lg hover:bg-[#9a4508]"
            asChild
          >
            <a href="#batch-mode-anchor">Open batch tools</a>
          </Button>
        </motion.div>
      </section>

      <BetaRecentCampaigns campaigns={recentCampaigns} />

      <BetaDeliverabilityCoachCard suite={deliverabilitySuite} />

      <section id="beta-runner" className="space-y-6 scroll-mt-28 border-t border-[#111827]/10 pt-10">
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight text-foreground">Campaign workspace</h2>
          <p className="text-sm text-muted-foreground">
            New campaign form, exports, and full recent history for batch selection.
          </p>
        </div>
        <DashboardCampaignRunner
          recentCampaigns={recentCampaigns}
          hubspotConnected={hubspotConnected}
          customVoices={customVoices}
          whiteLabel={whiteLabel}
          campaignSequences={campaignSequences}
          calendarStatus={calendarStatus}
          hideRecentCampaigns
        />
      </section>

      <p className="pb-4 text-center text-xs text-muted-foreground">
        Templates, reports, and specialized tools —{" "}
        <Link className="font-semibold text-[#B45309] underline-offset-4 hover:underline" href="/analytics">
          Analytics
        </Link>
        ,{" "}
        <Link className="font-semibold text-[#B45309] underline-offset-4 hover:underline" href="/setup">
          Setup
        </Link>
        , and{" "}
        <Link className="font-semibold text-[#B45309] underline-offset-4 hover:underline" href="/replies">
          Replies
        </Link>
        .
      </p>
    </motion.div>
  );
}
