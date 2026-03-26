"use client";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ChevronDown, Crown, Lock, Sparkles } from "lucide-react";

/**
 * Prompt 71 — optional collapsible differentiators (self-hosted, dossier depth, voices).
 * Does not alter pipeline behavior.
 */
export function CompetitiveEdgePanel({ className }: { className?: string }) {
  return (
    <details
      className={cn(
        "group premium-surface rounded-2xl border border-border/50 bg-gradient-to-br from-card/90 via-card/70 to-muted/[0.2] shadow-lg ring-1 ring-white/[0.04] backdrop-blur-sm transition-all duration-300 open:shadow-xl open:ring-primary/15 dark:from-card/80 dark:via-card/50 dark:to-muted/10",
        className,
      )}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 sm:px-6 sm:py-5 [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="rounded-lg border border-amber-500/30 bg-amber-500/[0.12] p-1.5 text-amber-700 dark:text-amber-200">
            <Crown className="h-4 w-4 shrink-0" aria-hidden />
          </span>
          <span className="text-sm font-semibold tracking-tight text-foreground sm:text-base">
            How AgentForge beats typical AI SDR & enrichment tools
          </span>
          <Badge
            variant="outline"
            className="hidden border-primary/35 bg-primary/[0.08] text-[10px] uppercase tracking-widest text-primary sm:inline-flex"
          >
            Why we win
          </Badge>
        </div>
        <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t border-border/40 px-5 pb-5 pt-4 text-sm leading-relaxed text-muted-foreground sm:px-6">
        <ul className="space-y-3">
          <li className="flex gap-3">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500 dark:text-emerald-400" />
            <span>
              <strong className="font-medium text-foreground">Self-hosted ownership</strong> — your
              campaigns, data, and branding stay in your Supabase workspace; no black-box SaaS lock-in
              like Clay or Regie routing your GTM data through their cloud alone.
            </span>
          </li>
          <li className="flex gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-500 dark:text-violet-400" />
            <span>
              <strong className="font-medium text-foreground">Consultant-grade dossier</strong> — up
              to six pages with composite scores, reasoning trace, BANT hypotheses, nurture playbook,
              optional logo, and dark-mode PDF export; most competitors stop at email or LinkedIn
              drafts.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-primary/15 text-[10px] font-bold text-primary">
              5
            </span>
            <span>
              <strong className="font-medium text-foreground">Five SDR voice presets</strong> — warm,
              challenger, data-driven, enterprise, and default; each injects a voice-first system
              block ahead of every agent so outputs feel like different products, not one bland model.
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="ml-1 inline text-primary underline decoration-primary/40 underline-offset-2"
                  >
                    Details
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-left leading-relaxed" side="top">
                  Presets steer research phrasing, subject lines, email HTML, LinkedIn, objections,
                  and nurture — not just a tone slider on a single template.
                </TooltipContent>
              </Tooltip>
            </span>
          </li>
        </ul>
      </div>
    </details>
  );
}
