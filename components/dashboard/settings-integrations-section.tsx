"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { dashboardOutlineActionClass } from "@/lib/dashboard-action-classes";
import { cn } from "@/lib/utils";
import type { CalendarConnectionStatusDTO } from "@/types";
import { CalendarClock, Phone, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Prompt 110 — Unified settings shell: cream gradient, clear hierarchy, scroll target for onboarding (`#workspace-brand-integrations`).
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
          "rounded-[1.75rem] border border-border/45 bg-gradient-to-br from-[#fffdfb] via-[#faf8f5] to-muted/40",
          "p-6 shadow-lift ring-1 ring-black/[0.04] sm:p-8 lg:p-10",
          "animate-in fade-in slide-in-from-bottom-1 duration-500",
        )}
      >
        <header className="mb-8 flex flex-col gap-4 border-b border-border/35 pb-7 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/11 text-primary shadow-sm ring-1 ring-primary/18 transition-transform duration-300 hover:scale-[1.02]">
              <Sparkles className="h-6 w-6" aria-hidden />
            </span>
            <div className="space-y-1.5">
              <h2
                id="settings-integrations-heading"
                className="text-xl font-semibold tracking-tight text-foreground sm:text-[1.35rem]"
              >
                Settings &amp; integrations
              </h2>
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                Invite your team, tune branding, and link external tools — everything stays optional and
                workspace-scoped.
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

/**
 * Read-only status for OAuth calendars; connection UI lives on the active campaign workspace (Prompt 89).
 */
export function CalendarIntegrationCard({ calendarStatus, onGoToWorkspace }: CalendarCardProps) {
  const googleOn = calendarStatus.google;
  const microsoftOn = calendarStatus.microsoft;
  const anyConnected = googleOn || microsoftOn;

  return (
    <Card
      className={cn(
        "h-full overflow-hidden rounded-2xl border-border/55 bg-card shadow-lift ring-1 ring-border/25",
        "transition-all duration-300 hover:-translate-y-0.5 hover:shadow-soft",
      )}
    >
      <CardHeader className="space-y-3 border-b border-border/40 bg-gradient-to-br from-accent/[0.07] via-card to-primary/[0.04] px-6 pb-6 pt-7 sm:px-8 sm:pt-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent-foreground/80">Scheduling</p>
        <div className="flex gap-4">
          <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-accent/35 bg-card shadow-sm">
            <CalendarClock className="h-6 w-6 text-accent-foreground" aria-hidden />
          </div>
          <div className="min-w-0 space-y-2">
            <CardTitle className="text-xl font-semibold tracking-tight">Calendar OAuth</CardTitle>
            <CardDescription className="text-[15px] leading-relaxed text-muted-foreground">
              Google or Microsoft calendar for AI meeting proposals on completed campaigns. Connect once per
              account from the workspace runner.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 px-6 py-8 sm:px-8 sm:py-9">
        <div className="flex flex-wrap gap-2">
          <Badge
            variant="outline"
            className={cn(
              "font-medium",
              googleOn
                ? "border-primary/40 bg-primary/10 text-foreground shadow-sm"
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
                ? "border-primary/40 bg-primary/12 text-foreground shadow-sm"
                : "border-border/60 text-muted-foreground",
            )}
          >
            Microsoft {microsoftOn ? "· linked" : "· not linked"}
          </Badge>
        </div>
        {anyConnected ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Meeting scheduler on a live campaign can propose times and push invites to your calendar.
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">
            When you run a campaign, use the workspace card to connect OAuth — tokens stay on the server.
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          className={cn("h-11 w-full gap-2 rounded-xl sm:w-auto", dashboardOutlineActionClass)}
          onClick={onGoToWorkspace}
        >
          <CalendarClock className="h-4 w-4" aria-hidden />
          Go to workspace
        </Button>
      </CardContent>
    </Card>
  );
}

type TwilioCardProps = {
  onViewObjectionLibrary: () => void;
};

/**
 * Informational — Twilio Voice URL and webhooks are env-configured; objection library consumes transcripts.
 */
export function TwilioVoiceIntegrationCard({ onViewObjectionLibrary }: TwilioCardProps) {
  return (
    <Card
      className={cn(
        "h-full overflow-hidden rounded-2xl border-border/55 bg-card shadow-lift ring-1 ring-border/25",
        "transition-all duration-300 hover:-translate-y-0.5 hover:shadow-soft",
      )}
    >
      <CardHeader className="space-y-3 border-b border-border/40 bg-gradient-to-br from-slate-500/[0.06] via-card to-amber-500/[0.04] px-6 pb-6 pt-7 sm:px-8 sm:pt-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-700/85">Voice</p>
        <div className="flex gap-4">
          <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-400/35 bg-card shadow-sm">
            <Phone className="h-6 w-6 text-slate-700" aria-hidden />
          </div>
          <div className="min-w-0 space-y-2">
            <CardTitle className="text-xl font-semibold tracking-tight">Twilio &amp; calls</CardTitle>
            <CardDescription className="text-[15px] leading-relaxed text-muted-foreground">
              Inbound voice webhooks and recording URLs are set in your deployment environment. Transcripts feed
              the shared objection library for future campaigns.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 px-6 py-8 sm:px-8 sm:py-9">
        <div className="rounded-2xl border border-border/45 bg-muted/25 p-4 text-sm leading-relaxed text-muted-foreground shadow-inner">
          No dashboard token required — configure Twilio credentials and voice webhooks in your deployment
          environment (see API routes under{" "}
          <span className="font-mono text-[13px] text-foreground">/api/twilio/</span>
          ).
        </div>
        <Button
          type="button"
          variant="outline"
          className={cn("h-11 w-full gap-2 rounded-xl sm:w-auto", dashboardOutlineActionClass)}
          onClick={onViewObjectionLibrary}
        >
          Open objection library
        </Button>
      </CardContent>
    </Card>
  );
}
