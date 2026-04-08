"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { LayoutList, Play } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const heroVariants = {
  hidden: { opacity: 0, y: 22 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const },
  },
};

/**
 * Prompt 166 / 167 — Premium landing: hero with soft blurred bg; footer sits below on solid surface.
 */
export default function DashboardPage() {
  return (
    <div
      className={cn(
        "relative left-1/2 flex w-screen max-w-[100vw] -translate-x-1/2 flex-col",
        "-mt-9 sm:-mt-10",
      )}
    >
      {/* Hero: background image only in this band (8px blur ≈ “8%” softness — image stays readable) */}
      <section
        className="relative min-h-[min(78vh,820px)] overflow-hidden rounded-[var(--card-radius)] sm:min-h-[min(80vh,880px)] sm:rounded-2xl"
        aria-labelledby="dashboard-hero-heading"
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 scale-[1.04]">
            <Image
              src="/images/Agentforge-Dashboard.png"
              alt=""
              fill
              priority
              className="object-cover object-center"
              sizes="100vw"
              style={{ filter: "blur(8px)" }}
            />
          </div>
          <div
            className="absolute inset-0 bg-gradient-to-br from-[#F9F6F0]/82 via-[#F9F6F0]/65 to-[#EDE0D4]/38"
            aria-hidden
          />
          <div
            className="absolute inset-0 bg-gradient-to-r from-[#F9F6F0]/88 via-[#F9F6F0]/55 to-transparent"
            aria-hidden
          />
        </div>

        <div className="relative z-[1] flex min-h-[min(78vh,820px)] flex-col justify-center px-6 py-14 sm:min-h-[min(80vh,880px)] sm:px-12 sm:py-16 lg:px-16 lg:py-20">
          <motion.div
            className="w-full max-w-2xl space-y-8 lg:max-w-[42rem]"
            initial="hidden"
            animate="visible"
            variants={heroVariants}
          >
            <div className="space-y-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sage/90">
                AgentForge Sales
              </p>
              <h1
                id="dashboard-hero-heading"
                className="text-balance text-4xl font-bold tracking-tight text-[#111827] drop-shadow-sm sm:text-5xl lg:text-[3.15rem] lg:leading-[1.08]"
              >
                Your command center for revenue campaigns
              </h1>
              <p className="max-w-xl text-pretty text-base leading-[1.65] text-[#111827]/72 sm:text-[17px] lg:max-w-2xl">
                Launch intelligent outreach, track pipeline health, and keep every touch human-reviewed — in one
                calm, focused workspace.
              </p>
            </div>

            <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5">
              <Button
                size="lg"
                className={cn(
                  "h-12 min-w-[220px] rounded-[var(--card-radius)] px-9 text-[15px] font-semibold",
                  "border border-[#B45309]/35 bg-[#111827] text-white shadow-[0_20px_48px_-18px_rgba(17,24,39,0.45)]",
                  "transition hover:bg-[#1e293b]",
                )}
                asChild
              >
                <Link href="/campaigns#campaign-workspace">
                  <Play className="mr-2 h-5 w-5 opacity-95" aria-hidden />
                  Start New Campaign
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className={cn(
                  "h-12 min-w-[220px] rounded-[var(--card-radius)] border-[#111827]/18 bg-white/90 px-9 text-[15px] font-semibold text-[#111827]",
                  "shadow-[0_12px_36px_-20px_rgba(17,24,39,0.25)] backdrop-blur-sm",
                  "transition hover:bg-white",
                )}
                asChild
              >
                <Link href="/campaigns">
                  <LayoutList className="mr-2 h-5 w-5 opacity-90" aria-hidden />
                  View My Campaigns
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer: outside hero — solid surface, no background image */}
      <motion.footer
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "mt-0 border-t border-[#111827]/10 bg-[#F9F6F0]",
          "shadow-[0_-12px_40px_-28px_rgba(17,24,39,0.08)]",
        )}
        role="contentinfo"
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:px-10 sm:py-9 lg:px-12">
          <p className="shrink-0 text-[13px] font-medium tracking-tight text-[#111827]/65">
            © 2026 AgentForge Sales
          </p>

          <nav
            aria-label="Footer"
            className="flex flex-1 flex-wrap items-center justify-center gap-x-6 gap-y-2 sm:justify-end"
          >
            <Link
              href="/setup"
              className="text-[13px] font-medium text-[#111827]/65 transition hover:text-[#111827]"
            >
              Setup
            </Link>
            <Link
              href="/campaigns"
              className="text-[13px] font-medium text-[#111827]/65 transition hover:text-[#111827]"
            >
              Campaigns
            </Link>
            <Link
              href="/agents"
              className="text-[13px] font-medium text-[#111827]/65 transition hover:text-[#111827]"
            >
              Agents
            </Link>
            <span className="hidden text-[#111827]/35 sm:inline" aria-hidden>
              |
            </span>
            <span className="flex items-center gap-1.5 text-[13px] font-medium text-[#111827]/55">
              <Link href="/privacy" className="transition hover:text-[#111827]">
                Privacy
              </Link>
              <span aria-hidden className="text-[#111827]/35">
                •
              </span>
              <Link href="/terms" className="transition hover:text-[#111827]">
                Terms
              </Link>
            </span>
          </nav>
        </div>
      </motion.footer>
    </div>
  );
}
