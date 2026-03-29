import {
  getCalendarConnectionStatusAction,
  getDashboardAnalytics,
  getDeliverabilitySuiteAction,
  getWorkspaceMembersAction,
  listCampaignSequencesAction,
  listCampaignTemplatesAction,
  listCampaignThreads,
  listCustomVoicesAction,
  listAbTestsAction,
  listRecentCampaigns,
  listScheduledReportsAction,
  loadObjectionLibraryForDashboard,
} from "@/app/(dashboard)/actions";
import { DashboardHomeClient } from "@/components/dashboard/dashboard-home-client";
import { getDashboardEnvWarnings } from "@/lib/env";
import { buildDynamicFromEmail } from "@/lib/resend";
import { createServerSupabaseClient, getServiceRoleSupabaseOrNull } from "@/lib/supabase-server";
import { ensurePersonalWorkspaceMembership, resolveWorkspaceContext } from "@/lib/workspace";
import { fetchWhiteLabelSettings } from "@/lib/white-label";
import type {
  AbTestExperimentRow,
  CampaignSequenceRow,
  CampaignTemplateRow,
  CustomVoiceRow,
  WhiteLabelClientSettingsDTO,
} from "@/types";

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
 *
 * Prompt 82 — Built-in lead enrichment + intelligent sourcing: Tavily / Browserless / Serper
 * (`lib/agents/research_node.ts` + `lead_enrichment_node` before `research_node`). Dashboard
 * preview: **Fetch lead intel** in `CampaignWorkspace` (Workspace tab) before **Start campaign**.
 * Optional `public.campaigns.enriched_data` jsonb — see `supabase/lead_enrichment_p82.sql`.
 *
 * Prompt 83 — Objection Library: transcribed Twilio calls + living objections (`call_transcripts`,
 * `objection_library`); see `supabase/call_transcripts_objection_library_p83.sql`.
 *
 * Prompt 84 — PWA (`app/manifest.ts`, `public/sw.js`), mobile nav in `DashboardShell`, push via
 * `lib/push.ts` + `supabase/push_subscriptions_p84.sql`, `PwaBanner` for permission + service worker.
 *
 * Prompt 85 — `campaign_templates` + A/B columns; templates list via `listCampaignTemplatesAction`.
 *
 * Prompt 86 — Advanced reporting tab + `scheduled_reports` (`listScheduledReportsAction`).
 *
 * Prompt 87 — Pipeline forecast cards + trend on Analytics (`getDashboardAnalytics`, `lib/forecast.ts`,
 * optional `campaigns.predicted_revenue` / `win_probability` from `supabase/forecast_p87.sql`).
 *
 * Prompt 88 — `campaign_sequences` multi-channel playbooks (`listCampaignSequencesAction`); SQL:
 * `supabase/campaign_sequences_p88.sql`.
 *
 * Prompt 89 — Calendar OAuth + meeting proposals (`getCalendarConnectionStatusAction`); SQL:
 * `supabase/user_calendar_connections_p89.sql`.
 *
 * Prompt 90 — Advanced A/B batch experiments + auto-optimization (`lib/ab-testing.ts`,
 * `startAdvancedAbBatchExperimentAction`, `listAbTestsAction`); SQL: `supabase/ab_tests_p90.sql`.
 * UI: Sequences tab (`AbTestingSection`) + Analytics A/B cards; `campaigns.ab_test_id` / `ab_variant`
 * surfaced in recent campaign history when columns exist.
 *
 * Prompt 91 — Intelligent automated follow-up engine (`lib/agents/nurture_node.ts` smart timing +
 * `nurture-agent` reply intel); Workspace **`CampaignWorkspace`** card to review/approve steps;
 * `updateSmartFollowUpStepAction`; optional `campaigns.follow_up_*` columns — see
 * `supabase/follow_up_engine_p91.sql`. Prior `reply_analyses` for the same prospect email inform
 * cadence when present (no auto-send — manual outreach flows unchanged).
 *
 * Smart lead scoring — `lib/scoring.ts`, leaderboard via `getDashboardAnalytics` (`LeadPrioritySection`
 * on Workspace + Analytics); optional `campaigns.lead_score` / `priority_reason` —
 * `supabase/lead_priority_scoring.sql`. `page.tsx` merges priority into active thread list by
 * `thread_id`.
 *
 * Prompt 92 — Intelligent lead qualification scoring + objection coach: `lib/agents/qualification_node.ts`
 * (pattern detection, suggested replies, display score refinement with reply interest),
 * `QualificationObjectionPanel` on Workspace + Analytics, optional `campaigns.qualification_score` /
 * `detected_objections` — `supabase/qualification_objections_p92.sql`.
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

  const [campaignsRaw, recentCampaigns, analytics, deliverabilitySuite, workspaceData, objectionLibrary] =
    await Promise.all([
      listCampaignThreads(),
      listRecentCampaigns(),
      getDashboardAnalytics(),
      getDeliverabilitySuiteAction(),
      getWorkspaceMembersAction(),
      loadObjectionLibraryForDashboard(),
    ]);

  const priorityByThread = new Map(
    analytics.leadPriorityLeaderboard.map((r) => [r.thread_id, r]),
  );
  const campaigns = campaignsRaw.map((c) => {
    const p = priorityByThread.get(c.thread_id);
    return {
      ...c,
      lead_priority_tier: p?.priority_tier ?? null,
      lead_priority_score: p?.composite_score ?? null,
    };
  });

  let campaignTemplates: CampaignTemplateRow[] = [];
  let campaignSequences: CampaignSequenceRow[] = [];
  let abTestExperiments: AbTestExperimentRow[] = [];
  if (user) {
    campaignTemplates = await listCampaignTemplatesAction();
    campaignSequences = await listCampaignSequencesAction();
    abTestExperiments = await listAbTestsAction();
  }

  const scheduledReports = user ? await listScheduledReportsAction() : [];
  const reportRecipientEmail = user?.email ?? "";
  const calendarStatus = user ? await getCalendarConnectionStatusAction() : { google: false, microsoft: false };

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
      objectionLibraryTranscripts={objectionLibrary.transcripts}
      objectionLibraryEntries={objectionLibrary.objections}
      campaignTemplates={campaignTemplates}
      campaignSequences={campaignSequences}
      abTestExperiments={abTestExperiments}
      scheduledReports={scheduledReports}
      reportRecipientEmail={reportRecipientEmail}
      calendarStatus={calendarStatus}
    />
  );
}
