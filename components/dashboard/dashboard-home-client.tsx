"use client";

import type {
  BatchRunItem,
  CallTranscriptRow,
  CalendarConnectionStatusDTO,
  CampaignSequenceRow,
  CampaignTemplateRow,
  CampaignThreadRow,
  CustomVoiceRow,
  DashboardAnalyticsSummary,
  ObjectionLibraryEntryRow,
  PersistedCampaignRow,
  ScheduledReportRow,
} from "@/types";
import { ActiveAgents } from "@/components/dashboard/active-agents";
import { AnalyticsDashboard } from "@/components/dashboard/analytics-dashboard";
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
import { SequencesSection } from "@/components/dashboard/sequences-section";
import { WorkspaceMembersCard } from "@/components/dashboard/workspace-members-card";
import { DeliverabilityPanel } from "@/components/dashboard/deliverability-panel";
import { WhiteLabelSettingsCard } from "@/components/dashboard/white-label-settings-card";
import { ObjectionLibrarySection } from "@/components/dashboard/objection-library-section";
import { PwaBanner } from "@/components/pwa/pwa-banner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
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
  /** Prompt 86 — scheduled report rows + recipient default. */
  scheduledReports: ScheduledReportRow[];
  reportRecipientEmail: string;
  /** Prompt 89 — Google / Microsoft calendar OAuth for meeting proposals. */
  calendarStatus: CalendarConnectionStatusDTO;
};

/**
 * Prompt 70 — client shell: batch progress to Active agents, Workspace | Analytics tabs.
 * Prompt 84 — PWA banner (SW + optional push) + scrollable tabs on small screens.
 * Prompt 85 — Templates tab (library + A/B voice runner).
 * Prompt 86 — Reports tab (PDF/CSV + scheduled emails).
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
  scheduledReports,
  reportRecipientEmail,
  calendarStatus,
}: Props) {
  const router = useRouter();
  const [batchProgress, setBatchProgress] = useState<BatchRunItem[] | null>(null);
  const [mainTab, setMainTab] = useState("workspace");
  const [templatePrefill, setTemplatePrefill] = useState<CampaignRerunPayload | null>(null);
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

  return (
    <div className="mx-auto max-w-6xl animate-in fade-in slide-in-from-bottom-2 space-y-10 px-4 py-6 duration-700 sm:space-y-12 sm:px-6 sm:py-8 lg:px-8">
      <PwaBanner />
      <DashboardHero outboundFromPreview={outboundFromPreview} whiteLabel={whiteLabel} />

      {whiteLabel ? <WhiteLabelSettingsCard initial={whiteLabel} /> : null}
      <WorkspaceMembersCard members={workspaceMembers} currentRole={workspaceRole} />

      <ObjectionLibrarySection
        transcripts={objectionLibraryTranscripts}
        objections={objectionLibraryEntries}
      />

      <HubSpotConnectSection connected={hubspotConnected} />

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

      <Tabs value={mainTab} onValueChange={setMainTab} className="w-full">
        <TabsList className="flex h-auto w-full max-w-6xl flex-nowrap justify-start gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:grid sm:grid-cols-7 sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden">
          <TabsTrigger
            value="workspace"
            className="shrink-0 transition-all duration-200 data-[state=active]:shadow-md"
          >
            Workspace
          </TabsTrigger>
          <TabsTrigger
            value="analytics"
            className="shrink-0 transition-all duration-200 data-[state=active]:shadow-md"
          >
            Analytics
          </TabsTrigger>
          <TabsTrigger
            value="templates"
            className="shrink-0 transition-all duration-200 data-[state=active]:shadow-md"
          >
            Templates
          </TabsTrigger>
          <TabsTrigger
            value="sequences"
            className="shrink-0 transition-all duration-200 data-[state=active]:shadow-md"
          >
            Sequences
          </TabsTrigger>
          <TabsTrigger
            value="reports"
            className="shrink-0 transition-all duration-200 data-[state=active]:shadow-md"
          >
            Reports
          </TabsTrigger>
          <TabsTrigger
            value="deliverability"
            className="shrink-0 transition-all duration-200 data-[state=active]:shadow-md"
          >
            Deliverability
          </TabsTrigger>
          <TabsTrigger
            value="voices"
            className="shrink-0 transition-all duration-200 data-[state=active]:shadow-md"
          >
            Custom voices
          </TabsTrigger>
        </TabsList>
        <TabsContent value="workspace" className="space-y-10 sm:space-y-12">
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
        <TabsContent value="analytics">
          <AnalyticsDashboard data={analytics} variant="embedded" />
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
