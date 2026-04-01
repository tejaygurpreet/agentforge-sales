"use client";

import {
  generatePlaybookForThreadAction,
  getPlaybookPdfBase64Action,
} from "@/app/(dashboard)/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { KnowledgeBaseEntryRow, PersistedCampaignRow, PlaybookRow } from "@/types";
import { BookOpen, Download, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "@/hooks/use-toast";

type Props = {
  recentCampaigns: PersistedCampaignRow[];
  initialPlaybooks: PlaybookRow[];
  initialKnowledge: KnowledgeBaseEntryRow[];
};

function downloadBase64Pdf(base64: string, filename: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function PlaybooksSection({
  recentCampaigns,
  initialPlaybooks,
  initialKnowledge,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pdfPending, setPdfPending] = useState<string | null>(null);
  const [threadPick, setThreadPick] = useState<string>(
    recentCampaigns[0]?.thread_id ?? "",
  );
  const [viewer, setViewer] = useState<PlaybookRow | null>(null);
  const playbooks = initialPlaybooks;
  const knowledge = initialKnowledge;

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const onGenerate = () => {
    if (!threadPick) {
      toast({ title: "Pick a campaign", description: "Select a thread with a saved run." });
      return;
    }
    startTransition(async () => {
      const r = await generatePlaybookForThreadAction(threadPick);
      if (!r.ok) {
        toast({
          variant: "destructive",
          title: "Could not generate playbook",
          description: r.error,
        });
        return;
      }
      toast({ title: "Playbook generated", description: "Saved to your workspace library." });
      refresh();
    });
  };

  const onDownloadPdf = async (id: string) => {
    setPdfPending(id);
    try {
      const r = await getPlaybookPdfBase64Action(id);
      if (!r.ok) {
        toast({
          variant: "destructive",
          title: "PDF export failed",
          description: r.error,
        });
        return;
      }
      downloadBase64Pdf(r.base64, r.filename);
    } finally {
      setPdfPending(null);
    }
  };

  return (
    <div className="space-y-8 pt-2">
      <Card className="border-primary/15 shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-xl">AI sales playbooks</CardTitle>
              <CardDescription className="mt-1.5 max-w-2xl">
                Synthesize research, qualification, nurture, and competitive context into a reusable
                internal playbook. Export as PDF for onboarding and deal reviews.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-[240px] flex-1 space-y-2">
              <label htmlFor="playbook-thread" className="text-xs font-medium text-muted-foreground">
                Campaign / thread
              </label>
              <select
                id="playbook-thread"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                value={threadPick}
                onChange={(e) => setThreadPick(e.target.value)}
                aria-label="Select campaign thread"
                disabled={recentCampaigns.length === 0}
              >
                {recentCampaigns.length === 0 ? (
                  <option value="">No saved campaigns yet</option>
                ) : (
                  recentCampaigns.map((c) => (
                    <option key={c.thread_id} value={c.thread_id}>
                      {c.company || "Account"} — {c.lead_name || "Lead"} ({c.thread_id.slice(0, 12)}…)
                    </option>
                  ))
                )}
              </select>
            </div>
            <Button
              type="button"
              onClick={onGenerate}
              disabled={pending || !threadPick || recentCampaigns.length === 0}
              className="gap-2"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generate playbook
            </Button>
            <Button type="button" variant="outline" size="icon" onClick={refresh} aria-label="Refresh lists">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          {recentCampaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Complete a campaign on the Workspace tab first — playbooks need a persisted snapshot.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-8 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Saved playbooks</CardTitle>
            <CardDescription>View structured JSON or download PDF.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {playbooks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No playbooks yet — generate one above.</p>
            ) : (
              <ul className="space-y-2">
                {playbooks.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.company} · {new Date(p.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button type="button" variant="secondary" size="sm" onClick={() => setViewer(p)}>
                        View
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        disabled={pdfPending === p.id}
                        onClick={() => onDownloadPdf(p.id)}
                      >
                        {pdfPending === p.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                        PDF
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Living knowledge base</CardTitle>
            <CardDescription>
              Auto-synced excerpts from completed campaigns (objections, nurture, research) — grows with
              every run.
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
            {knowledge.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Entries appear after campaigns complete — nothing synced yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {knowledge.map((k) => (
                  <li
                    key={k.id}
                    className="rounded-lg border border-border/60 bg-card/80 p-3 text-sm shadow-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {k.entry_type}
                      </Badge>
                      {k.source_thread_id ? (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {k.source_thread_id.slice(0, 12)}…
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 font-medium leading-snug">{k.title}</p>
                    <p className="mt-1 line-clamp-4 text-xs leading-relaxed text-muted-foreground">
                      {k.body}
                    </p>
                    {k.tags.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {k.tags.slice(0, 6).map((t) => (
                          <span
                            key={t}
                            className="rounded bg-muted/80 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={viewer != null} onOpenChange={(o) => !o && setViewer(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewer?.title ?? "Playbook"}</DialogTitle>
            <DialogDescription>
              {viewer?.company} — internal reference (JSON)
            </DialogDescription>
          </DialogHeader>
          {viewer ? (
            <pre className="max-h-[60vh] overflow-auto rounded-lg border bg-muted/30 p-4 text-xs leading-relaxed">
              {JSON.stringify(viewer.playbook_body, null, 2)}
            </pre>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
