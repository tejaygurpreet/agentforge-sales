"use client";

import { getSequenceRecommendationAction } from "@/app/(dashboard)/actions";
import type { SequenceRecommendationSnapshot } from "@/agents/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { sdrVoiceLabel } from "@/lib/sdr-voice";
import { Loader2, Route, Sparkles, Wand2 } from "lucide-react";
import { useCallback, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { LeadFormInput } from "@/agents/types";

type Props = {
  form: UseFormReturn<LeadFormInput>;
  onApplyRecommendation: (rec: SequenceRecommendationSnapshot) => void;
};

export function SequenceRecommendationCard({ form, onApplyRecommendation }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rec, setRec] = useState<SequenceRecommendationSnapshot | null>(null);

  const company = form.watch("company");
  const email = form.watch("email");
  const notes = form.watch("notes");

  const fetchRecommendation = useCallback(async () => {
    setError(null);
    const c = typeof company === "string" ? company.trim() : "";
    const em = typeof email === "string" ? email.trim() : "";
    if (c.length < 1 || !em.includes("@")) {
      setError("Add at least a company name and a valid email first.");
      return;
    }
    setBusy(true);
    try {
      const res = await getSequenceRecommendationAction({
        company: c,
        email: em,
        notes: typeof notes === "string" ? notes : undefined,
      });
      if (!res.ok) {
        setError(res.error);
        setRec(null);
        return;
      }
      setRec(res.recommendation);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load recommendation.");
      setRec(null);
    } finally {
      setBusy(false);
    }
  }, [company, email, notes]);

  return (
    <Card
      className={cn(
        "rounded-xl border border-accent/25 bg-accent/[0.04] shadow-sm dark:border-accent/50/20 dark:bg-accent/[0.07]",
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Route className="h-5 w-5 text-accent-foreground dark:text-accent-foreground/80" aria-hidden />
          Intelligent sequence recommendation
        </CardTitle>
        <CardDescription>
          Uses your workspace history, saved playbooks, and company signals — no extra LLM round-trip
          before the main campaign run.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={busy}
          onClick={() => void fetchRecommendation()}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="h-4 w-4 opacity-90" aria-hidden />
          )}
          Get recommendation
        </Button>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}
        {rec ? (
          <div className="space-y-3 rounded-lg border border-border/60 bg-background/80 px-3 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-foreground">Confidence</span>
              <span className="rounded-full border border-accent/35 bg-accent/10 px-2 py-0.5 text-xs font-medium tabular-nums text-accent-foreground dark:text-accent-foreground">
                {rec.confidence_0_to_100}/100
              </span>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Suggested voice
              </p>
              <p className="mt-1 text-foreground">
                {rec.custom_voice_id && rec.custom_voice_name
                  ? `${rec.custom_voice_name} (custom)`
                  : sdrVoiceLabel(rec.sdr_voice_tone)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Sequence
              </p>
              <p className="mt-1 text-foreground">
                {rec.recommended_sequence_name?.trim()
                  ? rec.recommended_sequence_name
                  : "Default pipeline (pick a playbook above if you want milestones tracked)"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                First message hint
              </p>
              <p className="mt-1 leading-relaxed text-muted-foreground">{rec.first_message_hint}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Why this sequence?
              </p>
              <p className="mt-1 whitespace-pre-wrap leading-relaxed text-muted-foreground">
                {rec.why_this_sequence}
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Signals: {rec.signals_used.join(" · ")}
            </p>
            <Button
              type="button"
              size="sm"
              className="gap-2"
              onClick={() => onApplyRecommendation(rec)}
            >
              <Wand2 className="h-4 w-4" aria-hidden />
              Apply recommended sequence
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
