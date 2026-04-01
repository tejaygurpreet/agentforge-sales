"use client";

import { motion } from "framer-motion";
import { AuthHeroIllustration } from "@/components/illustrations/auth-hero-illustration";
import { DEFAULT_BRAND_DISPLAY_NAME } from "@/lib/brand-prompt";
import { cn } from "@/lib/utils";
import { BarChart3, Mail, Sparkles, Zap } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Short line under the brand on the art panel */
  tagline?: string;
};

/**
 * Prompt 136 — Energetic split auth: sage / terracotta / coral washes + floating illustration frame.
 */
export function AuthSplitLayout({ children, tagline }: Props) {
  return (
    <div className="grid min-h-screen min-h-[100dvh] w-full bg-white lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      <motion.div
        className={cn(
          "relative flex flex-col justify-between overflow-hidden px-8 py-12 sm:px-12 lg:min-h-screen lg:py-16",
          "bg-gradient-to-br from-white via-[#FFF9F7] to-[#FAF7F2]",
        )}
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.52, ease: [0.16, 1, 0.3, 1] }}
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_75%_at_15%_25%,hsl(var(--sage)_/_0.18),transparent_55%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_45%_at_90%_80%,hsl(var(--terracotta)_/_0.14),transparent_50%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_70%_15%,hsl(var(--highlight)_/_0.11),transparent_45%)]"
          aria-hidden
        />
        <div className="relative z-[1] flex flex-1 flex-col justify-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto w-full max-w-lg"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sage">
              {DEFAULT_BRAND_DISPLAY_NAME}
            </p>
            <h2 className="mt-3 max-w-md text-balance bg-gradient-to-br from-foreground via-foreground to-sage bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl sm:font-bold">
              {tagline ?? "Campaign intelligence that feels electric, fast, and yours."}
            </h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
              Multi-agent research, outreach, and inbox — orchestrated in one workspace with human review at
              every step.
            </p>
            <ul className="mt-8 flex flex-col gap-4 text-sm text-foreground/90">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--card-radius)] border border-sage/25 bg-card/80 shadow-sm">
                  <Sparkles className="h-4 w-4 text-sage" aria-hidden />
                </span>
                <span>
                  <span className="font-medium text-foreground">AI-assisted</span> sequences with clear
                  handoff points — never a black box.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--card-radius)] border border-terracotta/25 bg-card/80 shadow-sm">
                  <Mail className="h-4 w-4 text-terracotta" aria-hidden />
                </span>
                <span>
                  <span className="font-medium text-foreground">Branded inbox</span> with threading,
                  drafts, and replies in one place.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--card-radius)] border border-sage/25 bg-card/80 shadow-sm">
                  <BarChart3 className="h-4 w-4 text-sage" aria-hidden />
                </span>
                <span>
                  <span className="font-medium text-foreground">Analytics</span> that connect pipeline
                  signals to next actions.
                </span>
              </li>
            </ul>
          </motion.div>
          <motion.div
            className="relative mx-auto mt-10 w-full max-w-lg lg:mt-14"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="premium-card-spec relative rounded-[var(--card-radius)] border border-highlight/20 bg-gradient-to-br from-card via-white to-highlight/[0.06] p-6 shadow-lift ring-1 ring-sage/14 motion-safe:animate-float-y">
              <div className="absolute -right-2 -top-2 flex h-10 w-10 items-center justify-center rounded-full border border-highlight/32 bg-gradient-to-br from-highlight/22 to-terracotta/18 text-[#374151] shadow-glow-gold">
                <Zap className="h-5 w-5" aria-hidden />
              </div>
              <AuthHeroIllustration className="h-auto w-full max-h-[260px] sm:max-h-[280px]" />
            </div>
          </motion.div>
        </div>
      </motion.div>

      <div className="relative flex min-h-[50vh] flex-col justify-center bg-white px-5 py-12 sm:px-10 lg:min-h-screen lg:border-l lg:border-border/30 lg:px-12 xl:px-16">
        <motion.div
          className="mx-auto w-full max-w-[440px]"
          initial={{ opacity: 0, x: 28 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.46, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}
