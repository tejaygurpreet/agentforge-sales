import {
  getDashboardAnalytics,
  listCampaignThreads,
  listRecentCampaigns,
} from "@/app/(dashboard)/actions";
import { ActiveAgents } from "@/components/dashboard/active-agents";
import { CampaignList } from "@/components/dashboard/campaign-list";
import { DashboardCampaignRunner } from "@/components/dashboard/dashboard-campaign-runner";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { ProductRoadmapSection } from "@/components/dashboard/product-roadmap-section";
import { getDashboardEnvWarnings } from "@/lib/env";

export default async function DashboardPage() {
  const envWarnings = getDashboardEnvWarnings();
  const [campaigns, recentCampaigns, analytics] = await Promise.all([
    listCampaignThreads(),
    listRecentCampaigns(),
    getDashboardAnalytics(),
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-muted/[0.4] to-muted/[0.12] dark:via-muted/20 dark:to-background">
      <div className="mx-auto max-w-6xl animate-in fade-in slide-in-from-bottom-1 space-y-12 px-4 py-12 duration-700 sm:space-y-14 sm:px-6 sm:py-14 lg:px-8">
      <DashboardHero />

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

      <ActiveAgents />
      <ProductRoadmapSection
        analyticsPreview={{
          campaignCount: analytics.campaignCount,
          avgCompositeScore: analytics.avgCompositeScore,
          replyAnalyzedCount: analytics.replyAnalyzedCount,
        }}
      />
      <CampaignList campaigns={campaigns} />
      {/*
        Prompt 24: only serializable props to this client boundary (recent rows).
        Re-run lives inside RecentCampaigns; campaigns run via startCampaignAction (use server).
      */}
      <DashboardCampaignRunner recentCampaigns={recentCampaigns} />
      </div>
    </div>
  );
}
