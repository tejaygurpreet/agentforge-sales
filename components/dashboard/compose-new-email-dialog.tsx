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
import { INBOX_COMPOSE_LOCAL_STORAGE_KEY, INBOX_DRAFT_AUTOSAVE_MS } from "@/lib/inbox-shared";
import { isLikelyValidRecipientEmail } from "@/lib/inbox-shared";
import { Loader2, Save, Send } from "lucide-react";
import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

type LocalCompose = {
  draftId?: string;
  to: string;
  subject: string;
  body: string;
  savedAt: string;
};

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

export type ComposeIntent = "new" | "edit";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `new` = blank composer (never restore local/server draft). `edit` = load `draftIdToLoad`. */
  composeIntent: ComposeIntent;
  onSent?: (threadId: string) => void;
  draftIdToLoad?: string | null;
  onDraftLoadConsumed?: () => void;
  onDraftCountChange?: (count: number) => void;
};

/**
 * Prompt 124 — Net-new email composer.
 * Prompt 129 — Auto-save every 3s to Supabase + localStorage while typing.
 * Prompt 130 — New compose never auto-loads a draft; only opening from Drafts loads `draftIdToLoad`.
 * Prompt 133 — Clean modal on card surface (#FAF7F2), sage actions, 20px radius.
 * Prompt 135 — Animated “Saving…” pulse on 3s autosave ticks.
 */
export function ComposeNewEmailDialog({
  open,
  onOpenChange,
  composeIntent,
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
  const initRef = useRef<string | null>(null);

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
    if (!open) {
      initRef.current = null;
      return;
    }

    const sessionKey = `${composeIntent}:${draftIdToLoad ?? ""}`;
    if (initRef.current === sessionKey) return;
    initRef.current = sessionKey;

    void (async () => {
      if (composeIntent === "edit" && draftIdToLoad) {
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
        } else {
          setTo("");
          setSubject("");
          setBody("");
          setServerDraftId(null);
          setLastSavedAt(null);
          clearLocalCompose();
        }
        return;
      }

      clearLocalCompose();
      setTo("");
      setSubject("");
      setBody("");
      setServerDraftId(null);
      setLastSavedAt(null);
    })();
  }, [open, composeIntent, draftIdToLoad, onDraftLoadConsumed]);

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
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[var(--card-radius)] border-border/55 bg-card p-6 shadow-soft ring-1 ring-black/[0.04] sm:max-w-lg">
        <DialogHeader className="space-y-1 text-left">
          <DialogTitle className="text-lg font-semibold tracking-[-0.02em] text-foreground">
            {composeIntent === "edit" ? "Edit draft" : "New message"}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            Sends from your branded inbox address. Drafts sync every 3 seconds — open{" "}
            <span className="font-medium text-foreground/90">Drafts</span> anytime to resume.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5 pt-1">
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
              className="h-11 rounded-[var(--card-radius)] border-border/60 bg-card shadow-inner transition-[box-shadow] duration-200 ease-in-out focus-visible:ring-sage/35"
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
              className="h-11 rounded-[var(--card-radius)] border-border/60 bg-card shadow-inner transition-[box-shadow] duration-200 ease-in-out focus-visible:ring-sage/35"
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
              className="min-h-[200px] resize-y rounded-[var(--card-radius)] border-border/60 bg-card text-[15px] leading-relaxed shadow-inner transition-[box-shadow] duration-200 ease-in-out focus-visible:ring-sage/35"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-4">
            <div className="flex min-h-[1.25rem] items-center gap-2 text-[11px] text-muted-foreground">
              {savePending ? (
                <motion.span
                  className="inline-flex items-center gap-2 rounded-full border border-sage/25 bg-sage/[0.08] px-2.5 py-1 text-sage shadow-inner"
                  initial={{ opacity: 0.75 }}
                  animate={{ opacity: 1 }}
                  transition={{ repeat: Infinity, repeatType: "reverse", duration: 0.65, ease: "easeInOut" }}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-coral shadow-[0_0_10px_hsl(9_100%_77%_/0.65)] motion-safe:animate-pulse"
                    aria-hidden
                  />
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  <span className="font-semibold tracking-wide">Saving draft…</span>
                </motion.span>
              ) : lastSavedAt ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-sage/20 bg-muted/30 px-2 py-0.5 text-muted-foreground">
                  <Save className="h-3.5 w-3.5 text-sage" aria-hidden />
                  Synced {new Date(lastSavedAt).toLocaleTimeString()}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground/85">
                  <span className="h-1.5 w-1.5 rounded-full bg-terracotta/60" aria-hidden />
                  Auto-save every 3s when you type
                </span>
              )}
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="rounded-[var(--card-radius)] border-terracotta/35 text-foreground hover:bg-terracotta/10"
              disabled={pending || savePending}
              onClick={() => void handleDeleteDraft()}
            >
              Discard draft
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-[var(--card-radius)]"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="gap-2 rounded-[var(--card-radius)] bg-sage text-[#F8F5F0] shadow-soft transition-[transform,box-shadow] duration-200 ease-in-out hover:-translate-y-0.5 hover:bg-sage/92 hover:shadow-lift"
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
