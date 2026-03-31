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
import { Loader2, MessageSquareText, Wand2 } from "lucide-react";
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
        "overflow-hidden rounded-2xl border-border/55 bg-card shadow-lift ring-1 ring-border/30",
        "transition-shadow duration-300 hover:shadow-soft",
      )}
    >
      <CardHeader className="space-y-4 border-b border-border/45 bg-gradient-to-br from-primary/[0.09] via-card to-muted0/[0.05] px-6 pb-6 pt-7 sm:px-8 sm:pt-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/90">
          Reply intelligence
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-1 gap-4">
            <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-card shadow-sm">
              <MessageSquareText className="h-6 w-6 text-primary" aria-hidden />
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl font-semibold tracking-tight text-foreground">
                  Prospect reply analyzer
                </CardTitle>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="cursor-default border-primary/40 bg-primary/[0.12] text-[10px] font-semibold uppercase tracking-wider text-foreground"
                    >
                      Always on
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs leading-relaxed" side="bottom">
                    Stays visible while you work — analyze anytime; context auto-links when a campaign just
                    finished.
                  </TooltipContent>
                </Tooltip>
              </div>
              <CardDescription className="text-[15px] leading-relaxed text-muted-foreground">
                Paste a prospect reply to score sentiment, interest, objections, and next-step coaching.
                Results save to{" "}
                <Link
                  href="/replies"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Replies
                </Link>
                {linked ? " — thread context is attached below when available." : " — works without a live campaign."}
              </CardDescription>
            </div>
          </div>
        </div>
        {linked ? (
          <div className="flex flex-wrap gap-2 border-t border-border/40 pt-4">
            <span className="w-full text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Linked context
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
            Email or LinkedIn thread text is fine. We store the full message for your Replies history.
          </p>
          <Textarea
            id={textareaId}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Hi — thanks for reaching out. We're heads-down until Q2 but could revisit…"
            className={cn(
              "min-h-[168px] resize-y rounded-xl border-border/60 bg-card text-[15px] leading-relaxed",
              "shadow-inner ring-1 ring-black/[0.02] transition-shadow duration-200",
              "focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/20",
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
            className="gap-2 rounded-xl px-6 shadow-soft transition-transform duration-200 active:scale-[0.99]"
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Analyzing…
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4 opacity-90" aria-hidden />
                Analyze &amp; save
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("rounded-xl", dashboardOutlineActionClass)}
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
            className="animate-in fade-in slide-in-from-bottom-2 space-y-5 rounded-2xl border border-border/50 bg-gradient-to-b from-muted/40 to-card p-5 shadow-inner duration-300 sm:p-6"
            role="region"
            aria-label="Analysis result"
          >
            {result.persistError ? (
              <p
                className="rounded-xl border border-amber-400/45 bg-amber-500/[0.1] px-3 py-2 text-xs leading-relaxed text-amber-950"
                role="status"
              >
                <span className="font-semibold">Not saved to Replies: </span>
                {result.persistError}
              </p>
            ) : null}
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Analysis
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="font-medium capitalize shadow-sm">
                Sentiment · {result.analysis.sentiment}
              </Badge>
              <Badge className="border border-primary/20 bg-primary font-medium text-white shadow-sm hover:bg-primary">
                Interest · {result.analysis.interest_level_0_to_10}/10
              </Badge>
              <Badge
                variant="outline"
                className="border-accent/45 bg-accent/[0.1] font-medium text-accent-foreground"
              >
                Voice · {result.analysis.suggested_voice_label}
              </Badge>
            </div>
            {result.analysis.buying_signals.length > 0 ? (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Buying signals
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1.5 text-sm leading-relaxed text-foreground/95">
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
                <ul className="mt-2 list-inside list-disc space-y-1.5 text-sm leading-relaxed text-foreground/95">
                  {result.analysis.objections_detected.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="rounded-xl border border-border/50 bg-card/80 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Suggested next nurture step
              </p>
              <p className="mt-2 text-sm leading-relaxed text-foreground">
                {result.analysis.suggested_next_nurture_step}
              </p>
            </div>
            <div className="rounded-xl border border-border/45 bg-muted/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              <span className="font-semibold uppercase tracking-wide text-foreground/85">Rationale · </span>
              {result.analysis.rationale}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
