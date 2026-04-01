"use client";

import { DashboardHeroArt } from "@/components/illustrations/dashboard-hero-art";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Mail } from "lucide-react";

/**
 * Prompt 136 — Beta dashboard hero: “Command Center” + AI SDR illustration + flying mail accents.
 */
export function BetaCommandCenterHero() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "dashboard-hero-energetic-bg relative overflow-hidden rounded-[var(--card-radius)] border border-coral/20",
        "premium-card-spec shadow-lift ring-1 ring-sage/12",
      )}
      aria-labelledby="beta-command-center-title"
    >
      <motion.div
        className="pointer-events-none absolute left-[5%] top-[18%] hidden text-coral/70 sm:block"
        animate={{ x: [0, 14, 0], y: [0, -12, 0], rotate: [-8, 6, -8] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      >
        <Mail className="h-7 w-7 drop-shadow-[0_6px_14px_hsl(9_100%_77%_/0.35)]" strokeWidth={2.2} />
      </motion.div>
      <motion.div
        className="pointer-events-none absolute right-[10%] top-[28%] text-terracotta/75"
        animate={{ x: [0, -18, 0], y: [0, 10, 0] }}
        transition={{ duration: 5.8, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
        aria-hidden
      >
        <Mail className="h-6 w-6 drop-shadow-[0_4px_12px_hsl(28_52%_62%_/0.4)]" strokeWidth={2} />
      </motion.div>

      <div className="relative z-[1] grid gap-8 px-6 py-8 sm:px-8 sm:py-10 lg:grid-cols-[1fr_minmax(260px,1fr)] lg:items-center lg:gap-10">
        <div className="min-w-0 space-y-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sage">Beta workspace</p>
          <h1
            id="beta-command-center-title"
            className="text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl"
          >
            Command Center
          </h1>
          <p className="max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            Run AI SDR campaigns, watch pipeline health, and keep deliverability sharp — built for focused
            beta testing without the noise.
          </p>
        </div>
        <motion.div
          className="mx-auto w-full max-w-lg lg:mx-0 lg:max-w-none"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="rounded-[var(--card-radius)] border border-coral/25 bg-[#FAF7F2] p-2 shadow-inner shadow-glow-coral ring-1 ring-sage/15 sm:p-3">
            <DashboardHeroArt className="h-auto w-full max-h-[min(56vw,300px)] sm:max-h-[280px]" />
          </div>
        </motion.div>
      </div>
    </motion.section>
  );
}
