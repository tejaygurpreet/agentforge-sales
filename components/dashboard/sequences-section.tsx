"use client";

import {
  deleteCampaignSequenceAction,
  upsertCampaignSequenceAction,
} from "@/app/(dashboard)/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { dashboardOutlineActionClass } from "@/lib/dashboard-action-classes";
import { cn } from "@/lib/utils";
import type { SequenceChannel, SequenceStep } from "@/agents/types";
import type { CampaignSequenceRow } from "@/types";
import {
  ArrowDown,
  ArrowUp,
  GitBranch,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "@/hooks/use-toast";

const CHANNELS: { value: SequenceChannel; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "call", label: "Call" },
  { value: "follow_up", label: "Follow-up" },
];

function defaultSteps(): SequenceStep[] {
  return [
    { id: crypto.randomUUID(), channel: "email", label: "Email" },
    { id: crypto.randomUUID(), channel: "linkedin", label: "LinkedIn" },
    { id: crypto.randomUUID(), channel: "call", label: "Call" },
    { id: crypto.randomUUID(), channel: "follow_up", label: "Follow-up" },
  ];
}

type Props = {
  sequences: CampaignSequenceRow[];
  onSequencesChange: () => void;
  onApplyToWorkspace: (sequenceId: string) => void;
};

export function SequencesSection({
  sequences,
  onSequencesChange,
  onApplyToWorkspace,
}: Props) {
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<SequenceStep[]>(() => defaultSteps());
  const [busy, setBusy] = useState(false);

  const startNew = useCallback(() => {
    setEditingId("new");
    setName("");
    setSteps(defaultSteps());
  }, []);

  const startEdit = useCallback((row: CampaignSequenceRow) => {
    setEditingId(row.id);
    setName(row.name);
    setSteps(
      row.steps.length > 0
        ? row.steps.map((s) => ({
            ...s,
            id: s.id || crypto.randomUUID(),
          }))
        : defaultSteps(),
    );
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setName("");
    setSteps(defaultSteps());
  }, []);

  const addStep = useCallback(() => {
    setSteps((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        channel: "email",
        label: "Email",
      },
    ]);
  }, []);

  const removeStep = useCallback((idx: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const moveStep = useCallback((idx: number, dir: -1 | 1) => {
    setSteps((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }, []);

  const updateStepChannel = useCallback((idx: number, channel: SequenceChannel) => {
    setSteps((prev) => {
      const next = [...prev];
      const cur = next[idx];
      if (!cur) return prev;
      const label = CHANNELS.find((c) => c.value === channel)?.label ?? channel;
      next[idx] = { ...cur, channel, label };
      return next;
    });
  }, []);

  const updateStepLabel = useCallback((idx: number, label: string) => {
    setSteps((prev) => {
      const next = [...prev];
      const cur = next[idx];
      if (!cur) return prev;
      next[idx] = { ...cur, label: label.slice(0, 120) };
      return next;
    });
  }, []);

  const canSave = useMemo(
    () => name.trim().length > 0 && steps.length > 0 && steps.length <= 16,
    [name, steps],
  );

  const onSave = useCallback(async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      const res = await upsertCampaignSequenceAction({
        id: editingId && editingId !== "new" ? editingId : undefined,
        name: name.trim(),
        steps,
      });
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Could not save sequence",
          description: res.error,
        });
        return;
      }
      toast({ title: "Sequence saved", description: "Your playbook is ready to attach to campaigns." });
      cancelEdit();
      onSequencesChange();
    } finally {
      setBusy(false);
    }
  }, [canSave, cancelEdit, editingId, name, onSequencesChange, steps]);

  const onDelete = useCallback(
    async (id: string) => {
      if (!confirm("Delete this sequence? Campaigns already run are unchanged.")) return;
      setBusy(true);
      try {
        const res = await deleteCampaignSequenceAction({ id });
        if (!res.ok) {
          toast({ variant: "destructive", title: "Delete failed", description: res.error });
          return;
        }
        toast({ title: "Sequence removed" });
        if (editingId === id) cancelEdit();
        onSequencesChange();
      } finally {
        setBusy(false);
      }
    },
    [cancelEdit, editingId, onSequencesChange],
  );

  return (
    <div className="space-y-8 pt-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Multi-channel sequences</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Build a reusable playbook (Email, LinkedIn, Call, Follow-up in any order). The pipeline
            still runs the standard research → outreach → qualification → nurture graph; steps here
            map to milestones so you can track progress in the campaign view.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("shrink-0 gap-2", dashboardOutlineActionClass)}
          onClick={() => startNew()}
          disabled={busy}
        >
          <Plus className="h-4 w-4" aria-hidden />
          New sequence
        </Button>
      </div>

      {editingId ? (
        <Card className="premium-card-interactive rounded-2xl border-border/80 bg-card/95 shadow-lg ring-1 ring-border/15 dark:ring-white/[0.06]">
          <CardHeader>
            <CardTitle className="text-base">
              {editingId === "new" ? "Create sequence" : "Edit sequence"}
            </CardTitle>
            <CardDescription>
              Add steps in the order you want your team to see. You can attach this playbook when
              starting a campaign or batch run.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Name
              </label>
              <Input
                className="mt-1.5"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Enterprise outbound — 4 touch"
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Steps
              </p>
              <ul className="space-y-2">
                {steps.map((step, idx) => (
                  <li
                    key={step.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2"
                  >
                    <span className="w-6 text-xs font-mono text-muted-foreground">{idx + 1}.</span>
                    <select
                      className="h-9 min-w-[120px] rounded-md border border-input bg-background px-2 text-sm"
                      value={step.channel}
                      onChange={(e) =>
                        updateStepChannel(idx, e.target.value as SequenceChannel)
                      }
                      disabled={busy}
                    >
                      {CHANNELS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <Input
                      className="h-9 max-w-[220px] flex-1 text-sm"
                      value={step.label ?? ""}
                      onChange={(e) => updateStepLabel(idx, e.target.value)}
                      placeholder="Label (optional)"
                      disabled={busy}
                    />
                    <div className="ml-auto flex items-center gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        disabled={busy || idx === 0}
                        onClick={() => moveStep(idx, -1)}
                        aria-label="Move step up"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        disabled={busy || idx >= steps.length - 1}
                        onClick={() => moveStep(idx, 1)}
                        aria-label="Move step down"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive"
                        disabled={busy || steps.length <= 1}
                        onClick={() => removeStep(idx)}
                        aria-label="Remove step"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn("gap-1", dashboardOutlineActionClass)}
                onClick={() => addStep()}
                disabled={busy || steps.length >= 16}
              >
                <Plus className="h-3.5 w-3.5" />
                Add step
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                type="button"
                disabled={busy || !canSave}
                className="gap-2"
                onClick={() => void onSave()}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Save className="h-4 w-4" aria-hidden />
                )}
                Save sequence
              </Button>
              <Button type="button" variant="outline" onClick={() => cancelEdit()} disabled={busy}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {sequences.length === 0 && !editingId ? (
          <p className="col-span-full text-sm text-muted-foreground">
            No sequences yet — create one to attach to campaigns, or use the default linear pipeline
            with no playbook.
          </p>
        ) : null}
        {sequences.map((s) => (
          <Card
            key={s.id}
            className="flex flex-col rounded-2xl border-border/80 bg-card/90 shadow-sm ring-1 ring-border/10"
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <GitBranch className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <CardTitle className="truncate text-base font-semibold">{s.name}</CardTitle>
                </div>
              </div>
              <CardDescription className="text-xs">
                {s.steps.length} step{s.steps.length === 1 ? "" : "s"} · updated{" "}
                {new Date(s.updated_at).toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent className="mt-auto flex flex-1 flex-col gap-3 pt-0">
              <ol className="flex flex-wrap gap-1.5 text-[11px]">
                {s.steps.map((st, i) => (
                  <li
                    key={st.id}
                    className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 font-medium text-foreground/90"
                  >
                    {i + 1}. {st.label ?? CHANNELS.find((c) => c.value === st.channel)?.label}
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={dashboardOutlineActionClass}
                  onClick={() => onApplyToWorkspace(s.id)}
                >
                  Apply to workspace
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => startEdit(s)}
                  disabled={busy}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => void onDelete(s.id)}
                  disabled={busy}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
