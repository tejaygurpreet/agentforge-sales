"use client";

import {
  bookPersonalizedDemoAction,
  generatePersonalizedDemoScriptAction,
  recordDemoOutcomeAction,
} from "@/app/(dashboard)/actions";
import type { MeetingTimeSuggestion } from "@/agents/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { dashboardOutlineActionClass } from "@/lib/dashboard-action-classes";
import { cn } from "@/lib/utils";
import type { CalendarConnectionStatusDTO, PersonalizedDemoScriptDTO } from "@/types";
import { CalendarClock, Loader2, Sparkles, Video } from "lucide-react";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "@/hooks/use-toast";

type Props = {
  threadId: string;
  leadName: string;
  leadEmail: string;
  leadCompany: string;
  calendarStatus: CalendarConnectionStatusDTO;
  suggestions: MeetingTimeSuggestion[] | undefined;
  /** Persisted row when this thread exists in recent campaigns list. */
  persistedDemo?: {
    demo_status: string | null;
    demo_script: Record<string, unknown> | null;
    demo_outcome: Record<string, unknown> | null;
  } | null;
};

function scriptFromPersisted(raw: Record<string, unknown> | null): PersonalizedDemoScriptDTO | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.title !== "string" || typeof o.opening !== "string") return null;
  return {
    title: o.title,
    opening: o.opening,
    agenda: Array.isArray(o.agenda) ? o.agenda.filter((x): x is string => typeof x === "string") : [],
    discovery_questions: Array.isArray(o.discovery_questions)
      ? o.discovery_questions.filter((x): x is string => typeof x === "string")
      : [],
    proof_points: Array.isArray(o.proof_points)
      ? o.proof_points.filter((x): x is string => typeof x === "string")
      : [],
    closing: typeof o.closing === "string" ? o.closing : "",
    invite_email_paragraph:
      typeof o.invite_email_paragraph === "string" ? o.invite_email_paragraph : "",
    booking_cta: typeof o.booking_cta === "string" ? o.booking_cta : "",
  };
}

/**
 * Prompt 100 — high-qualification leads: AI demo script + one-click calendar booking.
 */
export function PersonalizedDemoBookingCard({
  threadId,
  leadName,
  leadEmail,
  leadCompany,
  calendarStatus,
  suggestions,
  persistedDemo,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [script, setScript] = useState<PersonalizedDemoScriptDTO | null>(() =>
    persistedDemo?.demo_script ? scriptFromPersisted(persistedDemo.demo_script) : null,
  );
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const [provider, setProvider] = useState<"google" | "microsoft">(
    calendarStatus.google ? "google" : "microsoft",
  );

  const connected = calendarStatus.google || calendarStatus.microsoft;

  const outcomeHint = useMemo(() => {
    const o = persistedDemo?.demo_outcome;
    if (!o || typeof o !== "object") return null;
    const rec = (o as { recorded_session?: { outcome?: string } }).recorded_session;
    return rec?.outcome ?? null;
  }, [persistedDemo?.demo_outcome]);

  const onGenerate = useCallback(() => {
    startTransition(async () => {
      const res = await generatePersonalizedDemoScriptAction({ thread_id: threadId });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Could not generate script", description: res.error });
        return;
      }
      setScript(res.script);
      toast({ title: "Demo script ready", description: "Review below, then book a slot on your calendar." });
    });
  }, [threadId]);

  const onBook = useCallback(
    (slot: MeetingTimeSuggestion, idx: number) => {
      setBusySlot(idx);
      startTransition(async () => {
        const res = await bookPersonalizedDemoAction({
          thread_id: threadId,
          provider,
          start_iso: slot.start_iso,
          end_iso: slot.end_iso,
        });
        setBusySlot(null);
        if (!res.ok) {
          toast({ variant: "destructive", title: "Booking failed", description: res.error });
          return;
        }
        toast({
          title: "Demo invite created",
          description: "Check your calendar — the prospect is invited when email is on file.",
        });
        if (res.html_link) {
          window.open(res.html_link, "_blank", "noopener,noreferrer");
        }
      });
    },
    [provider, threadId],
  );

  const onRecordOutcome = useCallback(
    (outcome: "completed" | "no_show" | "cancelled") => {
      startTransition(async () => {
        const res = await recordDemoOutcomeAction({ thread_id: threadId, outcome });
        if (!res.ok) {
          toast({ variant: "destructive", title: "Could not save outcome", description: res.error });
          return;
        }
        toast({ title: "Outcome saved", description: "Used to tune future playbooks." });
      });
    },
    [threadId],
  );

  return (
    <Card className="rounded-2xl border-teal-500/25 bg-teal-500/[0.04] shadow-md ring-1 ring-teal-500/15 dark:border-teal-400/20 dark:bg-teal-950/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Video className="h-5 w-5 text-teal-600 dark:text-teal-400" aria-hidden />
          Personalized demo
        </CardTitle>
        <CardDescription>
          For <span className="font-medium text-foreground">{leadName}</span> at{" "}
          <span className="font-medium text-foreground">{leadCompany}</span> — after strong qualification,
          generate a tailored run-of-show and book a live session. Your calendar creates the invite with
          the script in the description (Prompt 100).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="gap-2"
            disabled={pending}
            onClick={onGenerate}
          >
            {pending && !script ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Book personalized demo — generate script
          </Button>
          {persistedDemo?.demo_status ? (
            <span className="self-center text-xs text-muted-foreground">
              Status: <span className="font-medium text-foreground">{persistedDemo.demo_status}</span>
            </span>
          ) : null}
          {outcomeHint ? (
            <span className="self-center text-xs text-muted-foreground">
              Last outcome: <span className="font-medium">{outcomeHint}</span>
            </span>
          ) : null}
        </div>

        {script ? (
          <div className="space-y-3 rounded-xl border border-border/60 bg-background/80 p-4 text-sm">
            <p className="font-semibold text-foreground">{script.title}</p>
            <p className="text-muted-foreground leading-relaxed">{script.opening}</p>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Agenda</p>
              <ul className="list-inside list-decimal space-y-1 text-muted-foreground">
                {script.agenda.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">
              Full script is attached to the calendar invite when you book a slot below.
              {leadEmail ? (
                <>
                  {" "}
                  Attendee: <span className="font-mono text-[11px]">{leadEmail}</span>
                </>
              ) : null}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Generate a script to preview talking points before sending a calendar invite.
          </p>
        )}

        {!connected ? (
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Connect Google or Microsoft calendar (Prompt 89) to create demo events in one click.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Label htmlFor="demo-cal-provider" className="text-xs font-medium text-muted-foreground">
                Calendar
              </Label>
              <select
                id="demo-cal-provider"
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={provider}
                onChange={(e) => setProvider(e.target.value as "google" | "microsoft")}
              >
                <option value="google" disabled={!calendarStatus.google}>
                  Google {calendarStatus.google ? "" : "(not connected)"}
                </option>
                <option value="microsoft" disabled={!calendarStatus.microsoft}>
                  Microsoft {calendarStatus.microsoft ? "" : "(not connected)"}
                </option>
              </select>
            </div>
            {suggestions && suggestions.length > 0 ? (
              <div>
                <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                  Optimal slots (from your pipeline)
                </p>
                <ul className="space-y-2">
                  {suggestions.map((slot, idx) => (
                    <li
                      key={`${slot.start_iso}-${idx}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium">{slot.label}</p>
                        <p className="text-xs text-muted-foreground">{slot.rationale}</p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={cn(dashboardOutlineActionClass)}
                        disabled={pending || busySlot !== null || !connected}
                        onClick={() => onBook(slot, idx)}
                      >
                        {busySlot === idx ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Create demo invite"
                        )}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No AI time suggestions yet — run qualification/nurture to populate slots, or connect
                calendar and generate a script first; you can still create events from the Meeting panel.
              </p>
            )}
          </>
        )}

        <div className="border-t border-border/50 pt-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">After the session (playbook learning)</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => onRecordOutcome("completed")}
            >
              Mark completed
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => onRecordOutcome("no_show")}
            >
              No-show
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => onRecordOutcome("cancelled")}
            >
              Cancelled
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
