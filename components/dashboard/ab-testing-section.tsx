"use client";

import {
  listAbTestsAction,
  startAdvancedAbBatchExperimentAction,
} from "@/app/(dashboard)/actions";
import { SDR_VOICE_TONE_VALUES } from "@/agents/types";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import type { CampaignSequenceRow, CampaignTemplateRow, AbTestExperimentRow } from "@/types";
import { GitCompare, Loader2, RefreshCw, Trophy } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/hooks/use-toast";

type LeadDraft = {
  name: string;
  email: string;
  company: string;
  linkedin_url: string;
  phone: string;
  notes: string;
};

const nativeSelectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sage/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white";

const emptyLead = (): LeadDraft => ({
  name: "",
  email: "",
  company: "",
  linkedin_url: "",
  phone: "",
  notes: "",
});

type Props = {
  campaignSequences: CampaignSequenceRow[];
  campaignTemplates: CampaignTemplateRow[];
  initialExperiments: AbTestExperimentRow[];
};

export function AbTestingSection({
  campaignSequences,
  campaignTemplates,
  initialExperiments,
}: Props) {
  const [experiments, setExperiments] = useState<AbTestExperimentRow[]>(initialExperiments);
  const [expName, setExpName] = useState("");
  const [voiceA, setVoiceA] = useState<string>("default");
  const [voiceB, setVoiceB] = useState<string>("consultative");
  const [voiceBNote, setVoiceBNote] = useState("");
  const [sequenceId, setSequenceId] = useState<string>("");
  const [templateA, setTemplateA] = useState<string>("");
  const [templateB, setTemplateB] = useState<string>("");
  const [leads, setLeads] = useState<LeadDraft[]>(() => [emptyLead()]);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const voiceOptions = useMemo(() => SDR_VOICE_TONE_VALUES, []);

  useEffect(() => {
    setExperiments(initialExperiments);
  }, [initialExperiments]);

  const reloadExperiments = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await listAbTestsAction();
      setExperiments(next);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const addLeadRow = useCallback(() => {
    setLeads((prev) => (prev.length >= 6 ? prev : [...prev, emptyLead()]));
  }, []);

  const removeLeadRow = useCallback((idx: number) => {
    setLeads((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }, []);

  const updateLead = useCallback((idx: number, patch: Partial<LeadDraft>) => {
    setLeads((prev) => {
      const next = [...prev];
      const cur = next[idx];
      if (!cur) return prev;
      next[idx] = { ...cur, ...patch };
      return next;
    });
  }, []);

  const onSubmit = useCallback(async () => {
    const filled = leads.filter((l) => l.name.trim() && l.email.trim() && l.company.trim());
    if (filled.length === 0) {
      toast({
        title: "Add at least one lead",
        description: "Name, email, and company are required per lead.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const res = await startAdvancedAbBatchExperimentAction({
        name: expName.trim() || undefined,
        voice_a: voiceA as (typeof SDR_VOICE_TONE_VALUES)[number],
        voice_b: voiceB as (typeof SDR_VOICE_TONE_VALUES)[number],
        voice_b_note: voiceBNote.trim() || undefined,
        sequence_id: sequenceId.trim() || undefined,
        template_id_a: templateA.trim() || undefined,
        template_id_b: templateB.trim() || undefined,
        leads: filled.map((l) => ({
          name: l.name.trim(),
          email: l.email.trim(),
          company: l.company.trim(),
          linkedin_url: l.linkedin_url.trim() || undefined,
          phone: l.phone.trim() || undefined,
          notes: l.notes.trim() || undefined,
          status: "new" as const,
          sdr_voice_tone: "default" as const,
        })),
      });
      if (!res.ok) {
        toast({ title: "A/B batch failed", description: res.error, variant: "destructive" });
        return;
      }
      toast({ title: "Experiment finished", description: res.message });
      await reloadExperiments();
    } finally {
      setBusy(false);
    }
  }, [
    leads,
    expName,
    voiceA,
    voiceB,
    voiceBNote,
    sequenceId,
    templateA,
    templateB,
    reloadExperiments,
  ]);

  return (
    <div className="space-y-8">
      <Card className="premium-card-interactive rounded-xl border-border/70 bg-card/95 shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <GitCompare className="h-5 w-5 text-primary" aria-hidden />
            Advanced A/B testing
          </CardTitle>
          <CardDescription>
            Run variant A vs B on the same leads (different SDR voices, optional templates per side,
            shared sequence). Performance rolls into Analytics; winners are summarized below and in the
            Analytics tab.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ab-exp-name">Experiment label (optional)</Label>
              <Input
                id="ab-exp-name"
                value={expName}
                onChange={(e) => setExpName(e.target.value)}
                placeholder="e.g. Q1 voice + template test"
                maxLength={160}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ab-voice-a">Variant A — SDR voice</Label>
              <select
                id="ab-voice-a"
                className={nativeSelectClass}
                value={voiceA}
                onChange={(e) => setVoiceA(e.target.value)}
                disabled={busy}
              >
                {voiceOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ab-voice-b">Variant B — SDR voice</Label>
              <select
                id="ab-voice-b"
                className={nativeSelectClass}
                value={voiceB}
                onChange={(e) => setVoiceB(e.target.value)}
                disabled={busy}
              >
                {voiceOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ab-b-note">Variant B extra note (optional)</Label>
              <Textarea
                id="ab-b-note"
                value={voiceBNote}
                onChange={(e) => setVoiceBNote(e.target.value)}
                placeholder="Injected as template voice note for B only"
                rows={2}
                className="resize-y"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ab-sequence">Shared sequence (optional)</Label>
              <select
                id="ab-sequence"
                className={nativeSelectClass}
                value={sequenceId}
                onChange={(e) => setSequenceId(e.target.value)}
                disabled={busy}
              >
                <option value="">None</option>
                {campaignSequences.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ab-tpl-a">Template — variant A (optional)</Label>
              <select
                id="ab-tpl-a"
                className={nativeSelectClass}
                value={templateA}
                onChange={(e) => setTemplateA(e.target.value)}
                disabled={busy}
              >
                <option value="">None</option>
                {campaignTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ab-tpl-b">Template — variant B (optional)</Label>
              <select
                id="ab-tpl-b"
                className={nativeSelectClass}
                value={templateB}
                onChange={(e) => setTemplateB(e.target.value)}
                disabled={busy}
              >
                <option value="">None</option>
                {campaignTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">Leads (max 6)</p>
              <Button type="button" variant="outline" size="sm" onClick={addLeadRow} disabled={leads.length >= 6}>
                Add lead
              </Button>
            </div>
            {leads.map((lead, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-border/60 bg-muted/10 p-4 dark:bg-muted/5"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Lead {idx + 1}
                  </span>
                  {leads.length > 1 ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeLeadRow(idx)}>
                      Remove
                    </Button>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Name *</Label>
                    <Input
                      value={lead.name}
                      onChange={(e) => updateLead(idx, { name: e.target.value })}
                      placeholder="Alex Rivera"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Email *</Label>
                    <Input
                      type="email"
                      value={lead.email}
                      onChange={(e) => updateLead(idx, { email: e.target.value })}
                      placeholder="alex@company.com"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">Company *</Label>
                    <Input
                      value={lead.company}
                      onChange={(e) => updateLead(idx, { company: e.target.value })}
                      placeholder="Acme Inc"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">LinkedIn URL</Label>
                    <Input
                      value={lead.linkedin_url}
                      onChange={(e) => updateLead(idx, { linkedin_url: e.target.value })}
                      placeholder="https://linkedin.com/in/..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Phone</Label>
                    <Input
                      value={lead.phone}
                      onChange={(e) => updateLead(idx, { phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">Notes</Label>
                    <Input
                      value={lead.notes}
                      onChange={(e) => updateLead(idx, { notes: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="button" disabled={busy} className="gap-2" onClick={() => void onSubmit()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Run batch A/B
            </Button>
            <p className="text-xs text-muted-foreground self-center">
              Runs full pipelines sequentially (A then B per lead). Large batches may take several
              minutes.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="premium-card-interactive rounded-xl border-border/70 bg-card/95 shadow-md">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Trophy className="h-5 w-5 text-amber-500" aria-hidden />
              Experiment registry
            </CardTitle>
            <CardDescription>
              Auto-optimization scores and recommended winners after each batch completes (requires{" "}
              <code className="text-xs">ab_tests</code> migration).
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={refreshing}
            onClick={() => void reloadExperiments()}
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            )}
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {experiments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No experiments yet — run a batch above, or use Templates for a single-lead A/B pair.
            </p>
          ) : (
            <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
              {experiments.map((ex) => (
                <li key={ex.id} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{ex.name || "Experiment"}</span>
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      {ex.status}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {ex.experiment_type}
                    </Badge>
                    {ex.winner_variant ? (
                      <Badge className="gap-1 border-amber-500/40 bg-amber-500/15 text-amber-950 dark:text-amber-50">
                        <Trophy className="h-3 w-3" aria-hidden />
                        Winner: {ex.winner_variant}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(ex.created_at).toLocaleString()}
                  </p>
                  {ex.winner_reason ? (
                    <p className="text-sm leading-relaxed text-foreground/90">{ex.winner_reason}</p>
                  ) : null}
                  {ex.metrics_summary && Object.keys(ex.metrics_summary).length > 0 ? (
                    <pre className="max-h-32 overflow-auto rounded-lg bg-muted/40 p-2 text-[11px] text-muted-foreground">
                      {JSON.stringify(ex.metrics_summary, null, 2)}
                    </pre>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
