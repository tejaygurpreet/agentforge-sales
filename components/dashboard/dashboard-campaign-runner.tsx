"use client";

import { notifyBatchRunFinishedAction, startCampaignAction } from "@/app/(dashboard)/actions";
import { CampaignWorkspace } from "@/components/dashboard/campaign-workspace";
import type { CampaignRerunPayload } from "@/components/dashboard/campaign-rerun-types";
import { RecentCampaigns } from "@/components/dashboard/recent-campaigns";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { dashboardOutlineActionClass } from "@/lib/dashboard-action-classes";
import { cn } from "@/lib/utils";
import { leadFormSchema, type LeadFormInput } from "@/agents/types";
import type {
  BatchRunItem,
  CustomVoiceRow,
  PersistedCampaignRow,
  WhiteLabelClientSettingsDTO,
} from "@/types";
import { Layers, Loader2, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

export type { CampaignRerunPayload } from "@/components/dashboard/campaign-rerun-types";

export type { BatchRunItem } from "@/types";

type Props = {
  recentCampaigns: PersistedCampaignRow[];
  /** Optional: surface per-lead progress in Active agents. */
  onBatchProgressChange?: (rows: BatchRunItem[] | null) => void;
  /** HubSpot token saved (server-side). */
  hubspotConnected?: boolean;
  /** Prompt 78 — user custom voices for campaign form. */
  customVoices?: CustomVoiceRow[];
  /** Prompt 79 — PDF / Markdown / JSON branding. */
  whiteLabel?: WhiteLabelClientSettingsDTO | null;
  /** Prompt 85 — prefill from Templates tab (Apply). */
  templatePrefillRequest?: CampaignRerunPayload | null;
  onTemplatePrefillConsumed?: () => void;
};

const batchJsonSchema = z.array(leadFormSchema);

/**
 * Client-only shell: recent list + optional batch mode + new-lead workspace (Prompt 24 + 70).
 */
export function DashboardCampaignRunner({
  recentCampaigns,
  onBatchProgressChange,
  hubspotConnected = false,
  customVoices = [],
  whiteLabel = null,
  templatePrefillRequest = null,
  onTemplatePrefillConsumed,
}: Props) {
  const router = useRouter();
  const [rerunRequest, setRerunRequest] = useState<CampaignRerunPayload | null>(null);

  useEffect(() => {
    if (!templatePrefillRequest) return;
    setRerunRequest(templatePrefillRequest);
    onTemplatePrefillConsumed?.();
  }, [templatePrefillRequest, onTemplatePrefillConsumed]);
  const [batchMode, setBatchMode] = useState(false);
  const [batchJson, setBatchJson] = useState(
    '[\n  {\n    "name": "Sample Lead",\n    "email": "lead@company.example",\n    "company": "Company Inc",\n    "notes": "",\n    "sdr_voice_tone": "default"\n  }\n]',
  );
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<Set<string>>(new Set());

  const onRerunConsumed = useCallback(() => {
    setRerunRequest(null);
  }, []);

  const handleRerun = useCallback((values: LeadFormInput) => {
    setRerunRequest({
      nonce: Date.now(),
      values,
      autoStart: true,
    });
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedCampaignIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const runBatch = useCallback(
    async (leads: LeadFormInput[]) => {
      if (leads.length === 0) {
        setBatchError("Add at least one lead.");
        return;
      }
      if (leads.length > 12) {
        setBatchError("Batch is capped at 12 leads per run.");
        return;
      }
      setBatchError(null);
      setBatchBusy(true);
      let rows: BatchRunItem[] = leads.map((l, i) => ({
        id: `batch-${i}-${l.email}`,
        label: l.name,
        company: l.company,
        status: "queued" as const,
      }));
      onBatchProgressChange?.(rows);

      const chunkSize = 3;
      for (let start = 0; start < leads.length; start += chunkSize) {
        const slice = leads.slice(start, start + chunkSize);
        await Promise.all(
          slice.map(async (lead, j) => {
            const idx = start + j;
            rows = rows.map((r, k) =>
              k === idx ? { ...r, status: "running" as const } : r,
            );
            onBatchProgressChange?.(rows);
            try {
              const res = await startCampaignAction(lead);
              if (!res.ok) {
                rows = rows.map((r, k) =>
                  k === idx
                    ? { ...r, status: "error" as const, error: res.error }
                    : r,
                );
                onBatchProgressChange?.(rows);
                return;
              }
              rows = rows.map((r, k) =>
                k === idx
                  ? {
                      ...r,
                      status: "done" as const,
                      threadId: res.thread_id,
                    }
                  : r,
              );
              onBatchProgressChange?.(rows);
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              rows = rows.map((r, k) =>
                k === idx ? { ...r, status: "error" as const, error: msg } : r,
              );
              onBatchProgressChange?.(rows);
            }
          }),
        );
      }
      const done = rows.filter((r) => r.status === "done").length;
      const errored = rows.filter((r) => r.status === "error").length;
      void notifyBatchRunFinishedAction({
        total: leads.length,
        done,
        errors: errored,
      }).catch(() => {});
      setBatchBusy(false);
      router.refresh();
    },
    [onBatchProgressChange, router],
  );

  const onRunBatchJson = useCallback(() => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(batchJson);
    } catch {
      setBatchError("Invalid JSON.");
      return;
    }
    const check = batchJsonSchema.safeParse(parsed);
    if (!check.success) {
      setBatchError(
        check.error.flatten().formErrors.join(", ") || "Check lead fields.",
      );
      return;
    }
    void runBatch(check.data);
  }, [batchJson, runBatch]);

  const onRunSelectedHistory = useCallback(() => {
    const leads: LeadFormInput[] = [];
    for (const c of recentCampaigns) {
      if (!selectedCampaignIds.has(c.id)) continue;
      if (c.rerun_lead) leads.push(c.rerun_lead);
    }
    if (leads.length === 0) {
      setBatchError("Select rows with a saved lead snapshot (Re-run data).");
      return;
    }
    void runBatch(leads);
  }, [recentCampaigns, selectedCampaignIds, runBatch]);

  return (
    <div className="space-y-10 sm:space-y-12">
      <div
        className={cn(
          "premium-surface flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/50 px-4 py-4 ring-1 ring-white/[0.04] sm:flex-row sm:items-center sm:justify-between sm:px-5",
        )}
      >
        <div className="flex items-center gap-3">
          <Layers className="h-5 w-5 text-primary" aria-hidden />
          <div>
            <p className="text-sm font-semibold">Batch mode</p>
            <p className="text-xs text-muted-foreground">
              Optional — run several campaigns in parallel (3 at a time). Single-lead form below is
              unchanged.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant={batchMode ? "default" : "outline"}
          size="sm"
          className="shrink-0"
          onClick={() => {
            setBatchMode((v) => {
              const next = !v;
              if (!next) {
                onBatchProgressChange?.(null);
                setSelectedCampaignIds(new Set());
              }
              return next;
            });
          }}
        >
          {batchMode ? "Batch on" : "Batch off"}
        </Button>
      </div>

      {batchMode ? (
        <Card className="premium-card-interactive rounded-2xl border-border/80 bg-card/95 shadow-lg ring-1 ring-border/15 dark:ring-white/[0.06]">
          <CardHeader>
            <CardTitle className="text-lg">Batch campaigns</CardTitle>
            <CardDescription>
              Paste a JSON array of leads (same fields as the form). Or select rows in Recent
              campaigns (when a snapshot exists) and run the selection.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {batchError ? (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {batchError}
              </p>
            ) : null}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                JSON array
              </p>
              <Textarea
                id="batch-json"
                value={batchJson}
                onChange={(e) => setBatchJson(e.target.value)}
                className="mt-2 min-h-[160px] font-mono text-xs"
                spellCheck={false}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={batchBusy}
                className={cn("gap-2", dashboardOutlineActionClass)}
                onClick={() => void onRunBatchJson()}
              >
                {batchBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Play className="h-4 w-4" aria-hidden />
                )}
                Run JSON batch
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={batchBusy || selectedCampaignIds.size === 0}
                className={cn("gap-2", dashboardOutlineActionClass)}
                onClick={() => void onRunSelectedHistory()}
              >
                Run selected ({selectedCampaignIds.size})
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <RecentCampaigns
        campaigns={recentCampaigns}
        onRerunLead={handleRerun}
        batchMode={batchMode}
        selectedIds={selectedCampaignIds}
        onToggleSelect={toggleSelect}
      />
      <CampaignWorkspace
        rerunRequest={rerunRequest}
        onRerunConsumed={onRerunConsumed}
        hubspotConnected={hubspotConnected}
        customVoices={customVoices}
        whiteLabel={whiteLabel}
      />
    </div>
  );
}
