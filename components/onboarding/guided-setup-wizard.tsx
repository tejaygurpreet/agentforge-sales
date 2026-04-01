"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DEFAULT_BRAND_DISPLAY_NAME } from "@/lib/brand-prompt";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Link2,
  Mic,
  Palette,
  Phone,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

function IllustrationBrand() {
  return (
    <svg viewBox="0 0 120 100" className="h-28 w-full max-w-[200px]" aria-hidden>
      <defs>
        <linearGradient id="gsw-pal" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#8F9E7E" stopOpacity="0.35" />
          <stop offset="1" stopColor="#D4A373" stopOpacity="0.25" />
        </linearGradient>
      </defs>
      <rect x="10" y="20" width="100" height="60" rx="12" fill="url(#gsw-pal)" />
      <circle cx="40" cy="50" r="14" fill="#FF9A8B" fillOpacity="0.5" />
      <path d="M70 42h32M70 52h24M70 62h28" stroke="#8F9E7E" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function IllustrationHubSpot() {
  return (
    <svg viewBox="0 0 120 100" className="h-28 w-full max-w-[200px]" aria-hidden>
      <path
        d="M60 20l28 16v32L60 84 32 68V36z"
        fill="#D4A373"
        fillOpacity="0.25"
        stroke="#8F9E7E"
        strokeWidth="2"
      />
      <circle cx="60" cy="48" r="10" fill="#FF9A8B" fillOpacity="0.45" />
    </svg>
  );
}

function IllustrationCalendar() {
  return (
    <svg viewBox="0 0 120 100" className="h-28 w-full max-w-[200px]" aria-hidden>
      <rect x="20" y="24" width="80" height="56" rx="8" fill="#FAF7F2" stroke="#8F9E7E" strokeWidth="2" />
      <path d="M20 38h80" stroke="#D4A373" strokeWidth="3" />
      <rect x="36" y="50" width="16" height="12" rx="2" fill="#FF9A8B" fillOpacity="0.4" />
      <rect x="68" y="50" width="16" height="12" rx="2" fill="#8F9E7E" fillOpacity="0.35" />
    </svg>
  );
}

function IllustrationTwilio() {
  return (
    <svg viewBox="0 0 120 100" className="h-28 w-full max-w-[200px]" aria-hidden>
      <path
        d="M40 70c20-25 40-25 60 0"
        stroke="#D4A373"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="48" cy="38" r="12" fill="#8F9E7E" fillOpacity="0.4" />
      <circle cx="72" cy="32" r="10" fill="#FF9A8B" fillOpacity="0.45" />
    </svg>
  );
}

function IllustrationVoices() {
  return (
    <svg viewBox="0 0 120 100" className="h-28 w-full max-w-[200px]" aria-hidden>
      <path
        d="M20 60c10-20 20-20 30 0s20 20 30 0 20-20 30 0"
        stroke="#8F9E7E"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M24 72c8-14 16-14 24 0s16 14 24 0"
        stroke="#FF9A8B"
        strokeWidth="2"
        fill="none"
        opacity="0.8"
      />
      <circle cx="60" cy="28" r="14" fill="#D4A373" fillOpacity="0.35" />
    </svg>
  );
}

function IllustrationLaunch() {
  return (
    <svg viewBox="0 0 120 100" className="h-28 w-full max-w-[200px]" aria-hidden>
      <path d="M30 70L60 25l30 45" stroke="#8F9E7E" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="60" cy="72" r="8" fill="#FF9A8B" fillOpacity="0.55" />
    </svg>
  );
}

const STEPS = [
  {
    key: "welcome",
    title: "Welcome",
    headline: `Shape ${DEFAULT_BRAND_DISPLAY_NAME}`,
    body: "This guided path walks you through brand, CRM, calendar, voice, and telephony — skip anything you don’t need.",
    icon: Sparkles,
    art: IllustrationLaunch,
    cta: null as { label: string; href: string } | null,
  },
  {
    key: "brand",
    title: "Brand",
    headline: "Logo & colors",
    body: "Upload your logo and set primary colors so PDFs and the header feel like your company.",
    icon: Palette,
    art: IllustrationBrand,
    cta: { label: "Scroll to brand card", href: "#workspace-brand-integrations" },
  },
  {
    key: "hubspot",
    title: "HubSpot",
    headline: "CRM sync (optional)",
    body: "Private App token — nothing leaves your workspace until you export or sync intentionally.",
    icon: Link2,
    art: IllustrationHubSpot,
    cta: { label: "HubSpot section", href: "#workspace-brand-integrations" },
  },
  {
    key: "calendar",
    title: "Calendar",
    headline: "Google or Microsoft",
    body: "OAuth for meeting proposals and smart scheduling — one click per provider.",
    icon: Calendar,
    art: IllustrationCalendar,
    cta: { label: "Calendar card", href: "#workspace-brand-integrations" },
  },
  {
    key: "twilio",
    title: "Twilio",
    headline: "Voice & calls",
    body: "Connect Twilio for dialer flows and call logging — optional for email-first teams.",
    icon: Phone,
    art: IllustrationTwilio,
    cta: { label: "Twilio card", href: "#workspace-brand-integrations" },
  },
  {
    key: "voices",
    title: "Voices",
    headline: "SDR voice presets",
    body: "Tune custom voices on the dashboard — each campaign picks a tone for research and outreach.",
    icon: Mic,
    art: IllustrationVoices,
    cta: { label: "Open dashboard voices", href: "/#beta-runner" },
  },
  {
    key: "agents",
    title: "Agents",
    headline: "Agent playground",
    body: "Experiment with agent prompts and tools in a safe sandbox before production runs.",
    icon: Bot,
    art: IllustrationLaunch,
    cta: { label: "Go to Agents", href: "/agents" },
  },
  {
    key: "done",
    title: "Ready",
    headline: "You’re set to run campaigns",
    body: "Jump to the workspace, or return anytime — Setup stays in the top nav.",
    icon: CheckCircle2,
    art: IllustrationLaunch,
    cta: { label: "Open workspace", href: "/#campaign-workspace" },
  },
] as const;

/**
 * Prompt 136 — Full guided setup wizard with progress rail + warm illustrations.
 */
export function GuidedSetupWizard() {
  const [step, setStep] = useState(0);
  const total = STEPS.length;
  const current = STEPS[step];
  const Icon = current.icon;
  const Art = current.art;
  const pct = Math.round(((step + 1) / total) * 100);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sage">Guided setup</p>
        <span className="text-xs font-semibold tabular-nums text-muted-foreground">
          Step {step + 1} / {total} · {pct}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[#e8e2d8] shadow-inner">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-sage via-terracotta to-coral"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
      </div>
      <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setStep(i)}
            className={cn(
              "flex h-9 min-w-[2rem] items-center justify-center rounded-full border px-2.5 text-xs font-semibold transition-all duration-200",
              i === step
                ? "border-sage bg-sage/15 text-foreground shadow-glow ring-1 ring-sage/25"
                : i < step
                  ? "border-sage/40 bg-sage/10 text-foreground"
                  : "border-border/50 bg-[#FAF7F2]/80 text-muted-foreground hover:bg-[#FAF7F2]",
            )}
            aria-label={`Step ${i + 1}: ${s.title}`}
            aria-current={i === step ? "step" : undefined}
          >
            {i + 1}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={current.key}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "grid gap-8 rounded-[var(--card-radius)] border border-coral/20 bg-[#FAF7F2] p-6 shadow-[var(--card-shadow-spec)] ring-1 ring-sage/10 sm:p-8 lg:grid-cols-[1fr_200px]",
            "creative-card-surface",
          )}
        >
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-sage/25 bg-white/60 px-3 py-1 text-xs font-semibold text-sage">
              <Icon className="h-4 w-4" aria-hidden />
              {current.title}
            </div>
            <h3 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{current.headline}</h3>
            <p className="max-w-prose text-pretty text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
              {current.body}
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-[var(--card-radius)]"
                disabled={step === 0}
                onClick={() => setStep((s) => Math.max(0, s - 1))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" aria-hidden />
                Back
              </Button>
              <Button
                type="button"
                size="sm"
                className="rounded-[var(--card-radius)] bg-sage text-primary-foreground hover:bg-sage/90"
                onClick={() => setStep((s) => Math.min(total - 1, s + 1))}
              >
                {step >= total - 1 ? "Done" : "Next"}
                <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
              </Button>
              {current.cta ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="rounded-[var(--card-radius)] border border-terracotta/25 bg-white/80"
                  asChild
                >
                  <Link href={current.cta.href}>{current.cta.label}</Link>
                </Button>
              ) : null}
            </div>
          </div>
          <motion.div
            className="flex items-center justify-center rounded-[var(--card-radius)] border border-sage/15 bg-white/50 p-4 shadow-inner"
            initial={{ scale: 0.96, opacity: 0.8 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            <Art />
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
