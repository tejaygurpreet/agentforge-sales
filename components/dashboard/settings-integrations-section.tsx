"use client";

import { CalendarIntegrationArt } from "@/components/illustrations/calendar-integration-art";
import { TwilioIntegrationArt } from "@/components/illustrations/twilio-integration-art";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { dashboardOutlineActionClass } from "@/lib/dashboard-action-classes";
import { cn } from "@/lib/utils";
import type { CalendarConnectionStatusDTO } from "@/types";
import { CalendarClock, Phone, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Prompt 136 — Integrations shell + split art cards (calendar, voice) matching HubSpot energy.
 */
export function SettingsIntegrationsSection({ children }: { children: ReactNode }) {
  return (
    <section
      id="workspace-brand-integrations"
      className="scroll-mt-24 space-y-0"
      aria-labelledby="settings-integrations-heading"
    >
      <div
        className={cn(
          "rounded-[var(--card-radius)] border border-border/45 bg-gradient-to-br from-white via-[#FAF7F2] to-muted/35",
          "p-6 shadow-lift ring-1 ring-highlight/10 sm:p-8 lg:p-10",
          "animate-in fade-in slide-in-from-bottom-1 duration-500",
        )}
      >
        <header className="mb-8 flex flex-col gap-4 border-b border-border/35 pb-7 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--card-radius)] bg-gradient-to-br from-sage/15 to-highlight/10 text-sage shadow-inner ring-1 ring-sage/20 transition-transform duration-300 hover:scale-[1.03]">
              <Sparkles className="h-6 w-6" aria-hidden />
            </span>
            <div className="space-y-1.5">
              <h2
                id="settings-integrations-heading"
                className="text-xl font-bold tracking-tight text-foreground sm:text-[1.35rem]"
              >
                Settings &amp; integrations
              </h2>
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                Invite your team, tune branding, and link external tools — optional and workspace-scoped.
              </p>
            </div>
          </div>
        </header>
        <div className="space-y-10">{children}</div>
      </div>
    </section>
  );
}

type CalendarCardProps = {
  calendarStatus: CalendarConnectionStatusDTO;
  onGoToWorkspace: () => void;
};

export function CalendarIntegrationCard({ calendarStatus, onGoToWorkspace }: CalendarCardProps) {
  const googleOn = calendarStatus.google;
  const microsoftOn = calendarStatus.microsoft;
  const anyConnected = googleOn || microsoftOn;

  return (
    <Card
      className={cn(
        "h-full overflow-hidden border-border/50 shadow-[var(--card-shadow-spec)]",
        "transition-all duration-300 hover:-translate-y-1 hover:shadow-glow",
      )}
    >
      <div className="grid min-h-[240px] md:grid-cols-[minmax(160px,0.9fr)_1.1fr]">
        <div className="flex items-center justify-center border-b border-border/40 bg-gradient-to-br from-sage/[0.1] via-card to-terracotta/[0.06] p-5 md:border-b-0 md:border-r">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-[200px]"
          >
            <CalendarIntegrationArt className="h-auto w-full" />
          </motion.div>
        </div>
        <div className="flex flex-col">
          <div className="space-y-3 border-b border-border/35 px-5 py-5 sm:px-6 sm:py-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sage">Scheduling</p>
            <div className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--card-radius)] border border-sage/30 bg-white/90 shadow-inner">
                <CalendarClock className="h-5 w-5 text-sage" aria-hidden />
              </span>
              <div className="min-w-0 space-y-1">
                <h3 className="text-lg font-bold tracking-tight">Calendar OAuth</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Google or Microsoft for AI meeting proposals — connect from the workspace runner.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-4 px-5 py-5 sm:px-6 sm:py-6">
            <div className="flex flex-wrap gap-2">
              <Badge
                variant="outline"
                className={cn(
                  "font-medium",
                  googleOn
                    ? "border-sage/40 bg-sage/10 text-foreground shadow-sm"
                    : "border-border/60 text-muted-foreground",
                )}
              >
                Google {googleOn ? "· linked" : "· not linked"}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  "font-medium",
                  microsoftOn
                    ? "border-sage/40 bg-sage/12 text-foreground shadow-sm"
                    : "border-border/60 text-muted-foreground",
                )}
              >
                Microsoft {microsoftOn ? "· linked" : "· not linked"}
              </Badge>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {anyConnected
                ? "Scheduler on a live campaign can propose times and push invites to your calendar."
                : "Run a campaign and use the workspace card to connect OAuth — tokens stay on the server."}
            </p>
            <Button
              type="button"
              variant="outline"
              className={cn("h-11 w-full gap-2 rounded-[var(--card-radius)] sm:w-auto", dashboardOutlineActionClass)}
              onClick={onGoToWorkspace}
            >
              <CalendarClock className="h-4 w-4" aria-hidden />
              Go to workspace
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

type TwilioCardProps = {
  onViewObjectionLibrary: () => void;
};

export function TwilioVoiceIntegrationCard({ onViewObjectionLibrary }: TwilioCardProps) {
  return (
    <Card
      className={cn(
        "h-full overflow-hidden border-border/50 shadow-[var(--card-shadow-spec)]",
        "transition-all duration-300 hover:-translate-y-1 hover:shadow-glow",
      )}
    >
      <div className="grid min-h-[240px] md:grid-cols-[minmax(160px,0.9fr)_1.1fr]">
        <div className="flex items-center justify-center border-b border-border/40 bg-gradient-to-br from-terracotta/[0.08] via-card to-highlight/[0.08] p-5 md:border-b-0 md:border-r">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="w-full max-w-[200px]"
          >
            <TwilioIntegrationArt className="h-auto w-full" />
          </motion.div>
        </div>
        <div className="flex flex-col">
          <div className="space-y-3 border-b border-border/35 px-5 py-5 sm:px-6 sm:py-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-terracotta">Voice</p>
            <div className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--card-radius)] border border-sage/30 bg-white/90 shadow-inner">
                <Phone className="h-5 w-5 text-sage" aria-hidden />
              </span>
              <div className="min-w-0 space-y-1">
                <h3 className="text-lg font-bold tracking-tight">Twilio &amp; calls</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Inbound voice webhooks and recordings are env-configured; transcripts power the objection
                  library.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-4 px-5 py-5 sm:px-6 sm:py-6">
            <div className="rounded-[var(--card-radius)] border border-border/45 bg-muted/20 p-4 text-sm leading-relaxed text-muted-foreground shadow-inner">
              Configure credentials and webhooks in deployment (see{" "}
              <span className="font-mono text-[13px] text-foreground">/api/twilio/</span>
              ).
            </div>
            <Button
              type="button"
              variant="outline"
              className={cn("h-11 w-full gap-2 rounded-[var(--card-radius)] sm:w-auto", dashboardOutlineActionClass)}
              onClick={onViewObjectionLibrary}
            >
              Open objection library
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
