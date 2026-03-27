import {
  getDashboardAnalytics,
  listCampaignThreads,
  listRecentCampaigns,
} from "@/app/(dashboard)/actions";
import { DashboardHomeClient } from "@/components/dashboard/dashboard-home-client";
import { getDashboardEnvWarnings } from "@/lib/env";
import { buildDynamicFromEmail } from "@/lib/resend";
import { createServerSupabaseClient } from "@/lib/supabase-server";

/** Server actions / Supabase — not compatible with static generation at /. */
export const dynamic = "force-dynamic";

/**
 * Prompt 73 — Manual outreach send (no auto-send): when a run finishes with
 * `ready_to_send`, the Workspace tab’s Outreach card shows **Send Email**; Resend uses
 * dynamic `From` + `Reply-To` the signed-in user’s Supabase auth email (`sendOutreachEmailAction`).
 */
export default async function DashboardPage() {
  const envWarnings = getDashboardEnvWarnings();

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
      outboundFromPreview={outboundFromPreview}
    />
  );
}
