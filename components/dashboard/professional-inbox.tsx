"use client";

import {
  analyzeInboxMessageAction,
  archiveInboxThreadAction,
  deleteInboxDraftAction,
  getInboxDraftCountAction,
  listInboxDraftsAction,
  listInboxMessagesAction,
  listInboxThreadsAction,
  markInboxThreadReadAction,
  sendInboxReplyAction,
  setInboxThreadLabelsAction,
  snoozeInboxThreadAction,
} from "@/app/(dashboard)/actions";
import { ComposeNewEmailDialog } from "@/components/dashboard/compose-new-email-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useInboxUnread } from "@/components/dashboard/inbox-unread-context";
import { useInboxRealtime } from "@/hooks/use-inbox-realtime";
import {
  INBOX_POLL_INTERVAL_MS,
  INBOX_SEARCH_DEBOUNCE_MS,
} from "@/lib/inbox-shared";
import type { InboxDraftRow, InboxMessageRow, InboxThreadRow } from "@/lib/inbox";
import {
  applyInboxThreadFilter,
  threadIsArchived,
  threadIsSnoozed,
  type InboxThreadFilter,
} from "@/lib/inbox-filters";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { ProspectReplyAnalysisPayload } from "@/types";
import { toast } from "@/hooks/use-toast";
import {
  Archive,
  ChevronLeft,
  FileText,
  Inbox,
  Keyboard,
  Layers,
  Loader2,
  Mail,
  MoreHorizontal,
  Radio,
  RefreshCw,
  Search,
  Send,
  SendHorizontal,
  SquarePen,
  Sparkles,
  Trash2,
} from "lucide-react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

function prospectInitials(email: string): string {
  const local = email.split("@")[0] ?? "?";
  const cleaned = local.replace(/[^a-zA-Z0-9.]/g, " ").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase().slice(0, 2);
  }
  return local.slice(0, 2).toUpperCase() || "?";
}

export type ProfessionalInboxProps = {
  /** Prompt 116 — server-prefetched threads for instant first paint. */
  initialThreads?: InboxThreadRow[];
  /** Prompt 129 — server-prefetched drafts for instant Drafts tab. */
  initialDrafts?: InboxDraftRow[];
  /** Prompt 119 — sync tab badge when threads refresh on the Inbox tab. */
  onUnreadCountChange?: (count: number) => void;
  /** Prompt 136 — open compose from `/inbox?compose=1` (orb + quick access). */
  initialComposeOpen?: boolean;
};

function InboxAnalysisInline({
  analysis,
  persistError,
}: {
  analysis: ProspectReplyAnalysisPayload;
  persistError?: string | null;
}) {
  return (
    <div
      className="animate-in fade-in slide-in-from-bottom-2 space-y-4 rounded-2xl border border-border/45 bg-gradient-to-b from-accent/[0.06] via-card to-primary/[0.04] p-4 shadow-inner duration-300 sm:p-5"
      role="region"
      aria-label="AI analysis"
    >
      {persistError ? (
        <p
          className="rounded-xl border border-amber-400/45 bg-amber-500/[0.1] px-3 py-2 text-xs leading-relaxed text-amber-950"
          role="status"
        >
          <span className="font-semibold">Not saved to Replies: </span>
          {persistError}
        </p>
      ) : null}
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        AI analysis
      </p>
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary" className="font-medium capitalize shadow-sm">
          Sentiment · {analysis.sentiment}
        </Badge>
        <Badge className="border border-sage/25 bg-sage font-medium text-[#fafaf8] shadow-sm hover:bg-sage/95">
          Interest · {analysis.interest_level_0_to_10}/10
        </Badge>
        <Badge
          variant="outline"
          className="border-accent/45 bg-accent/[0.1] font-medium text-accent-foreground"
        >
          Voice · {analysis.suggested_voice_label}
        </Badge>
      </div>
      {analysis.buying_signals.length > 0 ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Buying signals
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1.5 text-sm leading-relaxed text-foreground/95">
            {analysis.buying_signals.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {analysis.objections_detected.length > 0 ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Objections / friction
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1.5 text-sm leading-relaxed text-foreground/95">
            {analysis.objections_detected.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="rounded-xl border border-border/50 bg-card/85 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Suggested next nurture step
        </p>
        <p className="mt-2 text-sm leading-relaxed text-foreground">
          {analysis.suggested_next_nurture_step}
        </p>
      </div>
      <div className="rounded-xl border border-border/45 bg-muted/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        <span className="font-semibold uppercase tracking-wide text-foreground/85">Rationale · </span>
        {analysis.rationale}
      </div>
    </div>
  );
}

/** Prompt 132 — Sub-filters when `mailFolder === "inbox"` (sidebar handles Sent / Drafts / Archived). */
const FILTER_OPTIONS: { id: InboxThreadFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "campaign", label: "Campaign replies" },
  { id: "needs_review", label: "Needs AI" },
  { id: "reviewed", label: "Reviewed" },
];

type MailFolder = "inbox" | "sent" | "drafts" | "archived";

const LABEL_PRESETS: { slug: string; label: string }[] = [
  { slug: "priority", label: "Priority" },
  { slug: "follow-up", label: "Follow-up" },
  { slug: "nurture", label: "Nurture" },
];

function InboxThreadActionsMenu({
  thread,
  onMarkRead,
  onArchive,
  onSnooze,
  onToggleLabel,
}: {
  thread: InboxThreadRow;
  onMarkRead: (t: InboxThreadRow) => void;
  onArchive: (t: InboxThreadRow) => void;
  onSnooze: (t: InboxThreadRow, hours: 1 | 24 | 168 | null) => void;
  onToggleLabel: (t: InboxThreadRow, slug: string) => void;
}) {
  const archived = threadIsArchived(thread);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          aria-label="Thread actions"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 rounded-xl border-border/60 bg-popover/95 shadow-soft backdrop-blur-sm"
      >
        <DropdownMenuItem className="rounded-lg" onClick={() => onMarkRead(thread)}>
          Mark as read
        </DropdownMenuItem>
        <DropdownMenuItem className="rounded-lg" onClick={() => onArchive(thread)}>
          {archived ? "Move to inbox" : "Archive"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="rounded-lg">Snooze</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="rounded-xl border-border/60">
            <DropdownMenuItem className="rounded-lg" onClick={() => onSnooze(thread, 1)}>
              1 hour
            </DropdownMenuItem>
            <DropdownMenuItem className="rounded-lg" onClick={() => onSnooze(thread, 24)}>
              24 hours
            </DropdownMenuItem>
            <DropdownMenuItem className="rounded-lg" onClick={() => onSnooze(thread, 168)}>
              7 days
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="rounded-lg" onClick={() => onSnooze(thread, null)}>
              Clear snooze
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="rounded-lg">Labels</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="rounded-xl border-border/60">
            {LABEL_PRESETS.map((p) => (
              <DropdownMenuCheckboxItem
                key={p.slug}
                className="rounded-lg"
                checked={(thread.labels ?? []).includes(p.slug)}
                onCheckedChange={() => onToggleLabel(thread, p.slug)}
              >
                {p.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Prompt 115–122 — Premium inbox: campaign-linked rows, debounced search, shortcuts, responsive panes, Realtime.
 */
export function ProfessionalInbox({
  initialThreads = [],
  initialDrafts = [],
  onUnreadCountChange,
  initialComposeOpen = false,
}: ProfessionalInboxProps) {
  const router = useRouter();
  const { setDraftCount, draftCount } = useInboxUnread();
  const [threads, setThreads] = useState<InboxThreadRow[]>(initialThreads);
  const threadsRef = useRef(threads);
  threadsRef.current = threads;
  const [messages, setMessages] = useState<InboxMessageRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [threadFilter, setThreadFilter] = useState<InboxThreadFilter>("all");
  const [mailFolder, setMailFolder] = useState<MailFolder>("inbox");
  const [loadingList, setLoadingList] = useState(() => (initialThreads?.length ?? 0) === 0);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [pending, startTransition] = useTransition();
  const [sendPending, startSend] = useTransition();
  const [, startThreadMutation] = useTransition();
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeIntent, setComposeIntent] = useState<"new" | "edit">("new");
  const [composeDraftIdToLoad, setComposeDraftIdToLoad] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<InboxDraftRow[]>(initialDrafts);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [analyzeId, setAnalyzeId] = useState<string | null>(null);
  const [localAnalysis, setLocalAnalysis] = useState<
    Record<string, ProspectReplyAnalysisPayload>
  >({});
  const [localPersistErr, setLocalPersistErr] = useState<Record<string, string>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void createClient()
      .auth.getUser()
      .then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!initialComposeOpen) return;
    setComposeIntent("new");
    setComposeDraftIdToLoad(null);
    setComposeOpen(true);
  }, [initialComposeOpen]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, INBOX_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [search]);

  useEffect(() => {
    setReplyDraft("");
  }, [selectedId]);

  const loadThreads = useCallback(async (q?: string) => {
    setLoadingList(threadsRef.current.length === 0);
    try {
      const rows = await listInboxThreadsAction(q?.trim() || undefined, {
        includeArchived: mailFolder === "archived",
        folder: mailFolder === "sent" ? "sent" : "inbox",
      });
      setThreads(rows);
      if (mailFolder !== "archived") {
        onUnreadCountChange?.(
          rows.filter((t) => t.has_unread === true && !threadIsSnoozed(t)).length,
        );
      }
    } finally {
      setLoadingList(false);
    }
  }, [mailFolder, onUnreadCountChange]);

  const loadDrafts = useCallback(async () => {
    setLoadingDrafts(true);
    try {
      const rows = await listInboxDraftsAction();
      setDrafts(rows);
    } finally {
      setLoadingDrafts(false);
    }
  }, []);

  const loadMessages = useCallback(async (threadId: string) => {
    setLoadingMsgs(true);
    try {
      const rows = await listInboxMessagesAction(threadId);
      setMessages(rows);
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  const refreshInbox = useCallback(() => {
    void loadThreads(debouncedSearch || undefined);
    if (selectedId) void loadMessages(selectedId);
  }, [loadThreads, loadMessages, debouncedSearch, selectedId]);

  const afterThreadSettings = useCallback(() => {
    void loadThreads(debouncedSearch || undefined);
    if (selectedId) void loadMessages(selectedId);
    router.refresh();
  }, [loadThreads, loadMessages, debouncedSearch, selectedId, router]);

  const handleMarkReadThread = useCallback(
    (t: InboxThreadRow) => {
      startThreadMutation(async () => {
        const r = await markInboxThreadReadAction(t.id);
        if (!r.ok) {
          toast({
            variant: "destructive",
            title: "Could not update",
            description: "Try again in a moment.",
          });
          return;
        }
        toast({ title: "Marked as read", className: "border-border/50 bg-card shadow-soft" });
        afterThreadSettings();
      });
    },
    [afterThreadSettings],
  );

  const handleArchiveThread = useCallback(
    (t: InboxThreadRow) => {
      const archived = !threadIsArchived(t);
      startThreadMutation(async () => {
        const res = await archiveInboxThreadAction({ thread_id: t.id, archived });
        if (!res.ok) {
          toast({ variant: "destructive", title: "Could not update", description: res.error });
          return;
        }
        toast({
          title: archived ? "Archived" : "Restored to inbox",
          className: "border-border/50 bg-card shadow-soft",
        });
        if (archived && selectedId === t.id) setSelectedId(null);
        afterThreadSettings();
      });
    },
    [afterThreadSettings, selectedId],
  );

  const handleSnoozeThread = useCallback(
    (t: InboxThreadRow, hours: 1 | 24 | 168 | null) => {
      startThreadMutation(async () => {
        const res = await snoozeInboxThreadAction({ thread_id: t.id, hours });
        if (!res.ok) {
          toast({ variant: "destructive", title: "Could not snooze", description: res.error });
          return;
        }
        toast({
          title: hours == null ? "Snooze cleared" : "Snoozed",
          description:
            hours == null
              ? "Thread is back in your main list."
              : "We’ll surface it again when it’s time.",
          className: "border-border/50 bg-gradient-to-r from-muted/90 via-card to-accent/25 shadow-soft",
        });
        if (hours != null && selectedId === t.id) setSelectedId(null);
        afterThreadSettings();
      });
    },
    [afterThreadSettings, selectedId],
  );

  const handleDeleteDraftRow = useCallback(
    (id: string) => {
      startThreadMutation(async () => {
        const res = await deleteInboxDraftAction({ id });
        if (!res.ok) {
          toast({ variant: "destructive", title: "Could not delete draft", description: res.error });
          return;
        }
        toast({ title: "Draft deleted", className: "border-border/50 bg-card shadow-soft" });
        await loadDrafts();
        const n = await getInboxDraftCountAction();
        setDraftCount(n);
      });
    },
    [loadDrafts, setDraftCount],
  );

  const handleToggleLabel = useCallback(
    (t: InboxThreadRow, slug: string) => {
      startThreadMutation(async () => {
        const cur = [...(t.labels ?? [])];
        const ix = cur.indexOf(slug);
        if (ix >= 0) cur.splice(ix, 1);
        else cur.push(slug);
        const res = await setInboxThreadLabelsAction({ thread_id: t.id, labels: cur });
        if (!res.ok) {
          toast({ variant: "destructive", title: "Labels", description: res.error });
          return;
        }
        toast({ title: "Labels updated", className: "border-border/50 bg-card shadow-soft" });
        afterThreadSettings();
      });
    },
    [afterThreadSettings],
  );

  useInboxRealtime(userId, refreshInbox);

  useEffect(() => {
    if (mailFolder === "drafts") {
      void loadDrafts();
      return;
    }
    void loadThreads(debouncedSearch || undefined);
  }, [loadThreads, loadDrafts, debouncedSearch, mailFolder]);

  useEffect(() => {
    const id = window.setInterval(() => {
      refreshInbox();
    }, INBOX_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refreshInbox]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    setLocalAnalysis({});
    setLocalPersistErr({});
    void loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  useEffect(() => {
    if (!selectedId || loadingMsgs) return;
    void (async () => {
      const r = await markInboxThreadReadAction(selectedId);
      if (r.ok) void loadThreads(debouncedSearch || undefined);
    })();
  }, [selectedId, loadingMsgs, loadThreads, debouncedSearch]);

  useEffect(() => {
    if (mailFolder === "drafts") setSelectedId(null);
  }, [mailFolder]);

  useEffect(() => {
    setDrafts(initialDrafts);
  }, [initialDrafts]);

  const filteredThreads = useMemo(() => {
    if (mailFolder === "drafts") return [];
    if (mailFolder === "sent" || mailFolder === "archived") {
      return applyInboxThreadFilter(threads, "all");
    }
    return applyInboxThreadFilter(threads, threadFilter);
  }, [threads, threadFilter, mailFolder]);

  const filteredDrafts = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return drafts;
    return drafts.filter(
      (d) =>
        d.to_email.toLowerCase().includes(q) ||
        d.subject.toLowerCase().includes(q) ||
        d.body_text.toLowerCase().includes(q),
    );
  }, [drafts, debouncedSearch]);

  const showDraftsList = mailFolder === "drafts";

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = search.trim();
    setDebouncedSearch(q);
    void loadThreads(q || undefined);
  }

  function runAnalyze(messageId: string) {
    setAnalyzeId(messageId);
    startTransition(async () => {
      const res = await analyzeInboxMessageAction(messageId);
      setAnalyzeId(null);
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Could not analyze",
          description: res.error,
        });
        return;
      }
      setLocalAnalysis((prev) => ({ ...prev, [messageId]: res.analysis }));
      if (res.persistError) {
        setLocalPersistErr((prev) => ({ ...prev, [messageId]: res.persistError! }));
      } else {
        setLocalPersistErr((prev) => {
          const n = { ...prev };
          delete n[messageId];
          return n;
        });
      }
      if (res.persisted) {
        toast({ title: "Reply analyzed", description: "Saved to your reply history." });
      } else if (res.persistError) {
        toast({ variant: "destructive", title: "Analysis partial", description: res.persistError });
      } else {
        toast({ title: "Analyzed", description: "Results shown below." });
      }
      if (selectedId) void loadMessages(selectedId);
      void loadThreads(debouncedSearch || undefined);
      router.refresh();
    });
  }

  function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !replyDraft.trim()) return;
    startSend(async () => {
      const res = await sendInboxReplyAction({
        thread_id: selectedId,
        body: replyDraft.trim(),
      });
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Could not send",
          description: res.error,
        });
        return;
      }
      toast({ title: "Reply sent", description: "Your message was delivered." });
      setReplyDraft("");
      if (selectedId) void loadMessages(selectedId);
      void loadThreads(debouncedSearch || undefined);
      router.refresh();
    });
  }

  const selectedThread = useMemo(
    () => threads.find((t) => t.id === selectedId),
    [threads, selectedId],
  );

  useEffect(() => {
    if (!loadingMsgs && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [loadingMsgs, messages, selectedId]);

  useEffect(() => {
    function isTypingTarget(t: EventTarget | null): boolean {
      if (!t || !(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) {
        if (e.key === "Escape") {
          (e.target as HTMLElement).blur();
        }
        return;
      }

      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === "r" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        void loadThreads(debouncedSearch || undefined);
        if (selectedId) void loadMessages(selectedId);
        return;
      }
      if (e.key === "Escape" && selectedId) {
        e.preventDefault();
        setSelectedId(null);
        return;
      }

      const list = filteredThreads;
      if (list.length === 0) return;
      const idx = selectedId ? list.findIndex((t) => t.id === selectedId) : -1;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        if (idx < 0) {
          setSelectedId(list[0]!.id);
          return;
        }
        const next = idx < list.length - 1 ? idx + 1 : idx;
        setSelectedId(list[next]!.id);
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        if (idx < 0) {
          setSelectedId(list[list.length - 1]!.id);
          return;
        }
        const prev = idx > 0 ? idx - 1 : idx;
        setSelectedId(list[prev]!.id);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filteredThreads, selectedId, debouncedSearch, loadThreads, loadMessages]);

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="relative overflow-hidden rounded-[var(--card-radius)] border border-highlight/20 bg-gradient-to-br from-card via-white to-highlight/[0.06] px-5 py-5 shadow-lift ring-1 ring-sage/12 sm:px-7 sm:py-6">
        <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-gradient-to-br from-highlight/20 to-transparent blur-3xl motion-safe:animate-glow-orb" aria-hidden />
        <div className="pointer-events-none absolute -bottom-12 -left-10 h-40 w-40 rounded-full bg-gradient-to-tr from-sage/18 to-transparent blur-2xl" aria-hidden />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--card-radius)] border border-highlight/30 bg-gradient-to-br from-sage/[0.18] via-highlight/[0.1] to-terracotta/[0.1] text-sage shadow-inner ring-1 ring-sage/20">
              <Inbox className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                Professional inbox
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Campaign sends are linked here automatically; prospect replies land via your Resend inbound
                webhook, then surface through{" "}
                <span className="inline-flex items-center gap-1 font-medium text-foreground">
                  <Radio className="h-3.5 w-3.5 text-sage" aria-hidden />
                  Realtime
                </span>{" "}
                when enabled, with gentle backup polling.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="relative gap-2 rounded-[var(--card-radius)] bg-gradient-to-r from-sage to-sage/90 text-[#F8F5F0] shadow-soft ring-1 ring-highlight/25 transition-[transform,box-shadow] duration-200 ease-in-out hover:scale-[1.04] hover:shadow-glow hover:ring-highlight/35"
              onClick={() => {
                setComposeIntent("new");
                setComposeDraftIdToLoad(null);
                setComposeOpen(true);
              }}
            >
              <SquarePen className="h-4 w-4" aria-hidden />
              Compose
              {draftCount > 0 ? (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-terracotta px-1 text-[10px] font-bold tabular-nums text-[#3a322c] shadow-md ring-2 ring-[#F8F5F0]">
                  {draftCount > 99 ? "99+" : draftCount}
                </span>
              ) : null}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 rounded-xl"
              disabled={loadingList}
              onClick={() => void loadThreads(search.trim() || debouncedSearch || undefined)}
            >
              <RefreshCw className={cn("h-4 w-4", loadingList && "animate-spin")} aria-hidden />
              Refresh
            </Button>
          </div>
        </div>

        <form onSubmit={onSearchSubmit} className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search subject, preview, or address…"
              className="h-11 rounded-xl border-border/60 bg-card/80 pl-10 shadow-inner transition-shadow duration-200 focus-visible:ring-sage/30"
              autoComplete="off"
              name="inbox-search"
            />
          </div>
          <Button type="submit" variant="secondary" className="h-11 rounded-xl">
            Search
          </Button>
        </form>

        {mailFolder === "inbox" ? (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible">
            <span className="mr-1 shrink-0 self-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Filter
            </span>
            {FILTER_OPTIONS.map((opt) => (
              <Button
                key={opt.id}
                type="button"
                size="sm"
                variant={threadFilter === opt.id ? "default" : "outline"}
                className={cn(
                  "h-8 shrink-0 rounded-full px-3 text-xs transition-[transform,box-shadow] duration-200 ease-in-out",
                  threadFilter === opt.id && "shadow-soft",
                )}
                onClick={() => setThreadFilter(opt.id)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        ) : null}
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground/90">
          <span className="inline-flex items-center gap-1">
            <Keyboard className="h-3 w-3 opacity-70" aria-hidden />
            Shortcuts
          </span>
          <span>
            <kbd className="rounded border border-border/60 bg-muted/50 px-1 font-mono text-[9px]">/</kbd> search
          </span>
          <span>
            <kbd className="rounded border border-border/60 bg-muted/50 px-1 font-mono text-[9px]">j</kbd>
            <kbd className="rounded border border-border/60 bg-muted/50 px-1 font-mono text-[9px]">k</kbd> thread
          </span>
          <span>
            <kbd className="rounded border border-border/60 bg-muted/50 px-1 font-mono text-[9px]">r</kbd> refresh
          </span>
          <span>
            <kbd className="rounded border border-border/60 bg-muted/50 px-1 font-mono text-[9px]">esc</kbd> back
          </span>
        </p>
      </div>

      <div className="grid min-h-[min(85vh,640px)] grid-cols-1 gap-4 lg:grid-cols-[minmax(200px,220px)_minmax(260px,360px)_minmax(0,1fr)]">
        <nav
          className="premium-card-spec flex flex-row gap-2 overflow-x-auto rounded-[var(--card-radius)] border border-border/40 bg-white p-3 shadow-soft ring-1 ring-black/[0.04] lg:flex-col lg:gap-1 lg:overflow-visible lg:p-4"
          aria-label="Mail folders"
        >
          {(
            [
              { id: "inbox" as const, label: "Inbox", icon: Inbox },
              { id: "sent" as const, label: "Sent", icon: SendHorizontal },
              { id: "drafts" as const, label: "Drafts", icon: FileText },
              { id: "archived" as const, label: "Archived", icon: Archive },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setMailFolder(item.id);
                if (item.id === "drafts") void loadDrafts();
              }}
              className={cn(
                "flex min-w-[7.5rem] items-center gap-2 rounded-[12px] px-3 py-2.5 text-left text-sm font-medium transition-[transform,box-shadow,background-color] duration-200 ease-in-out lg:min-w-0",
                mailFolder === item.id
                  ? "bg-sage/15 text-foreground shadow-sm ring-1 ring-sage/30"
                  : "text-muted-foreground hover:scale-[1.02] hover:bg-muted/50 hover:text-foreground hover:shadow-sm",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0 text-sage" aria-hidden />
              <span className="truncate">{item.label}</span>
              {item.id === "drafts" && draftCount > 0 ? (
                <span className="ml-auto rounded-full bg-terracotta/90 px-1.5 py-0.5 text-[10px] font-semibold text-[#3a322c]">
                  {draftCount > 99 ? "99+" : draftCount}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
        <div
          className={cn(
            "flex flex-col overflow-hidden rounded-[var(--card-radius)] border border-border/50 bg-card/90 shadow-soft ring-1 ring-black/[0.03]",
            selectedId && "hidden lg:flex",
          )}
        >
          <div className="flex items-center justify-between border-b border-border/40 bg-gradient-to-r from-muted/25 to-transparent px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {showDraftsList ? "Drafts" : "Conversations"}
            </p>
            <span className="text-[10px] text-muted-foreground">
              {showDraftsList ? `${filteredDrafts.length} shown` : `${filteredThreads.length} shown`}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-y-contain p-2 touch-pan-y">
            {showDraftsList ? (
              loadingDrafts && drafts.length === 0 ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin opacity-60" aria-hidden />
                </div>
              ) : filteredDrafts.length === 0 ? (
                <div className="animate-in fade-in zoom-in-95 flex flex-col items-center justify-center px-4 py-14 text-center duration-300">
                  <div className="mb-4 rounded-2xl border border-[color-mix(in_srgb,#C8A48A_35%,hsl(var(--border)))] bg-gradient-to-br from-[color-mix(in_srgb,#C8A48A_12%,transparent)] via-card to-[color-mix(in_srgb,#9CA88B_08%,transparent)] p-5 shadow-inner ring-1 ring-black/[0.04]">
                    <FileText className="mx-auto h-9 w-9 text-[#9CA88B]" aria-hidden />
                  </div>
                  <p className="text-sm font-medium text-foreground/90">No drafts yet</p>
                  <p className="mt-2 max-w-[18rem] text-xs leading-relaxed text-muted-foreground">
                    Compose saves automatically every few seconds — your work survives tab closes and refresh.
                  </p>
                </div>
              ) : (
                <ul className="space-y-1">
                  {filteredDrafts.map((d) => (
                    <li
                      key={d.id}
                      className="flex gap-1 rounded-xl border border-transparent transition-all duration-200 hover:border-[color-mix(in_srgb,#9CA88B_25%,transparent)] hover:bg-[color-mix(in_srgb,#9CA88B_06%,hsl(var(--card)))]"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setComposeIntent("edit");
                          setComposeDraftIdToLoad(d.id);
                          setComposeOpen(true);
                        }}
                        className="min-w-0 flex-1 rounded-xl px-3 py-3 text-left outline-none transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0 text-[#9CA88B]" aria-hidden />
                          <span className="truncate text-sm font-medium text-foreground">
                            {d.to_email.trim() || "(no recipient)"}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                          {d.subject.trim() || "(no subject)"}
                        </p>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground/90">
                          {d.body_text.trim() || "—"}
                        </p>
                        <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
                          {new Date(d.updated_at).toLocaleString()}
                        </p>
                      </button>
                      <div className="flex shrink-0 items-start pt-1.5 pr-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0 rounded-lg text-muted-foreground hover:bg-[color-mix(in_srgb,#C8A48A_15%,transparent)] hover:text-[#5c4a42]"
                          aria-label="Delete draft"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteDraftRow(d.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            ) : loadingList && threads.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin opacity-60" aria-hidden />
              </div>
            ) : filteredThreads.length === 0 ? (
              <div className="animate-in fade-in zoom-in-95 flex flex-col items-center justify-center px-4 py-14 text-center duration-300">
                <div className="mb-4 rounded-2xl border border-border/40 bg-gradient-to-br from-primary/[0.08] via-card to-accent/[0.06] p-5 shadow-inner ring-1 ring-black/[0.04]">
                  <Mail className="mx-auto h-9 w-9 text-sage/75" aria-hidden />
                </div>
                <p className="text-sm font-medium text-foreground/90">
                  {threads.length === 0 ? "Your inbox is ready" : "Nothing matches"}
                </p>
                <p className="mt-2 max-w-[18rem] text-xs leading-relaxed text-muted-foreground">
                  {threads.length === 0 ? (
                    <>
                      Send from Workspace outreach or compose here. Replies arrive via webhook and appear as
                      threads — calm, grouped, and yours alone.
                    </>
                  ) : (
                    <>Try another filter or clear search to see more conversations.</>
                  )}
                </p>
              </div>
            ) : (
              <ul className="space-y-1">
                {filteredThreads.map((t) => {
                  const active = t.id === selectedId;
                  return (
                    <li
                      key={t.id}
                      className={cn(
                        "flex gap-0.5 rounded-xl transition-all duration-200",
                        active ? "bg-gradient-to-r from-primary/[0.12] to-transparent shadow-sm ring-1 ring-primary/25" : "hover:bg-muted/45",
                        !active && t.campaign_thread_id ? "ring-1 ring-accent/50/15" : null,
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedId(t.id)}
                        className="min-w-0 flex-1 rounded-xl px-3 py-3 text-left outline-none transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            {t.has_unread ? (
                              <span
                                className="h-2 w-2 shrink-0 rounded-full bg-[#9CA88B] shadow-[0_0_0_3px_color-mix(in_srgb,#9CA88B_35%,transparent)]"
                                aria-label="Unread"
                              />
                            ) : (
                              <span className="h-2 w-2 shrink-0 rounded-full bg-transparent" aria-hidden />
                            )}
                            <span
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sage/25 to-terracotta/15 text-[10px] font-bold uppercase text-foreground ring-2 ring-white shadow-sm"
                              aria-hidden
                            >
                              {prospectInitials(t.prospect_email)}
                            </span>
                            <span
                              className={cn(
                                "truncate text-sm",
                                t.has_unread ? "font-semibold text-foreground" : "font-medium text-foreground",
                              )}
                            >
                              {t.prospect_email}
                            </span>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                            {t.campaign_thread_id ? (
                              <span
                                title="Linked to a Workspace campaign run"
                                className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent-foreground ring-1 ring-accent/25"
                              >
                                Campaign
                              </span>
                            ) : null}
                            {t.needs_review ? (
                              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-900 ring-1 ring-amber-400/30">
                                AI
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.subject || "—"}</p>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground/90">
                          {t.snippet}
                        </p>
                        {t.labels && t.labels.length > 0 ? (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {t.labels.map((lb) => (
                              <span
                                key={lb}
                                className="rounded-md border border-border/50 bg-muted/40 px-1.5 py-0 text-[9px] font-medium capitalize text-muted-foreground"
                              >
                                {lb.replace(/-/g, " ")}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
                          {new Date(t.last_message_at).toLocaleString()}
                        </p>
                      </button>
                      <div className="flex shrink-0 items-start pt-1.5 pr-1">
                        <InboxThreadActionsMenu
                          thread={t}
                          onMarkRead={handleMarkReadThread}
                          onArchive={handleArchiveThread}
                          onSnooze={handleSnoozeThread}
                          onToggleLabel={handleToggleLabel}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div
          className={cn(
            "flex min-h-[min(70vh,520px)] flex-col overflow-hidden rounded-[var(--card-radius)] border border-border/50 bg-gradient-to-b from-card via-card/98 to-muted/15 shadow-soft ring-1 ring-black/[0.03] lg:min-h-[min(85vh,640px)]",
            !selectedId && "hidden lg:flex",
          )}
        >
          {!selectedId ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center text-muted-foreground animate-in fade-in duration-500">
              <div className="rounded-2xl border border-border/45 bg-gradient-to-br from-muted/30 to-card p-6 shadow-soft ring-1 ring-black/[0.03]">
                <Mail className="h-11 w-11 text-sage/50" aria-hidden />
              </div>
              <p className="text-sm font-medium text-foreground/85">Select a conversation</p>
              <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                Open a thread on the left to read the full history, run AI on inbound replies, and send from
                your branded address.
              </p>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="shrink-0 border-b border-border/40 bg-gradient-to-r from-primary/[0.07] via-muted/15 to-transparent px-4 py-4 sm:px-5">
                <div className="flex items-start gap-2 sm:gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-0.5 h-9 w-9 shrink-0 rounded-xl text-muted-foreground lg:hidden"
                    onClick={() => setSelectedId(null)}
                    aria-label="Back to conversation list"
                  >
                    <ChevronLeft className="h-5 w-5" aria-hidden />
                  </Button>
                  <Layers className="mt-0.5 hidden h-4 w-4 shrink-0 text-muted-foreground lg:block" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Thread</p>
                    <p className="mt-1 truncate font-semibold text-foreground">{selectedThread?.prospect_email}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{selectedThread?.subject}</p>
                    {selectedThread?.labels && selectedThread.labels.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {selectedThread.labels.map((lb) => (
                          <Badge
                            key={lb}
                            variant="secondary"
                            className="rounded-md border border-border/45 bg-card/80 text-[10px] font-medium capitalize text-muted-foreground"
                          >
                            {lb.replace(/-/g, " ")}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    {selectedThread?.campaign_thread_id ? (
                      <p className="mt-2 text-[11px] text-accent-foreground/90">
                        Linked to campaign thread{" "}
                        <code className="rounded bg-accent/10 px-1 font-mono text-[10px]">
                          {selectedThread.campaign_thread_id.length > 36
                            ? `${selectedThread.campaign_thread_id.slice(0, 34)}…`
                            : selectedThread.campaign_thread_id}
                        </code>
                      </p>
                    ) : null}
                  </div>
                  {selectedThread ? (
                    <InboxThreadActionsMenu
                      thread={selectedThread}
                      onMarkRead={handleMarkReadThread}
                      onArchive={handleArchiveThread}
                      onSnooze={handleSnoozeThread}
                      onToggleLabel={handleToggleLabel}
                    />
                  ) : null}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain scroll-smooth bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sage/[0.05] via-transparent to-transparent px-3 py-5 touch-pan-y sm:px-5">
                {loadingMsgs ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-sage/70" aria-hidden />
                  </div>
                ) : (
                  <div className="mx-auto flex max-w-3xl flex-col gap-4">
                    {messages.map((m) => {
                      const analysisPayload = localAnalysis[m.id] ?? m.analysis ?? null;
                      const persistErr = localPersistErr[m.id];
                      const inbound = m.direction === "inbound";

                      return (
                        <div
                          key={m.id}
                          className={cn(
                            "flex w-full gap-2",
                            inbound ? "flex-row justify-start" : "flex-row-reverse justify-end",
                          )}
                        >
                          <span
                            className={cn(
                              "mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[10px] font-bold uppercase shadow-sm ring-2 ring-white",
                              inbound
                                ? "bg-gradient-to-br from-sage/30 to-terracotta/20 text-foreground"
                                : "bg-sage/25 text-foreground",
                            )}
                            aria-hidden
                          >
                            {inbound ? prospectInitials(m.from_email) : "Me"}
                          </span>
                          <div
                            className={cn(
                              "max-w-[min(100%,26rem)] rounded-[1.25rem] px-4 py-3.5 shadow-inner ring-1 transition-all duration-300",
                              inbound
                                ? "border border-border/40 bg-gradient-to-br from-card to-muted/25 ring-black/[0.05]"
                                : "border border-sage/25 bg-gradient-to-br from-sage/[0.18] via-sage/[0.1] to-card ring-sage/15",
                            )}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-[11px] font-medium text-muted-foreground">
                                {inbound ? "Prospect" : "You"}{" "}
                                <span className="font-normal text-muted-foreground/80">
                                  · {inbound ? m.from_email : m.to_email}
                                </span>
                              </span>
                              <time className="text-[10px] tabular-nums text-muted-foreground">
                                {new Date(m.received_at).toLocaleString()}
                              </time>
                            </div>
                            {inbound ? (
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-8 gap-1.5 rounded-full px-3 text-xs shadow-sm"
                                  disabled={pending && analyzeId === m.id}
                                  onClick={() => runAnalyze(m.id)}
                                >
                                  {pending && analyzeId === m.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                  ) : (
                                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                                  )}
                                  Analyze with AI
                                </Button>
                                {m.reply_analysis_id || localAnalysis[m.id] ? (
                                  <span className="rounded-full border border-sage/40 bg-sage/10 px-2 py-0.5 text-[10px] font-medium text-foreground">
                                    Analyzed
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                            <div
                              className={cn(
                                "mt-3 whitespace-pre-wrap text-[15px] leading-relaxed tracking-tight text-foreground",
                                inbound ? "" : "text-foreground/95",
                              )}
                            >
                              {m.body_text || "(No body)"}
                            </div>
                            {inbound && analysisPayload ? (
                              <div className="mt-4 border-t border-border/30 pt-4">
                                <InboxAnalysisInline
                                  analysis={analysisPayload}
                                  persistError={persistErr}
                                />
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} className="h-2 w-full shrink-0" aria-hidden />
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-border/45 bg-gradient-to-t from-muted/25 to-card/95 px-3 py-4 backdrop-blur-md sm:px-5">
                <form onSubmit={sendReply} className="mx-auto max-w-3xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Reply
                    </p>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {replyDraft.length.toLocaleString()} / 50,000
                    </span>
                  </div>
                  <Textarea
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    placeholder="Write a calm, professional reply…"
                    rows={5}
                    disabled={sendPending}
                    className="min-h-[130px] resize-y rounded-2xl border-border/55 bg-card/90 text-[15px] leading-relaxed shadow-inner ring-1 ring-black/[0.03] transition-shadow focus-visible:border-sage/35 focus-visible:ring-sage/25"
                    aria-label="Reply message"
                  />
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      type="submit"
                      className="gap-2 rounded-xl px-6 shadow-soft"
                      disabled={sendPending || !replyDraft.trim()}
                    >
                      {sendPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          Sending…
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" aria-hidden />
                          Send reply
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Sends from your branded inbox address; replies route back here for threading.
                  </p>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      <ComposeNewEmailDialog
        open={composeOpen}
        composeIntent={composeIntent}
        onOpenChange={(o) => {
          setComposeOpen(o);
          if (!o) {
            setComposeDraftIdToLoad(null);
            setComposeIntent("new");
          }
        }}
        draftIdToLoad={composeDraftIdToLoad}
        onDraftLoadConsumed={() => setComposeDraftIdToLoad(null)}
        onDraftCountChange={(n) => setDraftCount(n)}
        onSent={(threadId) => {
          setSelectedId(threadId);
          void loadThreads(debouncedSearch || undefined);
          void loadDrafts();
          router.refresh();
        }}
      />

      <Button
        type="button"
        size="icon"
        className="fixed bottom-6 right-5 z-40 h-14 w-14 rounded-full border-2 border-[#B45309]/45 bg-gradient-to-br from-[#EDE0D4] via-[#f3e9dc] to-[#dfc9a8] text-[#111827] shadow-[0_14px_40px_-12px_rgba(180,83,9,0.25)] ring-2 ring-white/90 transition-[transform,box-shadow] duration-300 ease-out hover:scale-105 hover:shadow-glow-copper active:scale-[0.98] sm:bottom-8 sm:right-8"
        onClick={() => {
          setComposeIntent("new");
          setComposeDraftIdToLoad(null);
          setComposeOpen(true);
        }}
        aria-label="Compose new email"
      >
        <SquarePen className="h-6 w-6" aria-hidden />
        {draftCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-[#B45309] px-1 text-[11px] font-bold tabular-nums text-white shadow-md ring-2 ring-[#F9F6F0]">
            {draftCount > 99 ? "99+" : draftCount}
          </span>
        ) : null}
      </Button>
    </motion.div>
  );
}
