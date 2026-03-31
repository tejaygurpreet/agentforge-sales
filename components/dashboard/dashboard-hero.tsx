"use client";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DEFAULT_BRAND_DISPLAY_NAME } from "@/lib/brand-prompt";
import { cn } from "@/lib/utils";
import type { WhiteLabelClientSettingsDTO } from "@/types";
import { FileText, Info, Layers, Radio, Sparkles } from "lucide-react";

type HeroProps = {
  /** Same `From` header as `sendTransactionalEmail` for this user (see `buildDynamicFromEmail`). */
  outboundFromPreview: string;
  /** Prompt 79 — dashboard hero title. */
  whiteLabel?: WhiteLabelClientSettingsDTO | null;
};

export function DashboardHero({ outboundFromPreview, whiteLabel }: HeroProps) {
  const title = whiteLabel?.appName?.trim() || DEFAULT_BRAND_DISPLAY_NAME;
  return (
    <header
      className={cn(
        "space-y-6 rounded-2xl border border-border/50 bg-gradient-to-br from-card via-card to-muted/40 px-5 py-6 shadow-soft ring-1 ring-border/30 backdrop-blur-sm",
        "motion-safe:animate-content-settle transition-[box-shadow,transform] duration-500 hover:shadow-lift hover:ring-primary/20 sm:px-7 sm:py-8",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="bg-gradient-to-br from-foreground via-foreground to-muted-foreground bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
              {title}
            </h1>
            <Badge
              variant="outline"
              className="border-primary/35 bg-primary/[0.08] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-primary shadow-sm"
            >
              Demo mode
            </Badge>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="rounded-full border border-border/60 bg-muted/40 p-1.5 text-muted-foreground transition-all duration-200 hover:scale-105 hover:bg-muted/70 hover:text-foreground active:scale-100"
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
                  className="cursor-default gap-1 border border-violet-200/80 bg-violet-500/[0.1] px-2.5 py-1 text-[11px] font-medium text-violet-800 shadow-sm"
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
                  className="cursor-default gap-1 border border-sky-200/80 bg-sky-500/[0.1] px-2.5 py-1 text-[11px] font-medium text-sky-800 shadow-sm"
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
                  className="cursor-default gap-1 border border-emerald-200/80 bg-emerald-500/[0.1] px-2.5 py-1 text-[11px] font-medium text-emerald-800 shadow-sm"
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
                  className="cursor-default gap-1 border border-amber-200/80 bg-amber-500/[0.1] px-2.5 py-1 text-[11px] font-medium text-amber-900 shadow-sm"
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

          <p className="max-w-2xl text-pretty text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
            <span className="font-semibold text-muted-foreground">From:</span>{" "}
            <span className="break-all font-mono text-[10px] text-foreground/90">
              {outboundFromPreview}
            </span>
          </p>

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
