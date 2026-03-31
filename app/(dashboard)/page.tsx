import {
  getCalendarConnectionStatusAction,
  getDashboardAnalytics,
  getDeliverabilitySuiteAction,
  getSalesCoachingPayloadAction,
  getSdrManagerPayloadAction,
  getWorkspaceMembersAction,
  listCampaignSequencesAction,
  listCampaignTemplatesAction,
  listCampaignThreads,
  listCustomVoicesAction,
  listAbTestsAction,
  listKnowledgeBaseEntriesAction,
  listPlaybooksForWorkspaceAction,
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
 *
 * Prompt 93 — Deal close probability engine (`lib/qualification-engine.ts`): blends ICP, smart lead
 * scores, qualification, forecast, reply interest, objections; `DealClosePanel` + campaign badges;
 * optional `campaigns.close_probability` / `qualification_factors` — `supabase/deal_close_p93.sql`.
 *
 * Prompt 94 — AI campaign optimizer (`lib/optimizer.ts`): auto-pause suggestions + variant switches +
 * live feed on Workspace / Analytics (`OptimizerPanel`); graph merges hints into smart follow-up
 * metadata; optional `campaigns.optimization_status` / `performance_metrics` —
 * `supabase/optimizer_p94.sql`.
 *
 * Prompt 95 — Intelligent sequence recommendation (`lib/recommendation-engine.ts`,
 * `getSequenceRecommendationAction`, `SequenceRecommendationCard` on the new-campaign form):
 * suggests saved playbook + voice + opener from workspace history; optional
 * `campaigns.sequence_recommendation` + `sequence_recommendation_log` — `supabase/sequence_recommendation_p95.sql`.
 *
 * Prompt 96 — Automated competitor analysis & battle cards: research populates `competitor_landscape`
 * (merged in `agents/research-normalize.ts`); `CampaignWorkspace` + PDF dossier show the matrix;
 * optional `campaigns.competitor_analysis` jsonb — `supabase/competitor_analysis_p96.sql`.
 *
 * Prompt 97 — AI sales playbook generator (`lib/playbook-generator.ts`) + living knowledge base:
 * `nurture_node` / `qualification_node` expose snapshot signals; completed saves append KB rows;
 * Playbooks tab — `listPlaybooksForWorkspaceAction`, `generatePlaybookForThreadAction`,
 * `getPlaybookPdfBase64Action`; SQL: `supabase/playbooks_knowledge_p97.sql`.
 *
 * Prompt 98 — AI proposal & quote PDF: `lib/proposal-generator.ts` + `renderProposalQuotePdfBytes` in
 * `lib/campaign-pdf.ts`; `CampaignWorkspace` **Generate proposal** after qualification signals;
 * `generateCampaignProposalAction` uploads to Storage; SQL: `supabase/proposal_columns_p98.sql`
 * (`proposal_status`, `generated_proposal_url` on `campaigns`).
 *
 * Prompt 99 — AI Sales Email Warm-up & Deliverability Coach: `lib/deliverability-coach.ts` (scoring +
 * Groq coach), `getDeliverabilitySuiteAction` / `refreshDeliverabilityCoachAction`, Workspace widget +
 * Deliverability tab; SQL: `supabase/deliverability_coach_p99.sql` (prefs cache + health snapshots).
 *
 * Prompt 100 — One-click personalized demo: `lib/demo-generator.ts` + `CampaignWorkspace`
 * `PersonalizedDemoBookingCard` (high qualification); calendar events reuse Prompt 89 APIs with demo
 * descriptions; SQL: `supabase/demo_booking_p100.sql` (`demo_status`, `demo_script`, `demo_outcome`).
 *
 * Prompt 101 — AI sales coaching: `lib/coaching-engine.ts`, `getSalesCoachingPayloadAction`, Coaching tab;
 * analytics gains `coachingPreview`; profiles SQL: `supabase/coaching_p101.sql` (`coaching_notes`,
 * `performance_metrics`, `coaching_weekly_email_enabled`).
 *
 * Prompt 102 — AI SDR Manager: `lib/sdr-manager.ts`, `getSdrManagerPayloadAction`,
 * `generateExecutiveReportAction`, SDR Manager tab; SQL: `supabase/sdr_manager_p102.sql`
 * (`executive_metrics`, `system_health_status` on `profiles`).
 *
 * Prompt 103 — Super aesthetic light theme + layout polish: `app/globals.css`, `tailwind.config.ts`,
 * `app/layout.tsx` (Plus Jakarta Sans), `DashboardShell` (no forced dark), `DashboardHero`,
 * `DashboardHomeClient`, shared UI primitives (`button`, `card`, `tabs`, `input`, `dialog`, `textarea`).
 *
 * Prompt 104 — Core flow UX: `CampaignFlowGuideStrip`, `dashboard-campaign-runner` (workspace before
 * recent list, guided batch tooltips), `campaign-workspace` (lead sections + FormDescription),
 * `recent-campaigns`, `active-agents`.
 *
 * Prompt 105 — Core flow polish (Outreach, email review, Reply Analyzer): `campaign-workspace` Outreach
 * card (preview chrome, Send Email CTA, status badges), `paste-reply-panel` + `dashboard-reply-strip`
 * (prominent analyzer, light gradients); no behavior changes.
 *
 * Prompt 106 — Team & settings UX: `WorkspaceMembersCard` (invite flow, member tiles, roles), grouped
 * `WhiteLabelSettingsCard` + `HubSpotConnectSection` under Brand & integrations on `DashboardHomeClient`;
 * `DashboardShell` nav (icons, active state, logo link). No API or permission changes.
 *
 * Prompt 107 — Login/signup UX: `(auth)/layout`, polished forms; `/onboarding` setup wizard + first-run
 * banner (`FirstRunSetupBanner`, `lib/onboarding-storage.ts`). `Setup` in dashboard nav.
 *
 * Prompt 108 — Analytics & Reports polish (`analytics-dashboard`, `reports-section`), shared `EmptyState` UI,
 * empty tiles in `lead-priority-section`, `campaign-list`, `recent-campaigns`. No metric or export logic changes.
 *
 * Prompt 109 — PDF dossier UX: `lib/campaign-pdf.ts` (warm light paper, layered cover band, refined cards &
 * footer); `CampaignPdfPreviewDialog` in `CampaignWorkspace` — preview in modal, loading state, download +
 * success hint (same export as before).
 *
 * Prompt 110 — Settings & integrations hub: `settings-integrations-section.tsx` (cream shell, team + brand grid,
 * HubSpot, Calendar, Twilio cards); global UI polish (`button`, `card`, `dialog`, `tabs`, `DashboardShell`).
 *
 * Prompt 111 — Micro-interactions: `tailwind.config` (`shimmer-slide`), `globals.css` (motion helpers), `button`,
 * `card`, `input`, `badge`, `tooltip`, `toast`, `skeleton`, `empty-state`; `DashboardShell` nav focus/active + footer strip.
 *
 * Prompt 112 — Brand cohesion: `generateMetadata` + `secondaryColor` on dashboard layout / `DashboardShell` CSS vars;
 * root `metadata` template; `pdf-branding` report title + `brandSignoff`; `resend` + auth footer use `DEFAULT_BRAND_DISPLAY_NAME`;
 * dialog chrome polish.
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

  const calendarStatus = user ? await getCalendarConnectionStatusAction() : { google: false, microsoft: false };

  const coachingPayload = await getSalesCoachingPayloadAction(analytics);

  const sdrManagerPayload = await getSdrManagerPayloadAction({
    analytics,
    deliverabilitySuite,
    calendarStatus,
    hubspotConnected,
    envWarningCount: envWarnings.length,
    workspaceMemberCount: Math.max(1, workspaceData?.members?.length ?? 1),
    coachingPayload,
  });

  const priorityByThread = new Map(
    analytics.leadPriorityLeaderboard.map((r) => [r.thread_id, r]),
  );
  const dealCloseByThread = new Map(
    analytics.dealCloseQualifications.map((r) => [r.thread_id, r]),
  );
  const campaigns = campaignsRaw.map((c) => {
    const p = priorityByThread.get(c.thread_id);
    const d = dealCloseByThread.get(c.thread_id);
    return {
      ...c,
      lead_priority_tier: p?.priority_tier ?? null,
      lead_priority_score: p?.composite_score ?? null,
      deal_close_probability: d?.close_probability ?? null,
      deal_confidence: d?.confidence ?? null,
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
  const [playbooks, knowledgeBaseEntries] = user
    ? await Promise.all([listPlaybooksForWorkspaceAction(), listKnowledgeBaseEntriesAction()])
    : [[], []];

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
      playbooks={playbooks}
      knowledgeBaseEntries={knowledgeBaseEntries}
      coachingPayload={coachingPayload}
      sdrManagerPayload={sdrManagerPayload}
    />
  );
}
