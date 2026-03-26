"use client";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { FileText, Info, Layers, Radio, Sparkles } from "lucide-react";

export function DashboardHero() {
  return (
    <header
      className={cn(
        "space-y-5 rounded-2xl border border-border/50 bg-gradient-to-br from-card/95 via-card/80 to-muted/[0.25] px-5 py-6 shadow-lg ring-1 ring-white/[0.06] backdrop-blur-md",
        "transition-[box-shadow,transform] duration-500 hover:shadow-xl hover:ring-primary/15 sm:px-7 sm:py-8",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="bg-gradient-to-br from-foreground via-foreground to-muted-foreground bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
              AgentForge Sales
            </h1>
            <Badge
              variant="outline"
              className="border-primary/40 bg-primary/[0.08] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-primary shadow-sm"
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

          <div className="flex flex-wrap gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="secondary"
                  className="cursor-default gap-1 border border-violet-500/25 bg-violet-500/[0.12] px-2.5 py-1 text-[11px] font-medium text-violet-100 shadow-sm"
                >
                  <Sparkles className="h-3 w-3" aria-hidden />
                  5 SDR voices
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs leading-relaxed">
                Exclusive voice-first system layers: warm, challenger, data-driven, enterprise, and
                default — each steers research, outreach, qual, and nurture as distinct products.
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="secondary"
                  className="cursor-default gap-1 border border-sky-500/25 bg-sky-500/[0.12] px-2.5 py-1 text-[11px] font-medium text-sky-100 shadow-sm"
                >
                  <FileText className="h-3 w-3" aria-hidden />
                  Branded PDF dossier
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs leading-relaxed">
                Executive one-pager plus full multi-page dossier — your logo, colors, optional dark
                mode; most AI-SDR tools never ship a consultant-grade export.
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="secondary"
                  className="cursor-default gap-1 border border-emerald-500/25 bg-emerald-500/[0.1] px-2.5 py-1 text-[11px] font-medium text-emerald-100 shadow-sm"
                >
                  <Layers className="h-3 w-3" aria-hidden />
                  Batch + analytics
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs leading-relaxed">
                Parallel batch runs with per-lead progress, live signals storage, and an analytics tab
                with strength distribution — built for scale without losing the premium dossier.
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="secondary"
                  className="cursor-default gap-1 border border-amber-500/25 bg-amber-500/[0.1] px-2.5 py-1 text-[11px] font-medium text-amber-100 shadow-sm"
                >
                  <Radio className="h-3 w-3" aria-hidden />
                  Live signals
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs leading-relaxed">
                Post-research signal pass (funding, hiring, motion) stored for analytics and PDF —
                layered on top of deep research, not a shallow enrichment row.
              </TooltipContent>
            </Tooltip>
          </div>

          <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
            Command center for production-style campaigns — tier-scored fit, playbook-ready exports,
            and one-click handoff. Choose an{" "}
            <span className="font-medium text-foreground">SDR voice & tone</span> preset; each run
            injects a <span className="font-medium text-foreground">voice-first system block</span>{" "}
            ahead of every agent.{" "}
            <span className="font-medium text-foreground">Export</span> delivers Markdown, JSON, or a{" "}
            <span className="font-medium text-foreground">branded PDF</span> with composite scores and
            the full dossier. <span className="font-medium text-foreground">Re-run campaign</span>{" "}
            restores the saved lead and starts a fresh thread.
          </p>
        </div>
      </div>
    </header>
  );
}
