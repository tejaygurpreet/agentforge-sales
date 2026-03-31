import type { BatchRunItem } from "@/types";
import {
  GitBranch,
  Loader2,
  Radar,
  Send,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const agents = [
  {
    id: "research",
    step: "1",
    name: "Research",
    description:
      "Deep account context: ICP score, sector read, 6–8-step reasoning trace, stakeholders, pains, angles, and BANT hypotheses tuned to this lead.",
    icon: Radar,
    accent: "border-primary/20 bg-primary/[0.08] text-muted-foreground",
  },
  {
    id: "outreach",
    step: "2",
    name: "Outreach",
    description:
      "Voice-matched email and LinkedIn — hooks from research, human cadence, and a frictionless reply path.",
    icon: Send,
    accent: "border-accent/35/90 bg-accent/[0.08] text-accent-foreground",
  },
  {
    id: "qualification",
    step: "3",
    name: "Qualification",
    description:
      "Buyer reality: score, objections, BANT synthesis, and a concrete next-best action with artifacts.",
    icon: Target,
    accent: "border-amber-200/90 bg-amber-500/[0.1] text-amber-950",
  },
  {
    id: "nurture",
    step: "4",
    name: "Nurture",
    description:
      "Three-step cadence with channel mix, value-add ideas, and timing rationale tied to objections.",
    icon: GitBranch,
    accent: "border-primary/25 bg-primary/[0.08] text-primary",
  },
] as const;

type ActiveAgentsProps = {
  /** Prompt 70 — optional parallel batch run progress. */
  batchProgress?: BatchRunItem[] | null;
};

function batchStatusBadge(status: BatchRunItem["status"]) {
  switch (status) {
    case "queued":
      return "bg-muted text-muted-foreground";
    case "running":
      return "border-primary/50 bg-primary/12 text-foreground";
    case "done":
      return "border-primary/40 bg-primary/12 text-foreground";
    case "error":
      return "border-red-500/40 bg-red-500/12 text-red-950";
    default:
      return "";
  }
}

export function ActiveAgents({ batchProgress }: ActiveAgentsProps) {
  return (
    <section className="space-y-6">
      {batchProgress && batchProgress.length > 0 ? (
        <div
          className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.05] via-card to-card px-5 py-4 shadow-soft ring-1 ring-primary/10 sm:px-6"
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold tracking-tight text-foreground">Batch run progress</h3>
            <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
              {batchProgress.filter((b) => b.status === "done").length}/{batchProgress.length} finished
            </span>
          </div>
          <ul className="mt-3 space-y-2">
            {batchProgress.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/50 bg-card/90 px-3 py-2.5 text-sm shadow-sm"
              >
                <span className="min-w-0 truncate font-medium">
                  {b.label}{" "}
                  <span className="text-muted-foreground">@ {b.company}</span>
                </span>
                <span className="flex items-center gap-2">
                  {b.status === "running" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  ) : null}
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] font-semibold uppercase tracking-wide",
                      batchStatusBadge(b.status),
                    )}
                  >
                    {b.status}
                  </Badge>
                  {b.threadId ? (
                    <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">
                      {b.threadId.slice(0, 18)}…
                    </span>
                  ) : null}
                </span>
                {b.error ? (
                  <p className="w-full text-xs text-destructive">{b.error}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="premium-surface rounded-2xl border border-border/50 bg-gradient-to-br from-card via-card to-muted/30 px-5 py-5 shadow-soft ring-1 ring-border/25 sm:px-6 sm:py-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">Active agents</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            LangGraph pipeline — each stage consumes the prior output and your selected{" "}
            <span className="font-medium text-foreground">SDR voice</span> preset. Research builds a
            consultant-grade dossier; outreach and qualification stay voice-matched end to end.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {agents.map((a) => (
          <Card
            key={a.id}
            className={cn(
              "group premium-card-interactive overflow-hidden rounded-xl border-border/55 bg-card shadow-soft ring-1 ring-border/20",
            )}
          >
            <CardHeader className="space-y-3 pb-3">
              <div className="flex items-start justify-between gap-2">
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border shadow-sm",
                    a.accent,
                  )}
                  aria-hidden
                >
                  <a.icon className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="rounded-md bg-muted/70 px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-muted-foreground">
                  {a.step}/4
                </span>
              </div>
              <div className="space-y-1">
                <CardTitle className="text-base font-semibold tracking-tight">{a.name}</CardTitle>
                <CardDescription className="text-[13px] leading-relaxed">{a.description}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <Badge variant="secondary" className="font-medium">
                Active
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
