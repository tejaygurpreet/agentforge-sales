"use client";

import { Calendar, Inbox, Mail, RefreshCw, Shield, User } from "lucide-react";
import type { LeadFormInput } from "@/agents/types";
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
import type { PersistedCampaignRow } from "@/types";

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function StatusBadge({ status }: { status: string }) {
  const label = statusLabel(status);
  if (status === "completed") {
    return (
      <Badge
        className={cn(
          "border-emerald-600/35 bg-emerald-600/12 text-emerald-900 hover:bg-emerald-600/18",
          "dark:text-emerald-100",
        )}
      >
        {label}
      </Badge>
    );
  }
  if (status === "failed" || status === "completed_with_errors") {
    return (
      <Badge
        variant="outline"
        className={cn(
          "border-amber-500/50 bg-amber-500/12 text-amber-950",
          "dark:border-amber-400/45 dark:bg-amber-500/15 dark:text-amber-50",
        )}
      >
        {label}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="capitalize">
      {label}
    </Badge>
  );
}

type RecentCampaignsProps = {
  campaigns: PersistedCampaignRow[];
  /** Pre-fills the workspace and starts a fresh run (new thread_id). */
  onRerunLead?: (values: LeadFormInput) => void;
  /** Prompt 70 — multi-select for batch runs. */
  batchMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
};

export function RecentCampaigns({
  campaigns,
  onRerunLead,
  batchMode = false,
  selectedIds,
  onToggleSelect,
}: RecentCampaignsProps) {
  return (
    <Card className="premium-card-interactive rounded-2xl border-border/80 bg-card/95 shadow-xl ring-1 ring-border/20 dark:bg-card/95 dark:ring-white/[0.07]">
      <CardHeader className="space-y-2 border-b border-border/40 bg-gradient-to-r from-muted/35 via-transparent to-transparent pb-5 dark:from-muted/15">
        <CardTitle className="text-xl tracking-tight">Recent campaigns</CardTitle>
        <CardDescription className="text-sm leading-relaxed">
          Your last 25 runs from{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">campaigns</code>. Green = clean
          completion; amber = failed or finished with step errors. Export JSON, Markdown, or PDF from
          a completed run anytime.{" "}
          <span className="font-medium text-foreground/90">Re-run</span> restores the saved lead
          (including SDR voice) and starts a new thread.
          {batchMode ? (
            <>
              {" "}
              <span className="font-medium text-foreground/90">Batch mode:</span> select rows with a
              saved snapshot, then use Run selected in the batch panel.
            </>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/80 bg-muted/20 px-6 py-12 text-center">
            <Inbox className="h-10 w-10 text-muted-foreground" aria-hidden />
            <div className="space-y-1">
              <p className="font-medium text-foreground">No campaigns yet</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Start a campaign below. If the list stays empty, confirm{" "}
                <code className="text-xs">supabase/campaigns.sql</code> ran (including{" "}
                <span className="font-medium">grant select</span> for authenticated users).
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card/90 shadow-inner ring-1 ring-black/[0.02] dark:bg-card dark:ring-white/[0.04]">
            {campaigns.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-3 p-4 transition-colors hover:bg-muted/30 dark:hover:bg-muted/15 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {batchMode && onToggleSelect ? (
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border"
                        checked={selectedIds?.has(c.id) ?? false}
                        disabled={!c.rerun_lead}
                        title={
                          c.rerun_lead
                            ? "Include in batch run"
                            : "No saved lead snapshot for this row"
                        }
                        onChange={() => onToggleSelect(c.id)}
                        aria-label={`Select ${c.lead_name} for batch`}
                      />
                    ) : null}
                    <span className="truncate font-medium text-foreground">{c.lead_name}</span>
                    <StatusBadge status={c.status} />
                    {c.sdr_voice_label ? (
                      <Badge
                        variant="outline"
                        className="max-w-[min(100%,320px)] truncate border-violet-500/45 bg-violet-500/[0.14] px-2.5 py-1 text-xs font-semibold tracking-tight text-violet-950 shadow-sm ring-1 ring-violet-500/15 dark:border-violet-400/45 dark:bg-violet-500/18 dark:text-violet-50 dark:ring-violet-400/20"
                        title={`SDR voice: ${c.sdr_voice_label}`}
                      >
                        Voice: {c.sdr_voice_label}
                      </Badge>
                    ) : null}
                    {c.spam_score != null ? (
                      <Badge
                        variant="outline"
                        className="gap-1 border-sky-500/40 bg-sky-500/[0.1] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-950 dark:border-sky-400/40 dark:bg-sky-500/15 dark:text-sky-50"
                        title="Inbox health after send (Prompt 80)"
                      >
                        <Shield className="h-3 w-3" aria-hidden />
                        {c.spam_score}/100
                        {c.deliverability_status ? ` · ${c.deliverability_status}` : ""}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                    <span className="truncate">{c.company}</span>
                  </p>
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Mail className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                    <span className="truncate">{c.email}</span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end lg:flex-col lg:items-end xl:flex-row xl:items-center">
                  <div className="flex flex-col items-start gap-1 text-xs text-muted-foreground sm:items-end">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 opacity-70" aria-hidden />
                      <time dateTime={c.created_at}>{formatWhen(c.created_at)}</time>
                    </span>
                    {c.completed_at ? (
                      <span className="text-[11px] opacity-80">
                        Completed{" "}
                        <time dateTime={c.completed_at}>{formatWhen(c.completed_at)}</time>
                      </span>
                    ) : null}
                  </div>
                  {onRerunLead ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-9 gap-2 whitespace-nowrap rounded-lg px-3.5 tracking-tight",
                        dashboardOutlineActionClass,
                        "disabled:!border-border disabled:!bg-muted disabled:!text-muted-foreground disabled:!opacity-70 disabled:[&_svg]:!text-muted-foreground",
                      )}
                      disabled={!c.rerun_lead}
                      title={
                        c.rerun_lead
                          ? "Start a new campaign with this lead (new thread)"
                          : "No saved lead snapshot in this row"
                      }
                      onClick={() => {
                        if (c.rerun_lead) onRerunLead(c.rerun_lead);
                      }}
                    >
                      <RefreshCw className="h-3.5 w-3.5 opacity-90" aria-hidden />
                      Re-run campaign
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
