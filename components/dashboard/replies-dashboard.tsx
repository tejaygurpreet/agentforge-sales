"use client";

import type { PersistedReplyAnalysisRow } from "@/types";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, MessageSquareText } from "lucide-react";
import { useMemo, useState } from "react";

type Props = {
  rows: PersistedReplyAnalysisRow[];
};

function formatWhen(iso: string): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function RepliesDashboard({ rows }: Props) {
  const [filterThread, setFilterThread] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const threadOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.thread_id?.trim()) set.add(r.thread_id.trim());
    }
    return [...set].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    if (filterThread === "all") return rows;
    return rows.filter((r) => (r.thread_id ?? "").trim() === filterThread);
  }, [rows, filterThread]);

  return (
    <div className="space-y-10">
      <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-emerald-500/[0.06] via-card to-card px-5 py-6 shadow-sm ring-1 ring-border/10 dark:from-emerald-500/[0.08] dark:via-card sm:px-7 sm:py-7">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Reply intelligence</h1>
          <Badge variant="outline" className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Saved analyses
          </Badge>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Full prospect messages, sentiment, interest score, objections, SDR voice, and next-step guidance —
          linked to the campaign thread when you run <strong className="font-medium text-foreground">Analyze &amp; save</strong> from a
          completed run.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="reply-thread-filter" className="text-sm font-medium text-muted-foreground">
          Campaign thread
        </label>
        <select
          id="reply-thread-filter"
          value={filterThread}
          onChange={(e) => setFilterThread(e.target.value)}
          className={cn(
            "h-9 w-[min(100%,320px)] rounded-md border border-input bg-background px-3 text-sm shadow-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <option value="all">All replies</option>
          {threadOptions.map((t) => (
            <option key={t} value={t}>
              {t.length > 48 ? `${t.slice(0, 46)}…` : t}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground tabular-nums">{filtered.length} shown</span>
      </div>

      {filtered.length === 0 ? (
        <Card className="rounded-xl border-dashed border-border/70 bg-muted/[0.2]">
          <CardHeader>
            <CardTitle className="text-base">
              {rows.length === 0 ? "No replies yet" : "No replies for this thread"}
            </CardTitle>
            <CardDescription>
              {rows.length === 0 ? (
                <>
                  Finish a campaign, then use <strong>Paste prospect reply</strong> under{" "}
                  <strong>Overall campaign strength</strong> and choose <strong>Analyze &amp; save</strong>. Each run
                  appears here with thread metadata.
                </>
              ) : (
                <>Choose <strong>All replies</strong> or another campaign thread — this filter has no matches.</>
              )}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="space-y-3">
          {filtered.map((r) => {
            const expanded = openId === r.id;
            const a = r.analysis;
            return (
              <li key={r.id}>
                <Card
                  className={cn(
                    "overflow-hidden rounded-xl border-border/70 bg-card/95 shadow-sm ring-1 ring-border/10 transition-shadow hover:shadow-md dark:ring-white/[0.05]",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(expanded ? null : r.id)}
                    className="flex w-full items-start gap-3 px-4 py-4 text-left sm:px-5"
                  >
                    <span className="mt-0.5 rounded-lg border border-border/60 bg-muted/30 p-2">
                      {expanded ? (
                        <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                      )}
                    </span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          {formatWhen(r.created_at)}
                        </span>
                        <Badge variant="secondary" className="capitalize">
                          {a.sentiment}
                        </Badge>
                        <Badge className="bg-emerald-600/90 text-white hover:bg-emerald-600">
                          Interest {a.interest_level_0_to_10}/10
                        </Badge>
                        <Badge variant="outline" className="border-violet-500/35 text-violet-950 dark:text-violet-100">
                          {a.suggested_voice_label}
                        </Badge>
                      </div>
                      <p className="text-sm leading-relaxed text-foreground/90 line-clamp-2">
                        {r.reply_preview || "—"}
                      </p>
                      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        {r.lead_name ? <span>{r.lead_name}</span> : null}
                        {r.company ? (
                          <span>
                            {r.lead_name ? "· " : ""}
                            {r.company}
                          </span>
                        ) : null}
                        {r.prospect_email ? (
                          <span className="truncate font-mono text-[10px]">
                            {(r.lead_name || r.company ? " · " : "") + r.prospect_email}
                          </span>
                        ) : null}
                        {r.thread_id ? (
                          <span className="font-mono text-[10px] opacity-80">
                            {r.lead_name || r.company || r.prospect_email ? " · " : ""}
                            {r.thread_id.length > 36 ? `${r.thread_id.slice(0, 34)}…` : r.thread_id}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                  {expanded ? (
                    <CardContent className="space-y-4 border-t border-border/60 bg-muted/5 px-4 py-5 sm:px-6">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Prospect message
                        </p>
                        <pre className="mt-2 max-h-[min(320px,50vh)] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/50 bg-background/90 p-3 font-sans text-[13px] leading-relaxed text-foreground/90">
                          {(r.reply_full ?? r.reply_preview ?? "").trim() || "—"}
                        </pre>
                      </div>
                      {a.buying_signals.length > 0 ? (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Buying signals
                          </p>
                          <ul className="mt-1.5 list-inside list-disc text-sm">
                            {a.buying_signals.map((s) => (
                              <li key={s}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {a.objections_detected.length > 0 ? (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Objections
                          </p>
                          <ul className="mt-1.5 list-inside list-disc text-sm">
                            {a.objections_detected.map((s) => (
                              <li key={s}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Next step
                        </p>
                        <p className="mt-1 text-sm leading-relaxed">{a.suggested_next_nurture_step}</p>
                      </div>
                      <div className="rounded-lg border border-border/50 bg-background/80 px-3 py-2 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground/80">Basis · </span>
                        {a.rationale}
                      </div>
                    </CardContent>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Card className="rounded-xl border-border/60 bg-muted/10">
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <MessageSquareText className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
          <CardTitle className="text-base">Tip</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Run a campaign, then use <strong>Paste prospect reply</strong> directly under Overall campaign strength
          — analyses are tagged with that{" "}
          <span className="font-medium text-foreground">thread id</span> automatically.
        </CardContent>
      </Card>
    </div>
  );
}
