"use client";

import { SetupIntegrationsHero } from "@/components/illustrations/setup-integrations-hero";
import { GuidedSetupWizard } from "@/components/onboarding/guided-setup-wizard";
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
import { useCallback, useRef } from "react";

type Props = {
  hubspotConnected: boolean;
  calendarStatus: CalendarConnectionStatusDTO;
  whiteLabel: WhiteLabelClientSettingsDTO;
  workspaceMembers: WorkspaceMemberDTO[];
  workspaceRole: WorkspaceMemberRole;
};

/**
 * Prompt 137 — Quiet Luxury setup hub: guided wizard, premium hero, teal/gold accents.
 */
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

  const brandCardRef = useRef<HTMLDivElement>(null);
  const hubSpotCardRef = useRef<HTMLDivElement>(null);
  const calendarCardRef = useRef<HTMLDivElement>(null);
  const twilioCardRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-12 sm:space-y-14">
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="warm-card-veil overflow-hidden rounded-[var(--card-radius)] border border-[#111827]/10 shadow-lift ring-1 ring-[#B45309]/12"
      >
        <div className="relative grid gap-8 px-5 py-8 sm:px-8 sm:py-10 lg:grid-cols-[1fr_minmax(260px,1fr)] lg:items-center">
          <div
            className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-gradient-to-br from-highlight/18 via-terracotta/10 to-transparent blur-3xl motion-safe:animate-glow-orb"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-gradient-to-tr from-sage/22 to-highlight/10 blur-3xl"
            aria-hidden
          />
          <div className="relative z-[1] space-y-4">
            <Badge
              variant="outline"
              className="border-sage/35 bg-white/50 text-[10px] font-bold uppercase tracking-[0.14em] text-sage"
            >
              Integrations
            </Badge>
            <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Connect your stack
            </h1>
            <p className="max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
              Branding, CRM, calendar, and voice — each card below is optional. Use the guided wizard first,
              then wire services at your pace.{" "}
              <Link
                href="/dashboard"
                className="font-semibold text-sage underline-offset-4 transition-colors hover:text-sage/85 hover:underline"
              >
                Back to dashboard
              </Link>
              .
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sage/25 bg-white/60 px-3 py-1 shadow-sm">
                <Cable className="h-3.5 w-3.5 text-sage" aria-hidden />
                Workspace-scoped keys only
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-terracotta/25 bg-white/60 px-3 py-1 shadow-sm">
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
            <div className="animate-float-y rounded-[var(--card-radius)] border border-[#111827]/12 bg-[#F9F6F0] p-4 shadow-inner shadow-glow-copper ring-1 ring-[#B45309]/12 backdrop-blur-[2px]">
              <SetupIntegrationsHero className="h-auto w-full" />
            </div>
          </motion.div>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.08 }}
        className="warm-card-veil rounded-[var(--card-radius)] border border-border/40 px-4 py-6 shadow-[var(--card-shadow-spec)] ring-1 ring-sage/10 sm:px-8 sm:py-8"
      >
        <GuidedSetupWizard
          scrollRefs={{
            brand: brandCardRef,
            hubspot: hubSpotCardRef,
            calendar: calendarCardRef,
            twilio: twilioCardRef,
          }}
        />
      </motion.section>

      <SettingsIntegrationsSection>
        <WorkspaceMembersCard members={workspaceMembers} currentRole={workspaceRole} />
        <div className="space-y-5">
          <div className="flex flex-col gap-1 px-0.5">
            <h3 className="text-base font-bold tracking-tight text-foreground">Brand &amp; connected services</h3>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Illustrations mark each connection — wire what you use; skip the rest.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="lg:col-span-2">
              <WhiteLabelSettingsCard ref={brandCardRef} initial={whiteLabel} />
            </div>
            <div ref={hubSpotCardRef} className="scroll-mt-24 lg:col-span-2">
              <HubSpotConnectSection connected={hubspotConnected} />
            </div>
            <div ref={calendarCardRef} className="scroll-mt-24">
              <CalendarIntegrationCard calendarStatus={calendarStatus} onGoToWorkspace={goToWorkspace} />
            </div>
            <div ref={twilioCardRef} className="scroll-mt-24">
              <TwilioVoiceIntegrationCard />
            </div>
          </div>
        </div>
      </SettingsIntegrationsSection>
    </div>
  );
}
