import {
  getDashboardAnalytics,
  getDeliverabilitySuiteAction,
  getWorkspaceMembersAction,
  listCampaignThreads,
  listCustomVoicesAction,
  listRecentCampaigns,
} from "@/app/(dashboard)/actions";
import { DashboardHomeClient } from "@/components/dashboard/dashboard-home-client";
import { getDashboardEnvWarnings } from "@/lib/env";
import { buildDynamicFromEmail } from "@/lib/resend";
import { createServerSupabaseClient, getServiceRoleSupabaseOrNull } from "@/lib/supabase-server";
import { ensurePersonalWorkspaceMembership, resolveWorkspaceContext } from "@/lib/workspace";
import { fetchWhiteLabelSettings } from "@/lib/white-label";
import type { CustomVoiceRow, WhiteLabelClientSettingsDTO } from "@/types";

/** Server actions / Supabase — not compatible with static generation at /. */
export const dynamic = "force-dynamic";

/**
 * Prompt 73 — Manual outreach send (no auto-send): when a run finishes with
 * `ready_to_send`, the Workspace tab’s Outreach card shows **Send Email**; Resend uses
 * dynamic `From` + `Reply-To` the signed-in user’s Supabase auth email (`sendOutreachEmailAction`).
 *
 * Prompt 76 — Safe LinkedIn: Outreach card in `CampaignWorkspace` exposes copy + optional compose URL
 * (no auto-post).
 *
 * Prompt 80 — Deliverability tab: warm-up logs, spam check, aggregates from `getDashboardAnalytics`.
 * Prompt 81 — Team tab/section and workspace-scoped data reads.
 */
export default async function DashboardPage() {
  const envWarnings = getDashboardEnvWarnings();

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
  let senderSignoffName = "";
  if (user) {
    if (typeof user.user_metadata?.full_name === "string") {
      senderSignoffName = user.user_metadata.full_name.trim();
    }
    const { data: profileForSignoff } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    if (profileForSignoff?.full_name?.trim()) {
      senderSignoffName = profileForSignoff.full_name.trim();
    }
  }
  const outboundFromPreview = buildDynamicFromEmail(senderSignoffName || null);

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

  const [campaigns, recentCampaigns, analytics, deliverabilitySuite, workspaceData] = await Promise.all([
    listCampaignThreads(),
    listRecentCampaigns(),
    getDashboardAnalytics(),
    getDeliverabilitySuiteAction(),
    getWorkspaceMembersAction(),
  ]);

  return (
    <DashboardHomeClient
      envWarnings={envWarnings}
      campaigns={campaigns}
      recentCampaigns={recentCampaigns}
      analytics={analytics}
      outboundFromPreview={outboundFromPreview}
      hubspotConnected={hubspotConnected}
      customVoices={customVoices}
      whiteLabel={whiteLabel}
      deliverabilitySuite={deliverabilitySuite}
      workspaceMembers={workspaceData?.members ?? []}
      workspaceRole={workspaceData?.workspaceRole ?? "admin"}
    />
  );
}
