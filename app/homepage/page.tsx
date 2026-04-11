"use client";

import { AgentForgeLogoMark } from "@/components/brand/agentforge-logo-mark";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
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
 * Public marketing site at `/homepage` — guests only; signed-in users go to main dashboard (`/dashboard`).
 */
export default function HomepagePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (user) {
        router.replace("/dashboard");
        return;
      }
      setReady(true);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) router.replace("/dashboard");
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [router]);

  if (!ready) {
    return (
      <div
        className="flex min-h-[100dvh] w-full items-center justify-center bg-[#F9F6F0]"
        aria-busy="true"
        aria-label="Loading"
      />
    );
  }

  return (
    <div className={cn("flex min-h-[100dvh] w-full flex-col bg-[#F9F6F0]", typeBase)}>
      <header className="sticky top-0 z-40 shrink-0 border-b border-[#111827]/10 bg-[#F9F6F0] shadow-[0_1px_0_0_rgba(17,24,39,0.06)]">
        <div className="mx-auto flex min-h-[3.5rem] max-w-7xl items-center gap-3 px-5 py-3 sm:h-[3.65rem] sm:gap-4 sm:px-8 sm:py-0">
          <Link
            href="/homepage"
            className="group flex min-w-0 shrink-0 items-center gap-2.5 text-[#111827] transition-opacity duration-200 hover:opacity-92"
          >
            <AgentForgeLogoMark className="h-8 w-8 shrink-0 transition-transform duration-200 ease-out group-hover:scale-[1.03]" />
            <span className="whitespace-nowrap text-[0.95rem] font-bold leading-tight tracking-[-0.02em]">
              Agent<span className="text-[#B45309]">Forge</span> Sales
            </span>
          </Link>
          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            <span className="max-w-[120px] truncate text-sm font-semibold tracking-tight text-[#111827]">Guest</span>
            <Button
              asChild
              size="sm"
              className="h-9 shrink-0 rounded-xl bg-[#111827] px-4 text-[13px] font-semibold text-white shadow-sm hover:bg-[#1e293b]"
            >
              <Link href="/login?next=/dashboard">Login / Signup</Link>
            </Button>
          </div>
        </div>
      </header>

      <section
        className="relative min-h-0 w-full flex-1 overflow-hidden"
        aria-labelledby="home-hero-heading"
      >
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

        <div className="relative z-[1] flex min-h-[min(720px,calc(100dvh-8rem))] flex-col justify-between px-6 pb-12 pt-14 sm:px-10 sm:pb-14 sm:pt-16 lg:px-14 lg:pb-16 lg:pt-20">
          <motion.div
            className={cn(heroSerif, "w-full max-w-4xl text-left text-white lg:max-w-5xl")}
            initial="hidden"
            animate="visible"
            variants={heroVariants}
          >
            <h1
              id="home-hero-heading"
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
                "border border-white/20 bg-[#111827] text-white shadow-[0_20px_48px_-18px_rgba(0,0,0,0.55)]",
                "transition hover:bg-[#1e293b]",
              )}
              asChild
            >
              <Link href="/login?next=/dashboard">Get Started</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="shrink-0 border-t border-[#e8eaef] bg-[#fafbfc]" role="contentinfo">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-10 sm:px-10 lg:flex-row lg:items-start lg:justify-between lg:gap-8 lg:px-12">
          <div className="flex max-w-sm flex-col gap-2">
            <div className="flex items-center gap-2.5">
              <AgentForgeLogoMark className="h-9 w-9 shrink-0 text-[#111827]" aria-hidden />
              <span className="text-[15px] font-medium tracking-[-0.025em] text-[#111827]">
                Agent<span className="text-[#B45309]">Forge</span> Sales
              </span>
            </div>
            <p className="text-[13px] font-medium leading-relaxed tracking-[-0.025em] text-[#64748b]">
              © 2026 AgentForge Sales. All rights reserved.
            </p>
          </div>

          <nav
            aria-label="Quick links"
            className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 lg:flex-1 lg:justify-center"
          >
            <Link
              href="/login?next=/dashboard"
              className="text-[13px] font-medium tracking-[-0.025em] text-[#475569] transition hover:text-[#111827]"
            >
              Dashboard
            </Link>
            <Link
              href="/login?next=/inbox"
              className="text-[13px] font-medium tracking-[-0.025em] text-[#475569] transition hover:text-[#111827]"
            >
              Inbox
            </Link>
            <Link
              href="/login?next=/setup"
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
      </footer>
    </div>
  );
}
