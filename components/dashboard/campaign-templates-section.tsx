"use client";

import {
  deleteCampaignTemplateAction,
  saveCampaignAsTemplateAction,
  startAbVoicePairAction,
} from "@/app/(dashboard)/actions";
import type { LeadFormInput, SdrVoiceTone } from "@/agents/types";
import { SDR_VOICE_OPTIONS, sdrVoiceLabel } from "@/lib/sdr-voice";
import { mergeTemplatePayloadIntoLeadForm } from "@/lib/campaign-templates-merge";
import type { CampaignTemplateRow, PersistedCampaignRow } from "@/types";
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
import { cn } from "@/lib/utils";
import type { CampaignRerunPayload } from "@/components/dashboard/campaign-rerun-types";
import { useCallback, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { Loader2, Trash2, Wand2 } from "lucide-react";

const emptyBaseLead: LeadFormInput = {
  name: "",
  email: "",
  company: "",
  linkedin_url: "",
  phone: "",
  notes: "",
  status: "new",
  sdr_voice_tone: "default",
  custom_voice_id: undefined,
  custom_voice_name: undefined,
};

type Props = {
  templates: CampaignTemplateRow[];
  recentCampaigns: PersistedCampaignRow[];
  onTemplatesChange: () => void;
  /** Merges template into the workspace form and should switch the user to the Workspace tab. */
  onApplyToWorkspace: (payload: CampaignRerunPayload) => void;
};

/**
 * Prompt 85 — template library, save-from-campaign, apply to workspace, A/B voice runner.
 */
export function CampaignTemplatesSection({
  templates,
  recentCampaigns,
  onTemplatesChange,
  onApplyToWorkspace,
}: Props) {
  const [saveName, setSaveName] = useState("");
  const [saveCampaignId, setSaveCampaignId] = useState<string>("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [abBusy, setAbBusy] = useState(false);
  const [abLeadJson, setAbLeadJson] = useState(
    JSON.stringify(
      {
        name: "Alex Rivera",
        email: "alex@prospect.co",
        company: "Prospect Co",
        linkedin_url: "",
        notes: "Inbound demo request.",
        status: "new",
        sdr_voice_tone: "default",
      },
      null,
      2,
    ),
  );
  const [voiceA, setVoiceA] = useState<SdrVoiceTone>("default");
  const [voiceB, setVoiceB] = useState<SdrVoiceTone>("warm_relationship_builder");
  const [voiceBNote, setVoiceBNote] = useState(
    "Emphasize consultative follow-up and softer CTA.",
  );

  const onSaveTemplate = useCallback(async () => {
    if (!saveCampaignId || !saveName.trim()) {
      toast({ variant: "destructive", title: "Pick a campaign and name." });
      return;
    }
    setSaveBusy(true);
    try {
      const res = await saveCampaignAsTemplateAction({
        campaign_id: saveCampaignId,
        name: saveName.trim(),
      });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Could not save", description: res.error });
        return;
      }
      toast({ title: "Template saved" });
      setSaveName("");
      onTemplatesChange();
    } finally {
      setSaveBusy(false);
    }
  }, [saveCampaignId, saveName, onTemplatesChange]);

  const onDelete = useCallback(
    async (id: string) => {
      const res = await deleteCampaignTemplateAction({ id });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Delete failed", description: res.error });
        return;
      }
      toast({ title: "Template removed" });
      onTemplatesChange();
    },
    [onTemplatesChange],
  );

  const onApply = useCallback(
    (row: CampaignTemplateRow) => {
      const merged = mergeTemplatePayloadIntoLeadForm(emptyBaseLead, row.payload);
      onApplyToWorkspace({
        nonce: Date.now(),
        values: merged,
        autoStart: false,
        source_template_id: row.id,
      });
      toast({
        title: "Template applied",
        description: "Fill in name, email, and company on the Workspace tab, then Start campaign.",
      });
    },
    [onApplyToWorkspace],
  );

  const onRunAb = useCallback(async () => {
    let lead: unknown;
    try {
      lead = JSON.parse(abLeadJson);
    } catch {
      toast({ variant: "destructive", title: "Invalid JSON for lead" });
      return;
    }
    if (
      !lead ||
      typeof lead !== "object" ||
      typeof (lead as { name?: unknown }).name !== "string" ||
      typeof (lead as { email?: unknown }).email !== "string" ||
      typeof (lead as { company?: unknown }).company !== "string"
    ) {
      toast({ variant: "destructive", title: "Lead JSON needs name, email, company." });
      return;
    }
    setAbBusy(true);
    try {
      const res = await startAbVoicePairAction({
        lead: lead as LeadFormInput,
        voice_a: voiceA,
        voice_b: voiceB,
        voice_b_note: voiceBNote.trim() || undefined,
      });
      if (!res.ok) {
        toast({ variant: "destructive", title: "A/B run failed", description: res.error });
        return;
      }
      toast({
        title: "A/B complete",
        description: res.message,
      });
      onTemplatesChange();
    } finally {
      setAbBusy(false);
    }
  }, [abLeadJson, voiceA, voiceB, voiceBNote, onTemplatesChange]);

  return (
    <div className="space-y-8">
      <Card className="border-border/70 bg-card/90 shadow-md">
        <CardHeader>
          <CardTitle className="text-lg">Save campaign as template</CardTitle>
          <CardDescription>
            Capture voice preset, notes, and links from a completed run. Identity fields are filled fresh
            each time you apply the template.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tpl-campaign">Recent campaign</Label>
              <select
                id="tpl-campaign"
                value={saveCampaignId}
                onChange={(e) => setSaveCampaignId(e.target.value)}
                className={cn(
                  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                <option value="">Select a saved run…</option>
                {recentCampaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.lead_name} · {c.company}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tpl-name">Template name</Label>
              <Input
                id="tpl-name"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. Warm enterprise outreach"
              />
            </div>
          </div>
          <Button type="button" disabled={saveBusy} onClick={() => void onSaveTemplate()}>
            {saveBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save template
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/90 shadow-md">
        <CardHeader>
          <CardTitle className="text-lg">Template library</CardTitle>
          <CardDescription>
            Apply defaults to the workspace form, then complete lead fields and start. Runs record{" "}
            <code className="text-xs">template_id</code> when started from here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No templates yet — save one from a completed campaign above.
            </p>
          ) : (
            <ul className="space-y-3">
              {templates.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{t.name}</p>
                    {t.description ? (
                      <p className="text-xs text-muted-foreground">{t.description}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {new Date(t.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button type="button" size="sm" variant="secondary" onClick={() => onApply(t)}>
                      <Wand2 className="mr-1.5 h-4 w-4" />
                      Apply
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => void onDelete(t.id)}
                    >
                      <Trash2 className="h-4 w-4" aria-label="Delete" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/90 shadow-md">
        <CardHeader>
          <CardTitle className="text-lg">A/B voice test</CardTitle>
          <CardDescription>
            Run the same lead twice with two preset SDR voices. Variant B can include an extra note
            appended to the lead context. Results appear side-by-side in the Analytics tab.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ab-json">Lead JSON</Label>
            <Textarea
              id="ab-json"
              value={abLeadJson}
              onChange={(e) => setAbLeadJson(e.target.value)}
              className="min-h-[140px] font-mono text-xs"
              spellCheck={false}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ab-voice-a">Voice A</Label>
              <select
                id="ab-voice-a"
                value={voiceA}
                onChange={(e) => setVoiceA(e.target.value as SdrVoiceTone)}
                className={cn(
                  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                {SDR_VOICE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ab-voice-b">Voice B</Label>
              <select
                id="ab-voice-b"
                value={voiceB}
                onChange={(e) => setVoiceB(e.target.value as SdrVoiceTone)}
                className={cn(
                  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                {SDR_VOICE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ab-note-b">Optional note for variant B only</Label>
            <Textarea
              id="ab-note-b"
              value={voiceBNote}
              onChange={(e) => setVoiceBNote(e.target.value)}
              className="min-h-[72px] text-sm"
            />
          </div>
          <Button type="button" disabled={abBusy} onClick={() => void onRunAb()}>
            {abBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Run A/B ({sdrVoiceLabel(voiceA)} vs {sdrVoiceLabel(voiceB)})
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
