"use client";

import { sendNewInboxEmailAction } from "@/app/(dashboard)/actions";
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
import { isLikelyValidRecipientEmail } from "@/lib/inbox-shared";
import { Loader2, Send } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful send with the thread id so the parent can focus it. */
  onSent?: (threadId: string) => void;
};

/**
 * Prompt 124 — Net-new email composer: To, Subject, body; sends via `sendNewInboxEmailAction`.
 */
export function ComposeNewEmailDialog({ open, onOpenChange, onSent }: Props) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setTo("");
    setSubject("");
    setBody("");
  }, [open]);

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
      toast({
        title: "Message sent",
        description: "Your email was delivered and saved to this inbox.",
        className: "border-border/50 bg-card shadow-soft",
      });
      onOpenChange(false);
      onSent?.(res.threadId);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-border/50 bg-gradient-to-b from-[hsl(var(--card))] via-card to-primary/[0.04] sm:max-w-lg">
        <DialogHeader className="space-y-1 text-left">
          <DialogTitle className="text-lg font-semibold tracking-tight">New message</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            Sends from your branded inbox address; replies use the same routing as campaign and reply sends.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4 pt-1">
          <div className="space-y-2">
            <Label htmlFor="compose-to" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
              className="h-11 rounded-xl border-border/55 bg-card/90 shadow-inner focus-visible:ring-primary/25"
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
              className="h-11 rounded-xl border-border/55 bg-card/90 shadow-inner focus-visible:ring-primary/25"
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
              className="min-h-[200px] resize-y rounded-2xl border-border/55 bg-card/90 text-[15px] leading-relaxed shadow-inner focus-visible:ring-primary/25"
            />
          </div>

          <DialogFooter className="flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="gap-2 rounded-xl shadow-soft" disabled={pending}>
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
