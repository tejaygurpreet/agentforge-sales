import {
  GitBranch,
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
      "Deep account context: ICP score, sector read, stakeholders, pains, angles, and BANT-style hypotheses for the first call.",
    icon: Radar,
    accent: "border-sky-500/25 bg-sky-500/[0.08] text-sky-700 dark:text-sky-300",
  },
  {
    id: "outreach",
    step: "2",
    name: "Outreach",
    description:
      "Voice-matched email and LinkedIn — hooks from research, human cadence, and a frictionless reply path.",
    icon: Send,
    accent: "border-violet-500/25 bg-violet-500/[0.08] text-violet-800 dark:text-violet-200",
  },
  {
    id: "qualification",
    step: "3",
    name: "Qualification",
    description:
      "Buyer reality: score, objections, BANT synthesis, and a concrete next-best action with artifacts.",
    icon: Target,
    accent: "border-amber-500/25 bg-amber-500/[0.1] text-amber-950 dark:text-amber-100",
  },
  {
    id: "nurture",
    step: "4",
    name: "Nurture",
    description:
      "Three-step cadence with channel mix, value-add ideas, and timing rationale tied to objections.",
    icon: GitBranch,
    accent: "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-800 dark:text-emerald-300",
  },
] as const;

export function ActiveAgents() {
  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-border/50 bg-gradient-to-br from-card via-card to-muted/[0.35] px-5 py-5 shadow-sm ring-1 ring-border/10 dark:from-card dark:to-muted/15 sm:px-6 sm:py-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight sm:text-xl">Active agents</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            LangGraph pipeline — each stage consumes the prior output and your selected{" "}
            <span className="font-medium text-foreground">SDR voice</span> preset. All four run on every
            campaign unless a stage stops the graph.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {agents.map((a) => (
          <Card
            key={a.id}
            className={cn(
              "group overflow-hidden rounded-xl border-border/60 bg-card/95 shadow-md ring-1 ring-border/10",
              "transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:ring-primary/15 dark:ring-white/[0.06]",
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
                <span className="rounded-md bg-muted/60 px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-muted-foreground">
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
