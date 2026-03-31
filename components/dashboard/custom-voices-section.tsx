"use client";

import {
  createCustomVoiceAction,
  deleteCustomVoiceAction,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { dashboardOutlineActionClass } from "@/lib/dashboard-action-classes";
import { cn } from "@/lib/utils";
import type { CustomVoiceRow } from "@/types";
import { Loader2, Mic, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "@/hooks/use-toast";

type Props = {
  initialVoices: CustomVoiceRow[];
};

/**
 * Prompt 78 — create/list/delete custom SDR voices (saved per user in Supabase).
 */
export function CustomVoicesSection({ initialVoices }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [toneInstructions, setToneInstructions] = useState("");
  const [ex1, setEx1] = useState("");
  const [ex2, setEx2] = useState("");
  const [ex3, setEx3] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const onCreate = useCallback(async () => {
    const examples = [ex1, ex2, ex3].map((s) => s.trim()).filter(Boolean);
    setBusy(true);
    try {
      const res = await createCustomVoiceAction({
        name,
        description,
        tone_instructions: toneInstructions,
        examples,
      });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Could not save voice", description: res.error });
        return;
      }
      toast({ title: "Custom voice saved", description: "Select it in the workspace campaign form." });
      setName("");
      setDescription("");
      setToneInstructions("");
      setEx1("");
      setEx2("");
      setEx3("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [name, description, toneInstructions, ex1, ex2, ex3, router]);

  const onDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        const res = await deleteCustomVoiceAction({ id });
        if (!res.ok) {
          toast({ variant: "destructive", title: "Delete failed", description: res.error });
          return;
        }
        toast({ title: "Voice removed" });
        router.refresh();
      } finally {
        setDeletingId(null);
      }
    },
    [router],
  );

  return (
    <div className="space-y-8">
      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Mic className="h-5 w-5 text-accent-foreground dark:text-accent-foreground/80" aria-hidden />
            <CardTitle className="text-lg font-semibold tracking-tight">Create a custom voice</CardTitle>
          </div>
          <CardDescription>
            Saved voices use your <strong className="font-medium text-foreground">tone instructions</strong> and{" "}
            <strong className="font-medium text-foreground">examples</strong> across research, outreach, qualification,
            and nurture — alongside the five built-in presets in the workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cv-name">Name</Label>
              <Input
                id="cv-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Pacific AE — calm challenger"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cv-desc">Description</Label>
              <Textarea
                id="cv-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Who is this seller? What should never appear in copy?"
                rows={3}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cv-tone">Tone instructions</Label>
              <Textarea
                id="cv-tone"
                value={toneInstructions}
                onChange={(e) => setToneInstructions(e.target.value)}
                placeholder="Non-negotiable style rules for every pipeline step (research JSON, email HTML, qual, nurture)."
                rows={6}
                className="font-mono text-[13px] leading-relaxed"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cv-ex1">Example message 1</Label>
              <Textarea id="cv-ex1" value={ex1} onChange={(e) => setEx1(e.target.value)} rows={3} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cv-ex2">Example message 2</Label>
              <Textarea id="cv-ex2" value={ex2} onChange={(e) => setEx2(e.target.value)} rows={3} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cv-ex3">Example message 3 (optional)</Label>
              <Textarea id="cv-ex3" value={ex3} onChange={(e) => setEx3(e.target.value)} rows={3} />
            </div>
          </div>
          <Button
            type="button"
            className={cn("gap-2", dashboardOutlineActionClass)}
            disabled={busy}
            onClick={() => void onCreate()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Save custom voice
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold tracking-tight">Your custom voices</CardTitle>
          <CardDescription>
            These appear in the <strong className="font-medium text-foreground">Workspace</strong> tab under{" "}
            <strong className="font-medium text-foreground">Campaign voice</strong> when you choose &quot;Custom&quot;.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {initialVoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No custom voices yet — create one above.</p>
          ) : (
            <ul className="space-y-3">
              {initialVoices.map((v) => (
                <li
                  key={v.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border/70 bg-card/80 px-4 py-3"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-foreground">{v.name}</p>
                    <p className="text-sm text-muted-foreground line-clamp-2">{v.description}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Saved {new Date(v.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0 text-destructive hover:bg-destructive/10"
                    disabled={deletingId === v.id}
                    title="Delete voice"
                    onClick={() => void onDelete(v.id)}
                  >
                    {deletingId === v.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden />
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
