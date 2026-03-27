"use client";

import type { CallTranscriptRow, ObjectionLibraryEntryRow } from "@/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function safeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

type Props = {
  transcripts: CallTranscriptRow[];
  objections: ObjectionLibraryEntryRow[];
};

/**
 * Prompt 83 — workspace living objection library + recent AI-transcribed calls.
 */
export function ObjectionLibrarySection({ transcripts, objections }: Props) {
  const hasData = transcripts.length > 0 || objections.length > 0;

  return (
    <section
      aria-labelledby="objection-library-heading"
      className="rounded-2xl border border-border/80 bg-card/40 shadow-sm backdrop-blur-sm"
    >
      <Card className="border-0 bg-transparent shadow-none">
        <CardHeader className="pb-2">
          <CardTitle id="objection-library-heading" className="text-xl">
            Objection library
          </CardTitle>
          <CardDescription className="text-pretty">
            Transcribed phone calls (Twilio) feed a shared workspace library. Qualification and nurture
            agents use these real buyer phrases on future campaigns.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8 pt-0">
          {!hasData ? (
            <p className="text-sm text-muted-foreground">
              No entries yet. When outbound calls complete, set your Twilio Voice{" "}
              <span className="font-medium text-foreground">status callback</span> to{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                /api/twilio/voice/status
              </code>{" "}
              (optional <code className="rounded bg-muted px-1.5 py-0.5 text-xs">?workspace_id=</code> for
              team workspaces). Recordings are transcribed with Groq and objections accumulate here.
            </p>
          ) : null}

          {objections.length > 0 ? (
            <div>
              <h3 className="mb-3 text-sm font-semibold tracking-tight text-foreground">
                Living objections
              </h3>
              <ul className="space-y-2 text-sm">
                {objections.map((o) => (
                  <li
                    key={o.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-border/60 bg-background/60 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 text-foreground">{o.objection_text}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      ×{o.use_count} ·{" "}
                      {new Date(o.last_seen_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {transcripts.length > 0 ? (
            <div>
              <h3 className="mb-3 text-sm font-semibold tracking-tight text-foreground">
                Recent call transcripts
              </h3>
              <ul className="space-y-4">
                {transcripts.map((t) => {
                  const obs = safeStringArray(t.objections);
                  const ins = safeStringArray(t.insights);
                  return (
                    <li
                      key={t.id}
                      className="rounded-xl border border-border/60 bg-background/50 p-4 text-sm shadow-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">{t.twilio_call_sid}</span>
                        {t.thread_id ? (
                          <span className="rounded bg-muted px-1.5 py-0.5">thread {t.thread_id}</span>
                        ) : null}
                        <span>
                          {new Date(t.created_at).toLocaleString(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </span>
                        {typeof t.recording_duration_sec === "number" ? (
                          <span>{t.recording_duration_sec}s recorded</span>
                        ) : null}
                      </div>
                      {t.sentiment ? (
                        <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Sentiment: {t.sentiment}
                        </p>
                      ) : null}
                      {t.summary ? (
                        <p className="mt-2 leading-relaxed text-foreground">{t.summary}</p>
                      ) : null}
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs font-medium text-primary">
                          Full transcript
                        </summary>
                        <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                          {t.transcript}
                        </p>
                      </details>
                      {obs.length > 0 ? (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-foreground">Extracted objections</p>
                          <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                            {obs.map((x, i) => (
                              <li key={i}>{x}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {ins.length > 0 ? (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-foreground">Insights</p>
                          <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                            {ins.map((x, i) => (
                              <li key={i}>{x}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
