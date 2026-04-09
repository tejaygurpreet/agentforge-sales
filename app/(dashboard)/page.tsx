"use client";

import { AgentPipelineOverview } from "@/components/agents/agent-pipeline-overview";
import { AgentForgeLogoMark } from "@/components/brand/agentforge-logo-mark";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Bot } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const heroVariants = {
  hidden: { opacity: 0, y: 22 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const },
  },
};

const typeBase = "font-sans font-medium tracking-[-0.025em]";

const heroSerif = "font-serif font-light tracking-[-0.03em]";

/**
 * Prompt 174 — Logged-out users see the marketing hero; signed-in users are sent to /campaigns (never see hero).
 */
export default function DashboardPage() {
  const router = useRouter();
  const [showHero, setShowHero] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (user) {
        router.replace("/campaigns");
        return;
      }
      setShowHero(true);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        router.replace("/campaigns");
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [router]);

  if (!showHero) {
    return (
      <div
        className="relative -mt-9 flex min-h-[100dvh] w-full flex-col items-center justify-center bg-[#F9F6F0] sm:-mt-10"
        aria-busy="true"
        aria-label="Loading"
      />
    );
  }

  return (
    <div
      className={cn(
        "relative -mt-9 flex w-full flex-col sm:-mt-10",
        typeBase,
        "bg-[#F9F6F0]",
      )}
    >
      <section
        className="relative left-1/2 z-[1] min-h-[100dvh] w-screen max-w-[100vw] -translate-x-1/2 overflow-hidden"
        aria-labelledby="dashboard-hero-heading"
      >
        {/* Background: edge-to-edge inside hero — no padding on image layers */}
        <div className="pointer-events-none absolute inset-0">
          <Image
            src="/images/Agentforge-Dashboard.png"
            alt=""
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 backdrop-blur-[3%]" aria-hidden />
          <div
            className="absolute inset-0 bg-gradient-to-br from-black/48 via-black/28 to-black/55"
            aria-hidden
          />
        </div>

        <div className="relative flex min-h-[100dvh] flex-col justify-between px-6 pb-12 pt-20 sm:px-10 sm:pb-14 sm:pt-24 lg:px-14 lg:pb-16 lg:pt-28">
          <motion.div
            className={cn(heroSerif, "w-full max-w-4xl text-left text-[#ffffff] lg:max-w-5xl")}
            initial="hidden"
            animate="visible"
            variants={heroVariants}
          >
            <h1
              id="dashboard-hero-heading"
              className="text-balance text-5xl leading-[1.05] drop-shadow-[0_2px_24px_rgba(0,0,0,0.35)] sm:text-6xl md:text-7xl lg:text-8xl lg:leading-[1.02]"
            >
              Your command center for revenue campaigns
            </h1>
            <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-white/92 sm:mt-8 sm:text-xl md:text-2xl lg:max-w-3xl">
              Launch intelligent outreach, track pipeline health, and keep every touch human-reviewed — in one calm,
              focused workspace.
            </p>
          </motion.div>

          <div className="mt-auto flex flex-col gap-8 pt-10 sm:flex-row sm:flex-wrap sm:items-center sm:gap-10 sm:pt-12">
            <Button
              size="lg"
              className={cn(
                "h-12 min-w-[220px] rounded-[var(--card-radius)] px-9 text-[15px] font-semibold tracking-[-0.02em]",
                "border border-white/20 bg-[#111827] text-[#ffffff] shadow-[0_20px_48px_-18px_rgba(0,0,0,0.55)]",
                "transition hover:bg-[#1e293b]",
              )}
              asChild
            >
              <Link href="/login?next=/campaigns">Get Started</Link>
            </Button>
          </div>
        </div>
      </section>

      <section
        id="agents-section"
        className="relative z-[1] mx-auto mt-0 w-full max-w-6xl space-y-10 bg-[#F9F6F0] px-4 pb-8 pt-4 sm:px-6 sm:pb-10 sm:pt-8 lg:px-8"
      >
        <header className="space-y-3 rounded-2xl border border-border/50 bg-gradient-to-br from-card via-card to-muted/30 px-5 py-6 shadow-soft ring-1 ring-border/25 sm:px-7 sm:py-8">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/[0.08] text-primary shadow-sm ring-1 ring-primary/15">
              <Bot className="h-6 w-6" aria-hidden />
            </span>
            <div className="min-w-0 space-y-2">
              <h2 className="text-2xl font-medium tracking-[-0.025em] text-foreground sm:text-3xl">Agents</h2>
              <p className="max-w-2xl text-sm font-medium leading-relaxed tracking-[-0.025em] text-muted-foreground sm:text-[15px]">
                Orchestration graph, tools, and observability hooks — same premium workspace as the rest of your
                command center.
              </p>
            </div>
          </div>
        </header>

        <AgentPipelineOverview />
      </section>

      <motion.footer
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-[1] mt-16 w-full border-t border-[#e8eaef] bg-[#fafbfc]"
        role="contentinfo"
      >
        <div className="mx-auto max-w-7xl px-6 py-10 sm:px-10 lg:px-12">
          <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
            <div className="flex max-w-sm flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <AgentForgeLogoMark className="h-9 w-9 shrink-0 text-[#111827]" aria-hidden />
                <span className="text-[15px] font-medium tracking-[-0.025em] text-[#111827]">
                  Agent<span className="text-[#B45309]">Forge</span> Sales
                </span>
              </div>
              <p className="text-[13px] font-medium leading-relaxed tracking-[-0.025em] text-[#64748b]">
                Calm, human-reviewed revenue campaigns — in one focused workspace.
              </p>
            </div>

            <nav
              aria-label="Quick links"
              className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 lg:flex-1 lg:justify-center"
            >
              <Link
                href="/campaigns"
                className="text-[13px] font-medium tracking-[-0.025em] text-[#475569] transition hover:text-[#111827]"
              >
                Campaigns
              </Link>
              <Link
                href="/inbox"
                className="text-[13px] font-medium tracking-[-0.025em] text-[#475569] transition hover:text-[#111827]"
              >
                Inbox
              </Link>
              <Link
                href="/setup"
                className="text-[13px] font-medium tracking-[-0.025em] text-[#475569] transition hover:text-[#111827]"
              >
                Setup
              </Link>
            </nav>

            <nav
              aria-label="Legal"
              className="flex flex-wrap items-center justify-start gap-x-8 gap-y-2 lg:min-w-[180px] lg:justify-end"
            >
              <Link
                href="/privacy"
                className="text-[13px] font-medium tracking-[-0.025em] text-[#475569] transition hover:text-[#111827]"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="text-[13px] font-medium tracking-[-0.025em] text-[#475569] transition hover:text-[#111827]"
              >
                Terms
              </Link>
            </nav>
          </div>

          <div className="mt-10 border-t border-[#e8eaef] pt-6">
            <p className="text-center text-[12px] font-medium tracking-[-0.025em] text-[#94a3b8]">
              © {new Date().getFullYear()} AgentForge Sales. All rights reserved.
            </p>
          </div>
        </div>
      </motion.footer>
    </div>
  );
}
