"use client";

import { DashboardHeroArt } from "@/components/illustrations/dashboard-hero-art";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Mail } from "lucide-react";

/**
 * Prompt 137 — Onyx Copper Command Center hero + illustration.
 */
export function BetaCommandCenterHero() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "dashboard-hero-energetic-bg relative overflow-hidden rounded-[var(--card-radius)] border border-[#111827]/12",
        "premium-card-spec shadow-lift shadow-glow-onyx ring-1 ring-[#B45309]/14",
      )}
      aria-labelledby="beta-command-center-title"
    >
      <motion.div
        className="pointer-events-none absolute left-[5%] top-[18%] hidden text-[#B45309] sm:block"
        animate={{ x: [0, 10, 0], y: [0, -8, 0], rotate: [-5, 4, -5] }}
        transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      >
        <Mail className="h-6 w-6 drop-shadow-[0_4px_14px_rgba(180,83,9,0.32)]" strokeWidth={2} />
      </motion.div>
      <motion.div
        className="pointer-events-none absolute right-[10%] top-[28%] text-[#111827]/55"
        animate={{ x: [0, -12, 0], y: [0, 8, 0] }}
        transition={{ duration: 6.8, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
        aria-hidden
      >
        <Mail className="h-5 w-5 drop-shadow-[0_3px_12px_rgba(17,24,39,0.15)]" strokeWidth={2} />
      </motion.div>

      <div className="relative z-[1] grid gap-8 px-6 py-8 sm:px-8 sm:py-10 lg:grid-cols-[1fr_minmax(260px,1fr)] lg:items-center lg:gap-10">
        <div className="min-w-0 space-y-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#B45309]">Private beta</p>
          <h1
            id="beta-command-center-title"
            className="text-balance bg-gradient-to-br from-[#111827] via-[#111827] to-[#B45309] bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl"
          >
            Command Center
          </h1>
          <p className="max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            A composed surface for AI-led outbound — pipeline, inbox, and batch workflows stay one calm gesture
            away.
          </p>
        </div>
        <motion.div
          className="mx-auto w-full max-w-lg lg:mx-0 lg:max-w-none"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="rounded-[var(--card-radius)] border border-[#111827]/08 bg-white p-2 shadow-[var(--card-shadow-spec)] ring-1 ring-[#EDE0D4] sm:p-3">
            <DashboardHeroArt className="h-auto w-full max-h-[min(56vw,300px)] sm:max-h-[280px]" />
          </div>
        </motion.div>
      </div>
    </motion.section>
  );
}
