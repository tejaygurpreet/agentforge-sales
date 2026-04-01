import { getCalendarConnectionStatusAction, getWorkspaceMembersAction } from "@/app/(dashboard)/actions";
import { SetupPageClient } from "@/components/dashboard/setup-page-client";
import { getServiceRoleSupabaseOrNull } from "@/lib/supabase-server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ensurePersonalWorkspaceMembership } from "@/lib/workspace";
import { fetchWhiteLabelSettings } from "@/lib/white-label";
import type { WhiteLabelClientSettingsDTO } from "@/types";

export const dynamic = "force-dynamic";

/** Prompt 135–136 — Integrations hub + tour; Prompt 136 energetic coral/sage shell in `SetupPageClient`. */
export default async function SetupPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  await ensurePersonalWorkspaceMembership(supabase, user.id);

  let hubspotConnected = false;
  const sr = getServiceRoleSupabaseOrNull();
  if (sr) {
    const { data: hs } = await sr
      .from("user_hubspot_credentials")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    hubspotConnected = !!hs;
  }

  const [calendarStatus, workspaceData, wlRow] = await Promise.all([
    getCalendarConnectionStatusAction(),
    getWorkspaceMembersAction(),
    fetchWhiteLabelSettings(supabase, user.id),
  ]);

  const whiteLabel: WhiteLabelClientSettingsDTO = {
    appName: wlRow.appName,
    companyName: wlRow.companyName,
    primaryColor: wlRow.primaryColor,
    secondaryColor: wlRow.secondaryColor,
    supportEmail: wlRow.supportEmail,
    logoUrl: wlRow.logoUrl,
    brandSignoff: wlRow.brandSignoff,
  };

  return (
    <SetupPageClient
      hubspotConnected={hubspotConnected}
      calendarStatus={calendarStatus}
      whiteLabel={whiteLabel}
      workspaceMembers={workspaceData?.members ?? []}
      workspaceRole={workspaceData?.workspaceRole ?? "admin"}
    />
  );
}
