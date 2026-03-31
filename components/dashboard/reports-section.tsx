"use client";

import {
  deleteScheduledReportAction,
  generateAdvancedReportAction,
  saveScheduledReportAction,
} from "@/app/(dashboard)/actions";
import type { ReportFiltersPayload } from "@/types";
import { SDR_VOICE_OPTIONS } from "@/lib/sdr-voice";
import type { ScheduledReportRow, WorkspaceMemberDTO } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { FileDown, Loader2, Mail, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "@/hooks/use-toast";

const VOICE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All voices" },
  { value: "custom:any", label: "Any custom voice" },
  ...SDR_VOICE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
];

const WEEKDAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

type Props = {
  workspaceMembers: WorkspaceMemberDTO[];
  scheduledReports: ScheduledReportRow[];
  defaultRecipientEmail: string;
  /** Prompt 102 — jump to SDR Manager on the main dashboard. */
  onOpenSdrManagerTab?: () => void;
};

/**
 * Prompt 86 — filters, PDF/CSV export, scheduled email reports.
 */
export function ReportsSection({
  workspaceMembers,
  scheduledReports,
  defaultRecipientEmail,
  onOpenSdrManagerTab,
}: Props) {
  const router = useRouter();
  const [filters, setFilters] = useState<ReportFiltersPayload>({
    dateFrom: null,
    dateTo: null,
    voice: "all",
    memberUserId: "all",
  });
  const [genBusy, setGenBusy] = useState<"pdf" | "csv" | null>(null);
  const [recipientEmail, setRecipientEmail] = useState(defaultRecipientEmail);
  const [cadence, setCadence] = useState<"daily" | "weekly">("weekly");
  const [hourUtc, setHourUtc] = useState(8);
  const [weekdayUtc, setWeekdayUtc] = useState(1);
  const [scheduleBusy, setScheduleBusy] = useState(false);

  const activeMembers = workspaceMembers.filter((m) => m.user_id && m.status === "active");

  const downloadBlob = useCallback((content: BlobPart, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const onGenerate = useCallback(
    async (format: "pdf" | "csv") => {
      setGenBusy(format);
      try {
        const res = await generateAdvancedReportAction({ format, filters });
        if (!res.ok) {
          toast({ variant: "destructive", title: "Report failed", description: res.error });
          return;
        }
        if (res.format === "csv") {
          downloadBlob(res.csv, res.filename, "text/csv;charset=utf-8");
        } else {
          const bin = atob(res.pdfBase64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          downloadBlob(bytes, res.filename, "application/pdf");
        }
        toast({
          title: "Report ready",
          description: `${res.metrics.campaignCount} campaigns · ${res.metrics.replyCount} replies (filtered).`,
        });
      } finally {
        setGenBusy(null);
      }
    },
    [filters, downloadBlob],
  );

  const onSaveSchedule = useCallback(async () => {
    if (!recipientEmail.trim()) {
      toast({ variant: "destructive", title: "Enter recipient email." });
      return;
    }
    setScheduleBusy(true);
    try {
      const res = await saveScheduledReportAction({
        recipient_email: recipientEmail.trim(),
        cadence,
        hour_utc: hourUtc,
        weekday_utc: cadence === "weekly" ? weekdayUtc : null,
        filters,
      });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Could not save schedule", description: res.error });
        return;
      }
      toast({ title: "Schedule saved", description: "Emails send on the next UTC window (cron)." });
      router.refresh();
    } finally {
      setScheduleBusy(false);
    }
  }, [recipientEmail, cadence, hourUtc, weekdayUtc, filters, router]);

  const onDeleteSchedule = useCallback(
    async (id: string) => {
      const res = await deleteScheduledReportAction(id);
      if (!res.ok) {
        toast({ variant: "destructive", title: "Delete failed", description: res.error });
        return;
      }
      toast({ title: "Schedule removed" });
      router.refresh();
    },
    [router],
  );

  return (
    <div className="space-y-8">
      {onOpenSdrManagerTab ? (
        <Card className="border-sky-500/25 bg-sky-500/[0.04] shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Executive narrative (Prompt 102)</CardTitle>
            <CardDescription>
              PDF/CSV below are data exports. For leadership-ready AI summaries, ROI, and system health, use
              the SDR Manager tab.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" size="sm" variant="outline" onClick={onOpenSdrManagerTab}>
              Open SDR Manager tab
            </Button>
          </CardContent>
        </Card>
      ) : null}
      <Card className="border-border/70 bg-card/90 shadow-md">
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
          <CardDescription>
            Narrow campaigns and reply analyses by date (created time), SDR voice, or team member.
            Times use workspace campaign rows; reply rows match the same filters.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="rep-from">From (UTC date)</Label>
            <Input
              id="rep-from"
              type="date"
              value={filters.dateFrom ?? ""}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  dateFrom: e.target.value ? e.target.value : null,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rep-to">To (UTC date)</Label>
            <Input
              id="rep-to"
              type="date"
              value={filters.dateTo ?? ""}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  dateTo: e.target.value ? e.target.value : null,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rep-voice">Voice</Label>
            <select
              id="rep-voice"
              className={cn(
                "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
              value={filters.voice}
              onChange={(e) => setFilters((f) => ({ ...f, voice: e.target.value }))}
            >
              {VOICE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rep-member">Team member (campaign owner)</Label>
            <select
              id="rep-member"
              className={cn(
                "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
              value={filters.memberUserId}
              onChange={(e) => setFilters((f) => ({ ...f, memberUserId: e.target.value }))}
            >
              <option value="all">All members</option>
              {activeMembers.map((m) => (
                <option key={m.user_id!} value={m.user_id!}>
                  {m.is_self ? "You" : m.invited_email ?? m.user_id!.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button
              type="button"
              disabled={genBusy !== null}
              onClick={() => void onGenerate("pdf")}
              className="gap-2"
            >
              {genBusy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Generate PDF
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={genBusy !== null}
              onClick={() => void onGenerate("csv")}
              className="gap-2"
            >
              {genBusy === "csv" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Generate CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/90 shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mail className="h-5 w-5 text-primary" aria-hidden />
            Scheduled email reports
          </CardTitle>
          <CardDescription>
            PDF summary + key metrics to your inbox. Requires{" "}
            <code className="text-xs">RESEND_API_KEY</code> and a cron hitting{" "}
            <code className="text-xs">/api/cron/scheduled-reports</code> with{" "}
            <code className="text-xs">CRON_SECRET</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rep-email">Recipient email</Label>
              <Input
                id="rep-email"
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rep-cadence">Cadence</Label>
              <select
                id="rep-cadence"
                className={cn(
                  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
                value={cadence}
                onChange={(e) => setCadence(e.target.value as "daily" | "weekly")}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rep-hour">Hour (UTC)</Label>
              <Input
                id="rep-hour"
                type="number"
                min={0}
                max={23}
                value={hourUtc}
                onChange={(e) => setHourUtc(Number.parseInt(e.target.value, 10) || 0)}
              />
            </div>
            {cadence === "weekly" ? (
              <div className="space-y-2">
                <Label htmlFor="rep-dow">Weekday (UTC)</Label>
                <select
                  id="rep-dow"
                  className={cn(
                    "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                  value={weekdayUtc}
                  onChange={(e) => setWeekdayUtc(Number.parseInt(e.target.value, 10))}
                >
                  {WEEKDAYS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Uses the same filters as above for each automated send (snapshot of workspace data at send
            time).
          </p>
          <Button type="button" disabled={scheduleBusy} onClick={() => void onSaveSchedule()}>
            {scheduleBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save schedule
          </Button>

          {scheduledReports.length > 0 ? (
            <ul className="space-y-2 border-t border-border/60 pt-4">
              {scheduledReports.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-col gap-2 rounded-lg border border-border/50 bg-muted/10 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{s.recipient_email}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.cadence} · {s.hour_utc}:00 UTC
                      {s.cadence === "weekly" && s.weekday_utc != null
                        ? ` · ${WEEKDAYS.find((d) => d.value === s.weekday_utc)?.label ?? ""}`
                        : ""}
                    </p>
                    {s.next_run_at ? (
                      <p className="text-[11px] text-muted-foreground">
                        Next: {new Date(s.next_run_at).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => void onDeleteSchedule(s.id)}
                  >
                    <Trash2 className="h-4 w-4" aria-label="Remove" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No schedules yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
