import {
  getDashboardAnalytics,
  listCampaignThreads,
  listRecentCampaigns,
} from "@/app/(dashboard)/actions";
import { DashboardHomeClient } from "@/components/dashboard/dashboard-home-client";
import { getDashboardEnvWarnings } from "@/lib/env";

/** Server actions / Supabase — not compatible with static generation at /. */
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const envWarnings = getDashboardEnvWarnings();
  const [campaigns, recentCampaigns, analytics] = await Promise.all([
    listCampaignThreads(),
    listRecentCampaigns(),
    getDashboardAnalytics(),
  ]);

  return (
    <DashboardHomeClient
      envWarnings={envWarnings}
      campaigns={campaigns}
      recentCampaigns={recentCampaigns}
      analytics={analytics}
    />
  );
}
