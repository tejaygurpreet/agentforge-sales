"use client";

import {
  deleteInboxDraftAction,
  getInboxDraftByIdAction,
  getInboxDraftCountAction,
  sendNewInboxEmailAction,
  upsertInboxDraftAction,
} from "@/app/(dashboard)/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  INBOX_COMPOSE_LOCAL_STORAGE_KEY,
  INBOX_DRAFT_AUTOSAVE_MS,
} from "@/lib/inbox-shared";
import { isLikelyValidRecipientEmail } from "@/lib/inbox-shared";
import { Loader2, Save, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

type LocalCompose = {
  draftId?: string;
  to: string;
  subject: string;
  body: string;
  savedAt: string;
};

function readLocalCompose(): LocalCompose | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(INBOX_COMPOSE_LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as LocalCompose;
    if (typeof o !== "object" || o === null) return null;
    return {
      draftId: typeof o.draftId === "string" ? o.draftId : undefined,
      to: typeof o.to === "string" ? o.to : "",
      subject: typeof o.subject === "string" ? o.subject : "",
      body: typeof o.body === "string" ? o.body : "",
      savedAt: typeof o.savedAt === "string" ? o.savedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function writeLocalCompose(p: LocalCompose) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(INBOX_COMPOSE_LOCAL_STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* quota */
  }
}

function clearLocalCompose() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(INBOX_COMPOSE_LOCAL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful send with the thread id so the parent can focus it. */
  onSent?: (threadId: string) => void;
  /** When set, opening loads this server draft (from Drafts list). */
  draftIdToLoad?: string | null;
  /** Parent clears `draftIdToLoad` after consumption. */
  onDraftLoadConsumed?: () => void;
  /** Refresh header / FAB draft totals. */
  onDraftCountChange?: (count: number) => void;
};

/**
 * Prompt 124 — Net-new email composer.
 * Prompt 129 — Auto-save every 3s (localStorage + Supabase), draft restore, delete after send.
 */
export function ComposeNewEmailDialog({
  open,
  onOpenChange,
  onSent,
  draftIdToLoad,
  onDraftLoadConsumed,
  onDraftCountChange,
}: Props) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [serverDraftId, setServerDraftId] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [savePending, startSave] = useTransition();
  const loadedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!open) loadedKey.current = null;
  }, [open]);

  const refreshDraftCount = useCallback(async () => {
    const n = await getInboxDraftCountAction();
    onDraftCountChange?.(n);
  }, [onDraftCountChange]);

  const persistToLocal = useCallback(() => {
    writeLocalCompose({
      draftId: serverDraftId ?? undefined,
      to,
      subject,
      body,
      savedAt: new Date().toISOString(),
    });
  }, [to, subject, body, serverDraftId]);

  useEffect(() => {
    if (!open) return;
    persistToLocal();
  }, [open, to, subject, body, serverDraftId, persistToLocal]);

  useEffect(() => {
    if (!open) return;

    const key = `${draftIdToLoad ?? "local"}:${open}`;
    if (loadedKey.current === key) return;
    loadedKey.current = key;

    void (async () => {
      if (draftIdToLoad) {
        const r = await getInboxDraftByIdAction({ id: draftIdToLoad });
        onDraftLoadConsumed?.();
        if (r.ok) {
          setTo(r.draft.to_email);
          setSubject(r.draft.subject);
          setBody(r.draft.body_text);
          setServerDraftId(r.draft.id);
          setLastSavedAt(r.draft.updated_at);
          writeLocalCompose({
            draftId: r.draft.id,
            to: r.draft.to_email,
            subject: r.draft.subject,
            body: r.draft.body_text,
            savedAt: r.draft.updated_at,
          });
          return;
        }
      }

      const local = readLocalCompose();
      if (local) {
        setTo(local.to);
        setSubject(local.subject);
        setBody(local.body);
        setServerDraftId(local.draftId ?? null);
        setLastSavedAt(local.savedAt);
      } else {
        setTo("");
        setSubject("");
        setBody("");
        setServerDraftId(null);
        setLastSavedAt(null);
      }
    })();
  }, [open, draftIdToLoad, onDraftLoadConsumed]);

  const runUpsert = useCallback(async () => {
    const hasContent = [to, subject, body].some((x) => x.trim().length > 0);
    if (!hasContent && !serverDraftId) return;

    startSave(async () => {
      const wasNew = !serverDraftId;
      const res = await upsertInboxDraftAction({
        id: serverDraftId ?? undefined,
        to_email: to,
        subject,
        body_text: body,
      });
      if (!res.ok) return;
      setServerDraftId(res.draft.id);
      setLastSavedAt(res.draft.updated_at);
      writeLocalCompose({
        draftId: res.draft.id,
        to: res.draft.to_email,
        subject: res.draft.subject,
        body: res.draft.body_text,
        savedAt: res.draft.updated_at,
      });
      if (wasNew) await refreshDraftCount();
    });
  }, [to, subject, body, serverDraftId, refreshDraftCount]);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => {
      void runUpsert();
    }, INBOX_DRAFT_AUTOSAVE_MS);
    return () => window.clearInterval(id);
  }, [open, runUpsert]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedTo = to.trim();
    const trimmedSubject = subject.trim();
    const trimmedBody = body.trim();
    if (!trimmedTo || !trimmedSubject || !trimmedBody) {
      toast({
        variant: "destructive",
        title: "Missing fields",
        description: "Add a recipient, subject, and message.",
      });
      return;
    }
    if (!isLikelyValidRecipientEmail(trimmedTo)) {
      toast({
        variant: "destructive",
        title: "Check the address",
        description: "Enter a single valid email in the To field.",
      });
      return;
    }

    startTransition(async () => {
      const res = await sendNewInboxEmailAction({
        to: trimmedTo,
        subject: trimmedSubject,
        body: trimmedBody,
      });
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Could not send",
          description: res.error,
        });
        return;
      }
      if (serverDraftId) {
        await deleteInboxDraftAction({ id: serverDraftId });
      }
      clearLocalCompose();
      setServerDraftId(null);
      await refreshDraftCount();
      toast({
        title: "Message sent",
        description: "Your email was delivered and saved to this inbox.",
        className: "border-border/50 bg-card shadow-soft",
      });
      onOpenChange(false);
      onSent?.(res.threadId);
    });
  }

  async function handleDeleteDraft() {
    if (!serverDraftId) {
      clearLocalCompose();
      setTo("");
      setSubject("");
      setBody("");
      onOpenChange(false);
      return;
    }
    startSave(async () => {
      const r = await deleteInboxDraftAction({ id: serverDraftId });
      if (!r.ok) {
        toast({ variant: "destructive", title: "Could not delete draft", description: r.error });
        return;
      }
      clearLocalCompose();
      setServerDraftId(null);
      setTo("");
      setSubject("");
      setBody("");
      await refreshDraftCount();
      toast({ title: "Draft discarded", className: "border-border/50 bg-card shadow-soft" });
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-[color-mix(in_srgb,#9CA88B_22%,hsl(var(--border)))] bg-gradient-to-b from-[hsl(var(--card))] via-[#FAF7F2] to-[color-mix(in_srgb,#C8A48A_08%,hsl(var(--card)))] sm:max-w-lg">
        <DialogHeader className="space-y-1 text-left">
          <DialogTitle className="text-lg font-semibold tracking-[-0.02em] text-[color-mix(in_srgb,hsl(var(--foreground))_95%,#4a4238)]">
            New message
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            Sends from your branded inbox address; replies use the same routing as campaign and reply sends.
            Drafts save automatically every few seconds.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4 pt-1">
          <div className="space-y-2">
            <Label
              htmlFor="compose-to"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              To
            </Label>
            <Input
              id="compose-to"
              type="email"
              autoComplete="email"
              placeholder="name@company.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              disabled={pending}
              className="h-11 rounded-xl border-[color-mix(in_srgb,hsl(var(--border))_90%,#9CA88B_15%)] bg-[hsl(var(--card))]/95 shadow-inner transition-shadow duration-300 focus-visible:ring-[#9CA88B]/30"
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="compose-subject"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Subject
            </Label>
            <Input
              id="compose-subject"
              type="text"
              placeholder="What’s this about?"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={pending}
              className="h-11 rounded-xl border-[color-mix(in_srgb,hsl(var(--border))_90%,#9CA88B_15%)] bg-[hsl(var(--card))]/95 shadow-inner transition-shadow duration-300 focus-visible:ring-[#9CA88B]/30"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label
                htmlFor="compose-body"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Message
              </Label>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {body.length.toLocaleString()} / 50,000
              </span>
            </div>
            <Textarea
              id="compose-body"
              rows={10}
              placeholder="Write a clear, professional message…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={pending}
              className="min-h-[200px] resize-y rounded-2xl border-[color-mix(in_srgb,hsl(var(--border))_90%,#9CA88B_15%)] bg-[hsl(var(--card))]/95 text-[15px] leading-relaxed shadow-inner transition-shadow duration-300 focus-visible:ring-[#9CA88B]/30"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3">
            <div className="flex min-h-[1.25rem] items-center gap-2 text-[11px] text-muted-foreground">
              {savePending ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin opacity-70" aria-hidden />
                  Saving…
                </span>
              ) : lastSavedAt ? (
                <span className="inline-flex items-center gap-1.5 text-[#6b6358]">
                  <Save className="h-3.5 w-3.5 text-[#9CA88B]" aria-hidden />
                  Saved {new Date(lastSavedAt).toLocaleTimeString()}
                </span>
              ) : (
                <span className="text-muted-foreground/80">Auto-save every 3s</span>
              )}
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl border-[color-mix(in_srgb,#C8A48A_35%,hsl(var(--border)))] text-[color-mix(in_srgb,hsl(var(--foreground))_85%,#5c4f45)] hover:bg-[color-mix(in_srgb,#C8A48A_12%,transparent)]"
              disabled={pending || savePending}
              onClick={() => void handleDeleteDraft()}
            >
              Discard draft
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="gap-2 rounded-xl bg-[#9CA88B] text-[#F8F5F0] shadow-[0_4px_20px_-6px_rgba(90,100,75,0.45)] transition-all duration-300 hover:bg-[color-mix(in_srgb,#9CA88B_92%,#7a8568)] hover:shadow-md"
              disabled={pending}
            >
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" aria-hidden />
                  Send
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
