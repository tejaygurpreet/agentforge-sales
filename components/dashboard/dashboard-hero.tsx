"use client";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";

export function DashboardHero() {
  return (
    <header className="space-y-5 rounded-2xl border border-border/50 bg-gradient-to-br from-card/90 via-card/70 to-muted/[0.35] px-5 py-6 shadow-md ring-1 ring-border/15 backdrop-blur-sm dark:from-card/80 dark:via-card/60 dark:to-muted/20 dark:ring-white/[0.06] sm:px-7 sm:py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl dark:from-foreground dark:to-muted-foreground">
              AgentForge Sales
            </h1>
            <Badge
              variant="outline"
              className="border-primary/35 bg-primary/[0.06] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-primary shadow-sm"
            >
              Demo mode
            </Badge>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="rounded-full border border-border/60 bg-muted/30 p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                  aria-label="What is demo mode?"
                >
                  <Info className="h-3.5 w-3.5" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-sm text-left leading-relaxed">
                Autonomous AI SDR pipeline: research, first touch, qualification, and nurture run
                end-to-end from a single lead submit. Outputs are structured for review — use your
                own judgment before production sends.
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Command center for production-style campaigns — tier-scored fit, playbook-ready exports,
            and one-click handoff. Choose an{" "}
            <span className="font-medium text-foreground">SDR voice & tone</span> preset; each run
            injects a <span className="font-medium text-foreground">voice-first system block</span>{" "}
            ahead of every agent — <span className="font-medium text-foreground">Warm</span>,{" "}
            <span className="font-medium text-foreground">Challenger</span>, and{" "}
            <span className="font-medium text-foreground">Data-Driven</span> read as clearly different
            products (subjects, bodies, LinkedIn, objections, nurture, NBA).{" "}
            <span className="font-medium text-foreground">Export</span> delivers Markdown, JSON
            summary, or a <span className="font-medium text-foreground">premium PDF</span> with an
            executive one-pager, optional logo and brand colors, plus the full dossier.{" "}
            <span className="font-medium text-foreground">Roadmap</span> cards preview batch scale, signals,
            and analytics. <span className="font-medium text-foreground">Re-run campaign</span> restores
            the saved lead (including voice) and starts a fresh thread.
          </p>
        </div>
      </div>
    </header>
  );
}
