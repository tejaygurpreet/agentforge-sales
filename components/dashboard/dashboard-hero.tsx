"use client";

import { DashboardHeroArt } from "@/components/illustrations/dashboard-hero-art";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DEFAULT_BRAND_DISPLAY_NAME } from "@/lib/brand-prompt";
import { cn } from "@/lib/utils";
import type { WhiteLabelClientSettingsDTO } from "@/types";
import { motion } from "framer-motion";
import { FileText, Info, Layers, Mail, Radio, Sparkles } from "lucide-react";

type HeroProps = {
  outboundFromPreview: string;
  whiteLabel?: WhiteLabelClientSettingsDTO | null;
};

const flyingMailClass =
  "pointer-events-none absolute text-highlight drop-shadow-[0_6px_14px_hsl(32_95%_44%_/0.32)]";

export function DashboardHero({ outboundFromPreview, whiteLabel }: HeroProps) {
  const title = whiteLabel?.appName?.trim() || DEFAULT_BRAND_DISPLAY_NAME;

  const badgePulseTransition = (delay: number) => ({
    duration: 2.4,
    repeat: Infinity,
    ease: "easeInOut" as const,
    delay,
  });

  const badgePulseAnimate = {
    scale: [1, 1.045, 1],
    boxShadow: [
      "0 0 0 0 hsl(9 100% 77% / 0.25)",
      "0 0 0 10px hsl(9 100% 77% / 0)",
      "0 0 0 0 hsl(9 100% 77% / 0)",
    ],
  };

  return (
    <motion.header
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "dashboard-hero-energetic-bg relative overflow-hidden rounded-[var(--card-radius)] border border-highlight/22",
        "premium-card-spec shadow-lift ring-1 ring-sage/12",
      )}
    >
      <div
        className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-gradient-to-br from-highlight/22 via-terracotta/12 to-transparent blur-3xl motion-safe:animate-glow-orb"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-16 -left-12 h-56 w-56 rounded-full bg-gradient-to-tr from-sage/25 to-transparent blur-3xl"
        aria-hidden
      />

      <motion.div
        className={cn(flyingMailClass, "left-[6%] top-[14%] hidden sm:block")}
        animate={{ x: [0, 18, 0], y: [0, -14, 0], rotate: [-10, 4, -10] }}
        transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      >
        <Mail className="h-7 w-7 sm:h-8 sm:w-8" strokeWidth={2} />
      </motion.div>
      <motion.div
        className={cn(flyingMailClass, "right-[12%] top-[22%] opacity-90")}
        animate={{ x: [0, -24, 0], y: [0, 16, 0], rotate: [8, -12, 8] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
        aria-hidden
      >
        <Mail className="h-6 w-6 text-terracotta sm:h-7 sm:w-7" strokeWidth={2} />
      </motion.div>
      <motion.div
        className={cn(flyingMailClass, "bottom-[18%] left-[18%] text-sage opacity-80")}
        animate={{ x: [0, 14, -6, 0], y: [0, -20, 8, 0] }}
        transition={{ duration: 4.6, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
        aria-hidden
      >
        <Mail className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2} />
      </motion.div>

      <div className="relative z-[1] px-5 py-6 sm:px-7 sm:py-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
          <div className="min-w-0 flex-1 space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="bg-gradient-to-br from-foreground via-foreground to-muted-foreground bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
                {title}
              </h1>
              <motion.div animate={badgePulseAnimate} transition={badgePulseTransition(0)}>
                <Badge
                  variant="outline"
                  className="border-highlight/35 bg-[#F9F6F0]/95 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-sage shadow-inner"
                >
                  Demo mode
                </Badge>
              </motion.div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="rounded-full border border-border/60 bg-[#FAF7F2]/90 p-1.5 text-muted-foreground transition-all duration-200 hover:scale-105 hover:bg-white hover:text-foreground active:scale-100"
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
                  <motion.div
                    animate={badgePulseAnimate}
                    transition={badgePulseTransition(0.1)}
                    className="inline-flex"
                  >
                    <Badge
                      variant="secondary"
                      className="cursor-default gap-1 border border-highlight/22 bg-[#FAF7F2] px-2.5 py-1 text-[11px] font-medium text-accent-foreground shadow-inner"
                    >
                      <Sparkles className="h-3 w-3 text-highlight" aria-hidden />
                      5 SDR voices
                    </Badge>
                  </motion.div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs leading-relaxed">
                  Exclusive voice-first system layers: warm, challenger, data-driven, enterprise, and
                  default — each steers research, outreach, qual, and nurture as distinct products.
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <motion.div
                    animate={badgePulseAnimate}
                    transition={badgePulseTransition(0.25)}
                    className="inline-flex"
                  >
                    <Badge
                      variant="secondary"
                      className="cursor-default gap-1 border border-sage/35 bg-[#FAF7F2] px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-inner"
                    >
                      <FileText className="h-3 w-3 text-sage" aria-hidden />
                      Branded PDF dossier
                    </Badge>
                  </motion.div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs leading-relaxed">
                  Executive one-pager plus full multi-page dossier — your logo, colors, optional dark
                  mode; most AI-SDR tools never ship a consultant-grade export.
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <motion.div
                    animate={badgePulseAnimate}
                    transition={badgePulseTransition(0.4)}
                    className="inline-flex"
                  >
                    <Badge
                      variant="secondary"
                      className="cursor-default gap-1 border border-terracotta/30 bg-[#FAF7F2] px-2.5 py-1 text-[11px] font-medium text-sage shadow-inner"
                    >
                      <Layers className="h-3 w-3 text-terracotta" aria-hidden />
                      Batch + analytics
                    </Badge>
                  </motion.div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs leading-relaxed">
                  Parallel batch runs with per-lead progress, live signals storage, and an analytics tab
                  with strength distribution — built for scale without losing the premium dossier.
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <motion.div
                    animate={badgePulseAnimate}
                    transition={badgePulseTransition(0.55)}
                    className="inline-flex"
                  >
                    <Badge
                      variant="secondary"
                      className="cursor-default gap-1 border border-highlight/28 bg-gradient-to-r from-[#F8F4ED] to-[#fff9f3] px-2.5 py-1 text-[11px] font-medium text-foreground shadow-inner"
                    >
                      <Radio className="h-3 w-3 text-highlight" aria-hidden />
                      Live signals
                    </Badge>
                  </motion.div>
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
          <motion.div
            className="mx-auto w-full max-w-[min(100%,560px)] shrink-0 lg:max-w-[48%]"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.52, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              className="rounded-[var(--card-radius)] border border-highlight/22 bg-[#F9F6F0]/95 p-2 shadow-inner shadow-glow-copper ring-1 ring-sage/16 backdrop-blur-[1px] sm:p-3"
              whileHover={{ y: -4, boxShadow: "0 24px 56px -12px hsl(9 100% 77% / 0.35)" }}
              transition={{ type: "spring", stiffness: 280, damping: 22 }}
            >
              <DashboardHeroArt className="h-auto w-full max-h-[min(72vw,340px)] sm:max-h-[320px]" />
            </motion.div>
          </motion.div>
        </div>
      </div>
    </motion.header>
  );
}
