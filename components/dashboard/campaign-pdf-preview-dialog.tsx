"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Download, Eye, FileText, Loader2 } from "lucide-react";
import type { CampaignClientSnapshot } from "@/agents/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { buildCampaignPdfExportOptions } from "@/lib/pdf-branding";
import type { WhiteLabelClientSettingsDTO } from "@/types";
import { cn } from "@/lib/utils";

export type CampaignPdfPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: CampaignClientSnapshot | null;
  whiteLabel: WhiteLabelClientSettingsDTO | null;
  /** Fires after a successful download (matches Markdown/JSON export tip pattern). */
  onDownloaded?: () => void;
};

/**
 * Prompt 109 — Preview branded campaign PDF in-browser before download; loading + success feedback.
 */
export function CampaignPdfPreviewDialog({
  open,
  onOpenChange,
  snapshot,
  whiteLabel,
  onDownloaded,
}: CampaignPdfPreviewDialogProps) {
  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  useEffect(() => {
    if (!open) {
      setPhase("idle");
      setBlobUrl(null);
      setFilename("");
      setDownloadSuccess(false);
      return;
    }

    if (!snapshot) {
      setPhase("error");
      return;
    }

    let cancelled = false;
    let created: string | null = null;

    setPhase("loading");
    setBlobUrl(null);
    setFilename("");
    setDownloadSuccess(false);

    (async () => {
      try {
        const { getCampaignPdfBlob } = await import("@/lib/campaign-pdf");
        const opts = await buildCampaignPdfExportOptions(whiteLabel ?? undefined);
        const { blob, filename: fn } = await getCampaignPdfBlob(snapshot, opts);
        if (cancelled) return;
        const u = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        created = u;
        setBlobUrl(u);
        setFilename(fn);
        setPhase("ready");
      } catch {
        if (!cancelled) {
          setPhase("error");
          toast({
            variant: "destructive",
            title: "We couldn’t prepare the preview",
            description: "Close and try again, or export Markdown / JSON from the campaign card.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [open, snapshot, whiteLabel]);

  function handleDownload() {
    if (!blobUrl || !filename) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setDownloadSuccess(true);
    toast({
      title: "PDF downloaded",
      description: "Branded report saved — check your downloads folder.",
    });
    onDownloaded?.();
    window.setTimeout(() => setDownloadSuccess(false), 2400);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-w-4xl gap-0 overflow-hidden p-0 sm:max-w-4xl",
          "border-border/60 bg-gradient-to-b from-[#fffdfb] to-card shadow-lift",
        )}
      >
        <div className="border-b border-border/35 bg-gradient-to-r from-primary/[0.06] via-accent/[0.05] to-amber-500/[0.05] px-6 py-5">
          <DialogHeader className="space-y-1.5 text-left">
            <DialogTitle className="flex items-center gap-3 text-xl font-semibold tracking-tight text-foreground">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/12 text-primary shadow-sm ring-1 ring-primary/15">
                <Eye className="h-5 w-5" aria-hidden />
              </span>
              <span className="flex flex-col gap-0.5">
                <span>Campaign dossier</span>
                <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                  <FileText className="h-3.5 w-3.5 opacity-80" aria-hidden />
                  Preview before you download
                </span>
              </span>
            </DialogTitle>
            <DialogDescription className="pl-[52px] text-sm text-muted-foreground">
              Executive one-pager plus full intelligence — same file as a direct export.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="relative min-h-[400px] bg-[#faf8f4]">
          {phase === "loading" ? (
            <div
              className="flex min-h-[400px] flex-col items-center justify-center gap-4 px-6"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              <div className="relative">
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" aria-hidden />
                <Loader2 className="relative h-12 w-12 animate-spin text-primary" aria-hidden />
              </div>
              <p className="text-center font-semibold text-foreground">Building your dossier…</p>
              <p className="max-w-sm text-center text-sm leading-relaxed text-muted-foreground">
                Applying your brand, scores, and research — usually just a moment.
              </p>
            </div>
          ) : null}

          {phase === "error" ? (
            <div
              className="flex min-h-[400px] flex-col items-center justify-center gap-5 px-6"
              role="alert"
            >
              <div className="ux-inline-error flex max-w-md flex-col items-center gap-3 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/[0.06] text-destructive shadow-sm">
                  <AlertCircle className="h-6 w-6" aria-hidden />
                </span>
                <div className="space-y-2">
                  <p className="font-semibold text-destructive">
                    {snapshot ? "Preview unavailable" : "Nothing to export yet"}
                  </p>
                  <p className="text-sm font-normal leading-relaxed text-foreground/90">
                    {snapshot
                      ? "We couldn’t render this PDF in the browser. Your data is fine — try again or use Markdown / JSON export."
                      : "Open a completed campaign first, then preview or download the dossier."}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            </div>
          ) : null}

          {phase === "ready" && blobUrl ? (
            <iframe
              title="PDF dossier preview"
              src={`${blobUrl}#view=FitH`}
              className="h-[min(70vh,640px)] w-full border-0 bg-white shadow-inner"
            />
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 bg-card/90 px-6 py-4 backdrop-blur-[2px]">
          <Button type="button" variant="ghost" className="text-muted-foreground" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-opacity duration-300 dark:text-primary",
                downloadSuccess ? "opacity-100" : "pointer-events-none opacity-0",
              )}
              aria-hidden={!downloadSuccess}
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Saved
            </span>
            <Button
              type="button"
              disabled={phase !== "ready" || !blobUrl}
              onClick={() => void handleDownload()}
              className="min-w-[140px] gap-2 shadow-sm"
            >
              <Download className="h-4 w-4" aria-hidden />
              Download PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
