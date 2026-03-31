"use client";

import type {
  AbTestExperimentRow,
  BatchRunItem,
  CallTranscriptRow,
  CalendarConnectionStatusDTO,
  CampaignSequenceRow,
  CampaignTemplateRow,
  CampaignThreadRow,
  CustomVoiceRow,
  DashboardAnalyticsSummary,
  KnowledgeBaseEntryRow,
  ObjectionLibraryEntryRow,
  PersistedCampaignRow,
  PlaybookRow,
  SalesCoachingPayloadDTO,
  ScheduledReportRow,
  SdrManagerPayloadDTO,
} from "@/types";
import { ActiveAgents } from "@/components/dashboard/active-agents";
import { AnalyticsDashboard } from "@/components/dashboard/analytics-dashboard";
import { LeadPrioritySection } from "@/components/dashboard/lead-priority-section";
import { DealClosePanel } from "@/components/dashboard/deal-close-panel";
import { OptimizerPanel } from "@/components/dashboard/optimizer-panel";
import { QualificationObjectionPanel } from "@/components/dashboard/qualification-objection-panel";
import { CampaignList } from "@/components/dashboard/campaign-list";
import { BetaProgramSignupCard } from "@/components/dashboard/beta-program-signup-card";
import type { CampaignRerunPayload } from "@/components/dashboard/campaign-rerun-types";
import { CampaignTemplatesSection } from "@/components/dashboard/campaign-templates-section";
import { DashboardCampaignRunner } from "@/components/dashboard/dashboard-campaign-runner";
import { CustomVoicesSection } from "@/components/dashboard/custom-voices-section";
import { HubSpotConnectSection } from "@/components/dashboard/hubspot-connect-section";
import { CompetitiveEdgePanel } from "@/components/dashboard/competitive-edge-panel";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { ProductRoadmapSection } from "@/components/dashboard/product-roadmap-section";
import { ReportsSection } from "@/components/dashboard/reports-section";
import { AbTestingSection } from "@/components/dashboard/ab-testing-section";
import { SequencesSection } from "@/components/dashboard/sequences-section";
import { WorkspaceMembersCard } from "@/components/dashboard/workspace-members-card";
import { DeliverabilityCoachWidget } from "@/components/dashboard/deliverability-coach-widget";
import { DeliverabilityPanel } from "@/components/dashboard/deliverability-panel";
import {
  CalendarIntegrationCard,
  SettingsIntegrationsSection,
  TwilioVoiceIntegrationCard,
} from "@/components/dashboard/settings-integrations-section";
import { WhiteLabelSettingsCard } from "@/components/dashboard/white-label-settings-card";
import { ObjectionLibrarySection } from "@/components/dashboard/objection-library-section";
import { PlaybooksSection } from "@/components/dashboard/playbooks-section";
import { SalesCoachingSection } from "@/components/dashboard/sales-coaching-section";
import { SdrManagerSection } from "@/components/dashboard/sdr-manager-section";
import { FirstRunSetupBanner } from "@/components/onboarding/first-run-setup-banner";
import { PwaBanner } from "@/components/pwa/pwa-banner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { DeliverabilitySuitePayload, WhiteLabelClientSettingsDTO } from "@/types";
import type { WorkspaceMemberDTO, WorkspaceMemberRole } from "@/types";

type Props = {
  envWarnings: string[];
  campaigns: CampaignThreadRow[];
  recentCampaigns: PersistedCampaignRow[];
  analytics: DashboardAnalyticsSummary;
  /** Resolved Resend `From` for the signed-in user (same as campaign sends). */
  outboundFromPreview: string;
  /** HubSpot Private App token stored server-side. */
  hubspotConnected: boolean;
  /** Prompt 78 — user-defined SDR voices from `custom_voices`. */
  customVoices: CustomVoiceRow[];
  /** Prompt 79 — white-label row for forms + PDF merge. */
  whiteLabel: WhiteLabelClientSettingsDTO | null;
  /** Prompt 80 — warm-up logs + prefs. */
  deliverabilitySuite: DeliverabilitySuitePayload | null;
  /** Prompt 81 — team roster for active workspace. */
  workspaceMembers: WorkspaceMemberDTO[];
  workspaceRole: WorkspaceMemberRole;
  /** Prompt 83 — AI-transcribed calls + objections for active workspace. */
  objectionLibraryTranscripts: CallTranscriptRow[];
  objectionLibraryEntries: ObjectionLibraryEntryRow[];
  /** Prompt 85 — saved campaign templates for the active workspace. */
  campaignTemplates: CampaignTemplateRow[];
  /** Prompt 88 — saved multi-channel sequences. */
  campaignSequences: CampaignSequenceRow[];
  /** Prompt 90 — `ab_tests` registry rows for the workspace. */
  abTestExperiments: AbTestExperimentRow[];
  /** Prompt 86 — scheduled report rows + recipient default. */
  scheduledReports: ScheduledReportRow[];
  reportRecipientEmail: string;
  /** Prompt 89 — Google / Microsoft calendar OAuth for meeting proposals. */
  calendarStatus: CalendarConnectionStatusDTO;
  /** Prompt 97 — saved playbooks + knowledge base rows. */
  playbooks: PlaybookRow[];
  knowledgeBaseEntries: KnowledgeBaseEntryRow[];
  /** Prompt 101 — AI coaching + performance payload. */
  coachingPayload: SalesCoachingPayloadDTO;
  /** Prompt 102 — executive KPIs, health, cached executive report. */
  sdrManagerPayload: SdrManagerPayloadDTO;
};

/**
 * Prompt 70 — client shell: batch progress to Active agents, Workspace | Analytics tabs.
 * Prompt 84 — PWA banner (SW + optional push) + scrollable tabs on small screens.
 * Prompt 85 — Templates tab (library + A/B voice runner).
 * Prompt 86 — Reports tab (PDF/CSV + scheduled emails).
 * Prompt 97 — Playbooks tab (AI playbook generator + living knowledge base).
 * Prompt 99 — `DeliverabilityCoachWidget` on Workspace + coach in `DeliverabilityPanel`.
 * Prompt 101 — Coaching tab (`SalesCoachingSection`) + `coachingPreview` on analytics.
 * Prompt 102 — SDR Manager tab (`SdrManagerSection`) + analytics/reports entry points.
 * Prompt 103 — Light aesthetic spacing, tab chrome, env banner styling (tokens from `globals.css`).
 * Prompt 104 — Workspace tab: guided campaign runner order + polished recent list & active agents.
 * Prompt 106 — Team (`WorkspaceMembersCard`), brand & integrations (`WhiteLabelSettingsCard`, `HubSpotConnectSection`),
 * layout group on the home stack; `DashboardShell` nav (active routes, icons, mobile sheet).
 * Prompt 107 — Auth pages `(auth)/layout`, polished `login-form` / `signup-form`; `/onboarding` wizard +
 * `FirstRunSetupBanner` (localStorage dismiss); `Setup` nav link.
 * Prompt 108 — `EmptyState` + analytics/reports visual polish; richer empty surfaces on list/priority cards.
 * Prompt 110 — `SettingsIntegrationsSection` + Calendar / Twilio cards; shared UI polish (button, card, dialog, tabs, shell).
 * Prompt 114 — Entrance timing, tab affordances, env banner harmony with light tokens.
 * Prompt 115 — Inbox tab (`ProfessionalInbox`): threaded replies + Analyze with AI.
 * Prompt 116 — Inline AI analysis + filters + prefetched threads.
 * Prompt 119 — Inbox badge, `/?tab=inbox`, realtime toast bridge.
 */
export function DashboardHomeClient({
  envWarnings,
  campaigns,
  recentCampaigns,
  analytics,
  outboundFromPreview,
  hubspotConnected,
  customVoices,
  whiteLabel,
  deliverabilitySuite,
  workspaceMembers,
  workspaceRole,
  objectionLibraryTranscripts,
  objectionLibraryEntries,
  campaignTemplates,
  campaignSequences,
  abTestExperiments,
  scheduledReports,
  reportRecipientEmail,
  calendarStatus,
  playbooks,
  knowledgeBaseEntries,
  coachingPayload,
  sdrManagerPayload,
}: Props) {
  const router = useRouter();
  const [batchProgress, setBatchProgress] = useState<BatchRunItem[] | null>(null);
  const [mainTab, setMainTab] = useState("workspace");
  const [templatePrefill, setTemplatePrefill] = useState<CampaignRerunPayload | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("tab") === "inbox") {
      router.replace("/inbox");
    }
  }, [router]);
  const [sequencePrefill, setSequencePrefill] = useState<{ id: string; nonce: number } | null>(null);

  const onTemplatePrefillConsumed = useCallback(() => {
    setTemplatePrefill(null);
  }, []);

  const onApplyTemplateToWorkspace = useCallback((payload: CampaignRerunPayload) => {
    setTemplatePrefill(payload);
    setMainTab("workspace");
  }, []);

  const onApplySequenceToWorkspace = useCallback((sequenceId: string) => {
    setSequencePrefill({ id: sequenceId, nonce: Date.now() });
    setMainTab("workspace");
  }, []);

  const goToWorkspaceForIntegrations = useCallback(() => {
    setMainTab("workspace");
    window.setTimeout(() => {
      document.getElementById("campaign-workspace")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  }, []);

  const scrollToObjectionLibrary = useCallback(() => {
    document.getElementById("objection-library-section")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  return (
    <div className="mx-auto max-w-6xl animate-in fade-in slide-in-from-bottom-2 space-y-11 px-4 py-2 duration-500 ease-out sm:space-y-14 sm:px-5 sm:py-4 lg:px-6">
      <PwaBanner />
      <FirstRunSetupBanner />
      <DashboardHero outboundFromPreview={outboundFromPreview} whiteLabel={whiteLabel} />

      <SettingsIntegrationsSection>
        <WorkspaceMembersCard members={workspaceMembers} currentRole={workspaceRole} />
        <div className="space-y-5">
          <div className="flex flex-col gap-1 px-0.5">
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              Brand &amp; connected services
            </h3>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Appearance, CRM, calendar, and voice — wire what you use; skip anything you don&apos;t need.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {whiteLabel ? (
              <div className="lg:col-span-3">
                <WhiteLabelSettingsCard initial={whiteLabel} />
              </div>
            ) : null}
            <HubSpotConnectSection connected={hubspotConnected} />
            <CalendarIntegrationCard
              calendarStatus={calendarStatus}
              onGoToWorkspace={goToWorkspaceForIntegrations}
            />
            <TwilioVoiceIntegrationCard onViewObjectionLibrary={scrollToObjectionLibrary} />
          </div>
        </div>
      </SettingsIntegrationsSection>

      <ObjectionLibrarySection
        transcripts={objectionLibraryTranscripts}
        objections={objectionLibraryEntries}
      />

      <CompetitiveEdgePanel />

      {envWarnings.length > 0 ? (
        <div
          role="region"
          aria-label="Environment configuration hints"
          className="rounded-2xl border border-amber-300/55 bg-gradient-to-br from-amber-50/95 via-card to-orange-50/35 px-5 py-4 text-sm text-amber-950 shadow-soft ring-1 ring-amber-200/40"
        >
          <p className="font-semibold">Configuration</p>
          <ul className="mt-2 list-inside list-disc space-y-1.5 text-amber-900/90">
            {envWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <ActiveAgents batchProgress={batchProgress} />

      <DeliverabilityCoachWidget
        suite={deliverabilitySuite}
        onOpenDeliverability={() => setMainTab("deliverability")}
      />

      <ProductRoadmapSection
        analyticsPreview={{
          campaignCount: analytics.campaignCount,
          avgCompositeScore: analytics.avgCompositeScore,
          replyAnalyzedCount: analytics.replyAnalyzedCount,
        }}
      />

      <Tabs value={mainTab} onValueChange={setMainTab} className="w-full">
        <TabsList className="flex h-auto w-full max-w-6xl flex-nowrap justify-start gap-1 overflow-x-auto border-border/40 bg-muted/50 p-1.5 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:grid sm:grid-cols-10 sm:overflow-visible sm:pb-1.5 [&::-webkit-scrollbar]:hidden">
          <TabsTrigger
            value="workspace"
            className="shrink-0 transition-all duration-200 data-[state=active]:shadow-soft"
          >
            Workspace
          </TabsTrigger>
          <TabsTrigger
            value="sdr-manager"
            className="shrink-0 transition-all duration-200 data-[state=active]:shadow-soft"
          >
            SDR Manager
          </TabsTrigger>
          <TabsTrigger
            value="analytics"
            className="shrink-0 transition-all duration-200 data-[state=active]:shadow-soft"
          >
            Analytics
          </TabsTrigger>
          <TabsTrigger
            value="coaching"
            className="shrink-0 transition-all duration-200 data-[state=active]:shadow-soft"
          >
            Coaching
          </TabsTrigger>
          <TabsTrigger
            value="templates"
            className="shrink-0 transition-all duration-200 data-[state=active]:shadow-soft"
          >
            Templates
          </TabsTrigger>
          <TabsTrigger
            value="sequences"
            className="shrink-0 transition-all duration-200 data-[state=active]:shadow-soft"
          >
            Sequences
          </TabsTrigger>
          <TabsTrigger
            value="reports"
            className="shrink-0 transition-all duration-200 data-[state=active]:shadow-soft"
          >
            Reports
          </TabsTrigger>
          <TabsTrigger
            value="playbooks"
            className="shrink-0 transition-all duration-200 data-[state=active]:shadow-soft"
          >
            Playbooks
          </TabsTrigger>
          <TabsTrigger
            value="deliverability"
            className="shrink-0 transition-all duration-200 data-[state=active]:shadow-soft"
          >
            Deliverability
          </TabsTrigger>
          <TabsTrigger
            value="voices"
            className="shrink-0 transition-all duration-200 data-[state=active]:shadow-soft"
          >
            Custom voices
          </TabsTrigger>
        </TabsList>
        <TabsContent value="workspace" className="space-y-11 sm:space-y-14">
          <LeadPrioritySection
            rows={analytics.leadPriorityLeaderboard}
            summary={analytics.leadPrioritySummary}
          />
          <QualificationObjectionPanel
            qualificationRows={analytics.qualificationInsights}
            objectionCards={analytics.replyObjectionCards}
          />
          <DealClosePanel
            rows={analytics.dealCloseQualifications}
            avgCloseProbability={analytics.avgCloseProbability}
          />
          <OptimizerPanel mode="feed" rows={analytics.optimizerFeed} />
          <CampaignList campaigns={campaigns} />
          <DashboardCampaignRunner
            recentCampaigns={recentCampaigns}
            onBatchProgressChange={setBatchProgress}
            hubspotConnected={hubspotConnected}
            customVoices={customVoices}
            whiteLabel={whiteLabel}
            templatePrefillRequest={templatePrefill}
            onTemplatePrefillConsumed={onTemplatePrefillConsumed}
            campaignSequences={campaignSequences}
            sequencePrefillRequest={sequencePrefill}
            onSequencePrefillConsumed={() => setSequencePrefill(null)}
            calendarStatus={calendarStatus}
          />
          <BetaProgramSignupCard />
        </TabsContent>
        <TabsContent value="sdr-manager" className="space-y-8 pt-2">
          <SdrManagerSection
            initial={sdrManagerPayload}
            onOpenDeliverability={() => setMainTab("deliverability")}
            onOpenCoaching={() => setMainTab("coaching")}
          />
        </TabsContent>
        <TabsContent value="analytics">
          <AnalyticsDashboard
            data={analytics}
            variant="embedded"
            onOpenCoachingTab={() => setMainTab("coaching")}
            onOpenSdrManagerTab={() => setMainTab("sdr-manager")}
          />
        </TabsContent>
        <TabsContent value="coaching" className="space-y-8 pt-2">
          <SalesCoachingSection
            initial={coachingPayload}
            analytics={analytics}
            workspaceMembers={workspaceMembers}
          />
        </TabsContent>
        <TabsContent value="templates" className="space-y-8 pt-2">
          <CampaignTemplatesSection
            templates={campaignTemplates}
            recentCampaigns={recentCampaigns}
            onTemplatesChange={() => router.refresh()}
            onApplyToWorkspace={onApplyTemplateToWorkspace}
          />
        </TabsContent>
        <TabsContent value="sequences" className="space-y-8 pt-2">
          <AbTestingSection
            campaignSequences={campaignSequences}
            campaignTemplates={campaignTemplates}
            initialExperiments={abTestExperiments}
          />
          <SequencesSection
            sequences={campaignSequences}
            onSequencesChange={() => router.refresh()}
            onApplyToWorkspace={onApplySequenceToWorkspace}
          />
        </TabsContent>
        <TabsContent value="reports" className="space-y-8 pt-2">
          <ReportsSection
            workspaceMembers={workspaceMembers}
            scheduledReports={scheduledReports}
            defaultRecipientEmail={reportRecipientEmail}
            onOpenSdrManagerTab={() => setMainTab("sdr-manager")}
          />
        </TabsContent>
        <TabsContent value="playbooks" className="space-y-8 pt-2">
          <PlaybooksSection
            recentCampaigns={recentCampaigns}
            initialPlaybooks={playbooks}
            initialKnowledge={knowledgeBaseEntries}
          />
        </TabsContent>
        <TabsContent value="deliverability" className="pt-2">
          <DeliverabilityPanel initial={deliverabilitySuite} analytics={analytics} />
        </TabsContent>
        <TabsContent value="voices" className="space-y-8 pt-2">
          <CustomVoicesSection initialVoices={customVoices} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
