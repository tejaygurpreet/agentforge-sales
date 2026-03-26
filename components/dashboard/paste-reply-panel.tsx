"use client";

import { analyzeProspectReplyAction } from "@/app/(dashboard)/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { dashboardOutlineActionClass } from "@/lib/dashboard-action-classes";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Loader2, MessageSquareText, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "@/hooks/use-toast";

export type PasteReplyPanelProps = {
  /** When set, analysis is stored against this campaign thread. */
  threadId?: string | null;
  company?: string | null;
  leadName?: string | null;
  /** Campaign lead email — stored as prospect_email for Replies / CRM context. */
  prospectEmail?: string | null;
};

export function PasteReplyPanel({
  threadId,
  company,
  leadName,
  prospectEmail,
}: PasteReplyPanelProps) {
  const router = useRouter();
  const textareaId = useId();
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    Awaited<ReturnType<typeof analyzeProspectReplyAction>> | null
  >(null);

  const linked =
    Boolean(threadId?.trim()) ||
    Boolean(company?.trim()) ||
    Boolean(leadName?.trim()) ||
    Boolean(prospectEmail?.trim());

  function runAnalyze() {
    setResult(null);
    startTransition(async () => {
      const res = await analyzeProspectReplyAction({
        text,
        thread_id: threadId?.trim() || undefined,
        company: company?.trim() || undefined,
        lead_name: leadName?.trim() || undefined,
        prospect_email: prospectEmail?.trim() || undefined,
      });
      setResult(res);
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Could not analyze",
          description: res.error,
        });
        return;
      }
      if (res.persisted) {
        toast({
          title: "Reply analyzed & saved",
          description: "Open Replies to see history for this thread.",
        });
        router.refresh();
      } else if (res.persistError) {
        toast({
          variant: "destructive",
          title: "Analysis ready — save failed",
          description: res.persistError,
        });
      } else {
        toast({
          title: "Reply analyzed",
          description: "Review the result below.",
        });
      }
    });
  }

  return (
    <Card
      className={cn(
        "overflow-hidden rounded-2xl border-border/70 bg-card shadow-2xl ring-1 ring-black/[0.04] dark:bg-card/96 dark:ring-white/[0.06]",
        "transition-shadow duration-500 hover:shadow-[0_24px_48px_-12px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_24px_48px_-12px_rgba(0,0,0,0.35)]",
      )}
    >
      <CardHeader className="space-y-4 border-b border-border/50 bg-gradient-to-br from-emerald-500/[0.07] via-muted/25 to-transparent px-6 pb-6 pt-7 sm:px-8 sm:pt-8 dark:from-emerald-500/[0.09] dark:via-muted/15">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-800/80 dark:text-emerald-300/90">
          Reply intelligence
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-1 gap-4">
            <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-500/25 bg-background/95 shadow-sm dark:border-emerald-400/20">
              <MessageSquareText className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl font-semibold tracking-tight text-foreground">
                  Paste prospect reply
                </CardTitle>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="cursor-default border-emerald-500/35 bg-emerald-500/[0.1] text-[10px] font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-200"
                    >
                      Always on
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs leading-relaxed" side="bottom">
                    Stays visible while you work — analyze replies anytime; context auto-links when a
                    campaign just completed.
                  </TooltipContent>
                </Tooltip>
              </div>
              <CardDescription className="text-[15px] leading-relaxed text-muted-foreground">
                Paste any prospect reply here to analyze sentiment, interest, objections, and get next-step
                guidance. Results save to{" "}
                <Link
                  href="/replies"
                  className="font-medium text-emerald-700 underline-offset-4 hover:text-emerald-800 hover:underline dark:text-emerald-400 dark:hover:text-emerald-300"
                >
                  Replies
                </Link>
                {linked ? " — campaign context below when a run just finished." : " — works without a campaign."}
              </CardDescription>
            </div>
          </div>
        </div>
        {linked ? (
          <div className="flex flex-wrap gap-2 border-t border-border/40 pt-4">
            <span className="w-full text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              This analysis
            </span>
            {threadId?.trim() ? (
              <Badge variant="outline" className="max-w-full truncate font-mono text-[10px] font-normal">
                Thread · {threadId.trim().length > 40 ? `${threadId.trim().slice(0, 38)}…` : threadId.trim()}
              </Badge>
            ) : null}
            {leadName?.trim() ? (
              <Badge variant="secondary" className="text-xs font-medium">
                {leadName.trim()}
              </Badge>
            ) : null}
            {company?.trim() ? (
              <Badge variant="secondary" className="text-xs font-medium">
                {company.trim()}
              </Badge>
            ) : null}
            {prospectEmail?.trim() ? (
              <Badge variant="outline" className="max-w-full truncate text-[10px] font-normal">
                {prospectEmail.trim()}
              </Badge>
            ) : null}
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-6 px-6 py-8 sm:px-8 sm:py-9">
        <div className="space-y-2.5">
          <Label htmlFor={textareaId} className="text-sm font-semibold text-foreground">
            Prospect message
          </Label>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Email or LinkedIn thread text is fine. We store the full message; the list view shows a short preview.
          </p>
          <Textarea
            id={textareaId}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Hi — thanks for reaching out. We're heads-down until Q2 but could revisit…"
            className={cn(
              "min-h-[152px] resize-y rounded-xl border-border/70 bg-background/80 text-[15px] leading-relaxed",
              "shadow-inner transition-shadow duration-300 focus-visible:border-emerald-500/40 focus-visible:ring-emerald-500/20",
            )}
            disabled={pending}
            aria-label="Prospect reply text"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border/40 pt-6">
          <Button
            type="button"
            disabled={pending || !text.trim()}
            onClick={runAnalyze}
            className="gap-2 rounded-lg px-5 shadow-md transition-transform duration-200 active:scale-[0.99]"
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Analyzing…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 opacity-90" aria-hidden />
                Analyze &amp; save
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("rounded-lg", dashboardOutlineActionClass)}
            disabled={pending}
            onClick={() => {
              setText("");
              setResult(null);
            }}
          >
            Clear
          </Button>
        </div>

        {result?.ok ? (
          <div
            className="space-y-5 rounded-xl border border-border/60 bg-muted/[0.35] p-5 shadow-inner dark:bg-muted/10 sm:p-6"
            role="region"
            aria-label="Analysis result"
          >
            {result.persistError ? (
              <p
                className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-950 dark:text-amber-100"
                role="status"
              >
                <span className="font-semibold">Not saved to Replies: </span>
                {result.persistError}
              </p>
            ) : null}
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Result
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="font-medium capitalize">
                Sentiment · {result.analysis.sentiment}
              </Badge>
              <Badge className="bg-emerald-600 font-medium text-white shadow-sm hover:bg-emerald-600">
                Interest · {result.analysis.interest_level_0_to_10}/10
              </Badge>
              <Badge
                variant="outline"
                className="border-violet-500/45 bg-violet-500/[0.08] font-medium text-violet-950 dark:text-violet-100"
              >
                Voice · {result.analysis.suggested_voice_label}
              </Badge>
            </div>
            {result.analysis.buying_signals.length > 0 ? (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Buying signals
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1.5 text-sm leading-relaxed text-foreground/90">
                  {result.analysis.buying_signals.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {result.analysis.objections_detected.length > 0 ? (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Objections / friction
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1.5 text-sm leading-relaxed text-foreground/90">
                  {result.analysis.objections_detected.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Suggested next nurture step
              </p>
              <p className="mt-2 text-sm leading-relaxed text-foreground/95">
                {result.analysis.suggested_next_nurture_step}
              </p>
            </div>
            <div className="rounded-lg border border-border/55 bg-background/90 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              <span className="font-semibold uppercase tracking-wide text-foreground/80">Basis · </span>
              {result.analysis.rationale}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
