import Link from "next/link";
import { ArrowLeft, Bot } from "lucide-react";
import { AgentPipelineOverview } from "@/components/agents/agent-pipeline-overview";
import { Button } from "@/components/ui/button";

/** Prompt 114 — Agents subpage aligned with dashboard light aesthetic and hierarchy. */
export default function AgentsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-10 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild className="rounded-xl">
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Dashboard
          </Link>
        </Button>
      </div>

      <header className="space-y-3 rounded-2xl border border-border/50 bg-gradient-to-br from-card via-card to-muted/30 px-5 py-6 shadow-soft ring-1 ring-border/25 sm:px-7 sm:py-8">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/[0.08] text-primary shadow-sm ring-1 ring-primary/15">
            <Bot className="h-6 w-6" aria-hidden />
          </span>
          <div className="min-w-0 space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Agents</h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
              Orchestration graph, tools, and observability hooks — same premium workspace as the rest of your
              command center.
            </p>
          </div>
        </div>
      </header>

      <AgentPipelineOverview />
    </div>
  );
}
