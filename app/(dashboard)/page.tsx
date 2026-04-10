import {
  getCalendarConnectionStatusAction,
  getDashboardAnalytics,
  getDeliverabilitySuiteAction,
  listCampaignSequencesAction,
  listCustomVoicesAction,
  listRecentCampaigns,
} from "@/app/(dashboard)/actions";
import { BetaDashboardClient } from "@/components/dashboard/beta-dashboard-client";
import { createServerSupabaseClient, getServiceRoleSupabaseOrNull } from "@/lib/supabase-server";
import { ensurePersonalWorkspaceMembership, resolveWorkspaceContext } from "@/lib/workspace";
import { fetchWhiteLabelSettings } from "@/lib/white-label";
import type { CampaignSequenceRow, CustomVoiceRow, WhiteLabelClientSettingsDTO } from "@/types";

/** Server actions / Supabase — not compatible with static generation. */
export const dynamic = "force-dynamic";

/**
 * Prompt 181 — Main operational dashboard at `/` (metric cards, workspace, deliverability, etc.).
 */
export default async function DashboardHomePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let workspaceId = user?.id ?? "";
  if (user) {
    await ensurePersonalWorkspaceMembership(supabase, user.id);
    const ws = await resolveWorkspaceContext(supabase, {
      id: user.id,
      email: user.email ?? null,
    });
    workspaceId = ws.workspaceId;
  }

  let hubspotConnected = false;
  if (user) {
    const sr = getServiceRoleSupabaseOrNull();
    if (sr) {
      const { data: hs } = await sr
        .from("user_hubspot_credentials")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      hubspotConnected = !!hs;
    }
  }

  let customVoices: CustomVoiceRow[] = [];
  if (user) {
    customVoices = await listCustomVoicesAction();
  }

  let whiteLabel: WhiteLabelClientSettingsDTO | null = null;
  if (user) {
    const wl = await fetchWhiteLabelSettings(supabase, workspaceId);
    whiteLabel = {
      appName: wl.appName,
      companyName: wl.companyName,
      primaryColor: wl.primaryColor,
      secondaryColor: wl.secondaryColor,
      supportEmail: wl.supportEmail,
      logoUrl: wl.logoUrl,
      brandSignoff: wl.brandSignoff,
    };
  }

  const [recentCampaigns, analytics, deliverabilitySuite] = await Promise.all([
    listRecentCampaigns(),
    getDashboardAnalytics(),
    getDeliverabilitySuiteAction(),
  ]);

  let campaignSequences: CampaignSequenceRow[] = [];
  if (user) {
    campaignSequences = await listCampaignSequencesAction();
  }

  const calendarStatus = user
    ? await getCalendarConnectionStatusAction()
    : { google: false, microsoft: false };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-1 sm:px-0">
      <header className="pt-1 sm:pt-2">
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground sm:text-4xl">My Campaigns</h1>
      </header>
      <BetaDashboardClient
        analytics={analytics}
        recentCampaigns={recentCampaigns}
        deliverabilitySuite={deliverabilitySuite}
        hubspotConnected={hubspotConnected}
        customVoices={customVoices}
        whiteLabel={whiteLabel}
        campaignSequences={campaignSequences}
        calendarStatus={calendarStatus}
      />
    </div>
  );
}
