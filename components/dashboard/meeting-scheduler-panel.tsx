"use client";

import { proposeMeetingAction } from "@/app/(dashboard)/actions";
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
import type { MeetingTimeSuggestion } from "@/agents/types";
import type { CalendarConnectionStatusDTO } from "@/types";
import { CalendarClock, ExternalLink, Loader2, Video } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { toast } from "@/hooks/use-toast";

type Props = {
  threadId: string;
  leadName: string;
  leadEmail: string;
  calendarStatus: CalendarConnectionStatusDTO;
  suggestions: MeetingTimeSuggestion[] | undefined;
  nurtureHint?: string | null;
  responsePatternHint?: string | null;
};

export function MeetingSchedulerPanel({
  threadId,
  leadName,
  leadEmail,
  calendarStatus,
  suggestions,
  nurtureHint,
  responsePatternHint,
}: Props) {
  const [busyIdx, setBusyIdx] = useState<number | null>(null);
  const [providerChoice, setProviderChoice] = useState<"google" | "microsoft">(
    calendarStatus.google ? "google" : "microsoft",
  );

  const onPropose = useCallback(
    async (slot: MeetingTimeSuggestion, idx: number) => {
      setBusyIdx(idx);
      try {
        const res = await proposeMeetingAction({
          thread_id: threadId,
          provider: providerChoice,
          start_iso: slot.start_iso,
          end_iso: slot.end_iso,
          title: `${leadName} @ ${slot.label}`.slice(0, 200),
          body: `AgentForge — meeting with ${leadName} (${leadEmail}).\n${slot.rationale}`,
          attendee_email: leadEmail,
        });
        if (!res.ok) {
          toast({ variant: "destructive", title: "Could not create event", description: res.error });
          return;
        }
        toast({
          title: "Invite added to your calendar",
          description:
            res.html_link && (res.provider === "google" || res.provider === "microsoft")
              ? "Open your calendar app to edit or add guests."
              : "Check your primary calendar.",
        });
        if (res.html_link) {
          window.open(res.html_link, "_blank", "noopener,noreferrer");
        }
      } finally {
        setBusyIdx(null);
      }
    },
    [leadEmail, leadName, providerChoice, threadId],
  );

  const connected = calendarStatus.google || calendarStatus.microsoft;

  return (
    <Card className="rounded-2xl border-violet-500/25 bg-violet-500/[0.04] shadow-md ring-1 ring-violet-500/15 dark:border-violet-400/20 dark:bg-violet-950/25">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start gap-3">
          <div className="rounded-lg border border-violet-500/30 bg-background/90 p-2 shadow-sm">
            <Video className="h-5 w-5 text-violet-600 dark:text-violet-300" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base font-semibold tracking-tight">
              AI meeting scheduler
            </CardTitle>
            <CardDescription className="mt-1">
              After qualification / nurture, the model may propose windows using timezone hints and
              outreach tone. Connect your calendar once, then add a real invite in one click.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {responsePatternHint ? (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Inferred reply cadence:</span>{" "}
            {responsePatternHint.replace(/_/g, " ")}
          </p>
        ) : null}
        {nurtureHint ? (
          <p className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Nurture scheduling note:</span> {nurtureHint}
          </p>
        ) : null}

        {!connected ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button type="button" variant="outline" size="sm" className={cn("gap-2", dashboardOutlineActionClass)} asChild>
              <Link href="/api/calendar/google/start">
                <ExternalLink className="h-4 w-4" aria-hidden />
                Connect Google Calendar
              </Link>
            </Button>
            <Button type="button" variant="outline" size="sm" className={cn("gap-2", dashboardOutlineActionClass)} asChild>
              <Link href="/api/calendar/microsoft/start">
                <ExternalLink className="h-4 w-4" aria-hidden />
                Connect Outlook (Microsoft)
              </Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted-foreground">Create events on:</span>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={providerChoice}
              onChange={(e) => setProviderChoice(e.target.value as "google" | "microsoft")}
              disabled={busyIdx !== null}
            >
              <option value="google" disabled={!calendarStatus.google}>
                Google {calendarStatus.google ? "" : "(not connected)"}
              </option>
              <option value="microsoft" disabled={!calendarStatus.microsoft}>
                Microsoft {calendarStatus.microsoft ? "" : "(not connected)"}
              </option>
            </select>
          </div>
        )}

        {suggestions && suggestions.length > 0 ? (
          <ul className="space-y-3">
            {suggestions.map((s, idx) => (
              <li
                key={`${s.start_iso}-${idx}`}
                className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <CalendarClock className="h-4 w-4 shrink-0 text-violet-600" aria-hidden />
                    {s.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.timezone_hint} · {new Date(s.start_iso).toUTCString()} →{" "}
                    {new Date(s.end_iso).toUTCString()}
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{s.rationale}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0 gap-2"
                  disabled={!connected || busyIdx !== null}
                  onClick={() => void onPropose(s, idx)}
                >
                  {busyIdx === idx ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : null}
                  Propose meeting
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No AI time windows yet — they appear when the model adds optional scheduling fields after
            qualification / nurture (and when a live meeting is a realistic next step).
          </p>
        )}
      </CardContent>
    </Card>
  );
}
