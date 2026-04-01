"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

const cardBase =
  "group relative flex flex-col gap-4 overflow-hidden rounded-[var(--card-radius)] border border-border/40 bg-[#FAF7F2] p-6 shadow-[var(--card-shadow-spec)] transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-glow";

function SvgInboxChart() {
  return (
    <svg viewBox="0 0 64 56" className="h-14 w-auto shrink-0" aria-hidden>
      <rect x="4" y="8" width="56" height="40" rx="8" fill="#8F9E7E" fillOpacity={0.12} />
      <path d="M14 38v-12l8 6 10-14 8 10 12-8v18H14z" fill="#D4A373" fillOpacity={0.35} />
      <path d="M18 42h28" stroke="#FF9A8B" strokeWidth="2" strokeLinecap="round" />
      <circle cx="48" cy="16" r="6" fill="#FF9A8B" fillOpacity={0.45} />
    </svg>
  );
}

function SvgMailBurst() {
  return (
    <svg viewBox="0 0 64 56" className="h-14 w-auto shrink-0" aria-hidden>
      <rect
        x="8"
        y="18"
        width="48"
        height="28"
        rx="6"
        fill="#FAF7F2"
        stroke="#8F9E7E"
        strokeWidth="1.5"
        strokeOpacity={0.5}
      />
      <path d="M8 18l24 16L56 18" stroke="#D4A373" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="52" cy="12" r="5" fill="#FF9A8B" fillOpacity={0.55} />
      <path
        d="M12 44h20M12 48h14"
        stroke="#8F9E7E"
        strokeOpacity={0.35}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SvgAgentSpark() {
  return (
    <svg viewBox="0 0 64 56" className="h-14 w-auto shrink-0" aria-hidden>
      <circle cx="28" cy="28" r="16" fill="#8F9E7E" fillOpacity={0.2} />
      <path
        d="M22 28h12M28 22v12"
        stroke="#D4A373"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="28" cy="28" r="4" fill="#FF9A8B" fillOpacity={0.65} />
      <path
        d="M44 12l4 4M48 8v8M52 12l-4 4"
        stroke="#8F9E7E"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

const items = [
  {
    href: "/inbox",
    title: "Inbox",
    desc: "Threads, replies, and AI analysis in one place.",
    accent: "text-sage",
    art: SvgMailBurst,
  },
  {
    href: "/analytics",
    title: "Analytics",
    desc: "Scores, pipeline signals, and campaign health.",
    accent: "text-terracotta",
    art: SvgInboxChart,
  },
  {
    href: "/setup",
    title: "Setup",
    desc: "Brand, integrations, and workspace preferences.",
    accent: "text-highlight",
    art: SvgAgentSpark,
  },
] as const;

export function DashboardQuickNavCards() {
  return (
    <motion.section
      aria-label="Quick navigation"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
      className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
    >
      {items.map((it, i) => {
        const Art = it.art;
        return (
          <motion.div
            key={it.href}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08 + i * 0.06, ease: [0.22, 1, 0.36, 1] }}
          >
            <Link href={it.href} className={cn(cardBase, "focus-ring-sage outline-none")}>
              <div className="flex items-start justify-between gap-3">
                <Art />
                <span
                  className={cn(
                    "inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/50 bg-white/80 text-muted-foreground shadow-sm transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5",
                    it.accent,
                  )}
                >
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                </span>
              </div>
              <div>
                <h3 className={cn("text-lg font-bold tracking-tight text-foreground", it.accent)}>
                  {it.title}
                </h3>
                <p className="mt-1.5 text-pretty text-sm leading-relaxed text-muted-foreground">
                  {it.desc}
                </p>
              </div>
              <div
                className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br from-highlight/14 to-terracotta/10 blur-2xl"
                aria-hidden
              />
            </Link>
          </motion.div>
        );
      })}
    </motion.section>
  );
}
