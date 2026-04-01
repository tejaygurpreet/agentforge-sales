"use client";

import { SetupIntegrationsHero } from "@/components/illustrations/setup-integrations-hero";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import {
  CalendarIntegrationCard,
  SettingsIntegrationsSection,
  TwilioVoiceIntegrationCard,
} from "@/components/dashboard/settings-integrations-section";
import { HubSpotConnectSection } from "@/components/dashboard/hubspot-connect-section";
import { WhiteLabelSettingsCard } from "@/components/dashboard/white-label-settings-card";
import { WorkspaceMembersCard } from "@/components/dashboard/workspace-members-card";
import { Badge } from "@/components/ui/badge";
import type { CalendarConnectionStatusDTO, WhiteLabelClientSettingsDTO } from "@/types";
import type { WorkspaceMemberDTO, WorkspaceMemberRole } from "@/types";
import { motion } from "framer-motion";
import { Cable, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";

type Props = {
  hubspotConnected: boolean;
  calendarStatus: CalendarConnectionStatusDTO;
  whiteLabel: WhiteLabelClientSettingsDTO;
  workspaceMembers: WorkspaceMemberDTO[];
  workspaceRole: WorkspaceMemberRole;
};

export function SetupPageClient({
  hubspotConnected,
  calendarStatus,
  whiteLabel,
  workspaceMembers,
  workspaceRole,
}: Props) {
  const goToWorkspace = useCallback(() => {
    window.location.href = "/#campaign-workspace";
  }, []);

  const scrollObjection = useCallback(() => {
    window.location.href = "/#objection-library-section";
  }, []);

  return (
    <div className="space-y-12 sm:space-y-14">
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="overflow-hidden rounded-[var(--card-radius)] border border-coral/20 bg-white shadow-lift ring-1 ring-sage/10 creative-card-surface"
      >
        <div className="relative grid gap-8 px-5 py-8 sm:px-8 sm:py-10 lg:grid-cols-[1fr_minmax(260px,1fr)] lg:items-center">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-gradient-to-br from-coral/25 via-terracotta/12 to-transparent blur-3xl motion-safe:animate-glow-orb" aria-hidden />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-gradient-to-tr from-sage/25 to-coral/10 blur-3xl" aria-hidden />
          <div className="relative z-[1] space-y-4">
            <Badge
              variant="outline"
              className="border-sage/35 bg-sage/[0.08] text-[10px] font-bold uppercase tracking-[0.14em] text-sage"
            >
              Integrations
            </Badge>
            <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl sm:font-bold">
              Connect your stack
            </h1>
            <p className="max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
              Branding, CRM, calendar, and voice — each card below is optional. Finish the guided tour at the
              bottom when you&apos;re ready, or{" "}
              <Link
                href="/"
                className="font-medium text-sage underline-offset-4 transition-colors hover:text-sage/85 hover:underline"
              >
                return to the dashboard
              </Link>
              .
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-card/80 px-3 py-1 shadow-sm">
                <Cable className="h-3.5 w-3.5 text-sage" aria-hidden />
                Workspace-scoped keys only
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-card/80 px-3 py-1 shadow-sm">
                <Sparkles className="h-3.5 w-3.5 text-terracotta" aria-hidden />
                Human review on every send
              </span>
            </div>
          </div>
          <motion.div
            className="relative z-[1] mx-auto w-full max-w-md lg:max-w-none"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="animate-float-y rounded-[var(--card-radius)] border border-coral/25 bg-white/75 p-4 shadow-inner shadow-glow-coral ring-1 ring-sage/15 backdrop-blur-[2px]">
              <SetupIntegrationsHero className="h-auto w-full" />
            </div>
          </motion.div>
        </div>
      </motion.section>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-[var(--card-radius)] border border-border/40 bg-white px-4 py-5 shadow-soft ring-1 ring-black/[0.03] sm:px-6 sm:py-6"
      >
        <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">Quick setup tour</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Step through the same guided flow as before — now with a calmer, illustrated integrations hub above.
        </p>
        <div className="mt-6">
          <OnboardingWizard />
        </div>
      </motion.div>

      <SettingsIntegrationsSection>
        <WorkspaceMembersCard members={workspaceMembers} currentRole={workspaceRole} />
        <div className="space-y-5">
          <div className="flex flex-col gap-1 px-0.5">
            <h3 className="text-base font-semibold tracking-tight text-foreground">Brand &amp; connected services</h3>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Illustrations mark each connection — wire what you use; skip the rest.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="lg:col-span-2">
              <WhiteLabelSettingsCard initial={whiteLabel} />
            </div>
            <div className="lg:col-span-2">
              <HubSpotConnectSection connected={hubspotConnected} />
            </div>
            <CalendarIntegrationCard calendarStatus={calendarStatus} onGoToWorkspace={goToWorkspace} />
            <TwilioVoiceIntegrationCard onViewObjectionLibrary={scrollObjection} />
          </div>
        </div>
      </SettingsIntegrationsSection>
    </div>
  );
}
