"use client";

import type {
  BatchRunItem,
  CampaignThreadRow,
  DashboardAnalyticsSummary,
  PersistedCampaignRow,
} from "@/types";
import { ActiveAgents } from "@/components/dashboard/active-agents";
import { AnalyticsDashboard } from "@/components/dashboard/analytics-dashboard";
import { CampaignList } from "@/components/dashboard/campaign-list";
import { DashboardCampaignRunner } from "@/components/dashboard/dashboard-campaign-runner";
import { CompetitiveEdgePanel } from "@/components/dashboard/competitive-edge-panel";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { ProductRoadmapSection } from "@/components/dashboard/product-roadmap-section";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";

type Props = {
  envWarnings: string[];
  campaigns: CampaignThreadRow[];
  recentCampaigns: PersistedCampaignRow[];
  analytics: DashboardAnalyticsSummary;
};

/**
 * Prompt 70 — client shell: batch progress to Active agents, Workspace | Analytics tabs.
 */
export function DashboardHomeClient({
  envWarnings,
  campaigns,
  recentCampaigns,
  analytics,
}: Props) {
  const [batchProgress, setBatchProgress] = useState<BatchRunItem[] | null>(null);

  return (
    <div className="mx-auto max-w-6xl animate-in fade-in slide-in-from-bottom-2 space-y-10 px-4 py-6 duration-700 sm:space-y-12 sm:px-6 sm:py-8 lg:px-8">
      <DashboardHero />

      <CompetitiveEdgePanel />

      {envWarnings.length > 0 ? (
        <div
          role="region"
          aria-label="Environment configuration hints"
          className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.08] px-5 py-4 text-sm text-amber-950 shadow-sm dark:text-amber-50"
        >
          <p className="font-semibold">Configuration</p>
          <ul className="mt-2 list-inside list-disc space-y-1.5 text-amber-900/95 dark:text-amber-100/90">
            {envWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <ActiveAgents batchProgress={batchProgress} />

      <ProductRoadmapSection
        analyticsPreview={{
          campaignCount: analytics.campaignCount,
          avgCompositeScore: analytics.avgCompositeScore,
          replyAnalyzedCount: analytics.replyAnalyzedCount,
        }}
      />

      <Tabs defaultValue="workspace" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 gap-1 sm:max-w-lg">
          <TabsTrigger value="workspace" className="transition-all duration-200 data-[state=active]:shadow-md">
            Workspace
          </TabsTrigger>
          <TabsTrigger value="analytics" className="transition-all duration-200 data-[state=active]:shadow-md">
            Analytics
          </TabsTrigger>
        </TabsList>
        <TabsContent value="workspace" className="space-y-10 sm:space-y-12">
          <CampaignList campaigns={campaigns} />
          <DashboardCampaignRunner
            recentCampaigns={recentCampaigns}
            onBatchProgressChange={setBatchProgress}
          />
        </TabsContent>
        <TabsContent value="analytics">
          <AnalyticsDashboard data={analytics} variant="embedded" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
