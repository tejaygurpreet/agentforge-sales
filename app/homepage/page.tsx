"use client";

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
 * Prompt 177 — Homepage (hero only at `/homepage`). Signed-in users are sent to `/dashboard`.
 */
export default function HomepagePage() {
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
        router.replace("/dashboard");
        return;
      }
      setShowHero(true);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        router.replace("/dashboard");
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
        aria-labelledby="homepage-hero-heading"
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

        <div className="relative flex min-h-[100dvh] flex-col justify-between px-6 pb-12 pt-20 sm:px-10 sm:pb-14 sm:pt-24 lg:px-14 lg:pb-16 lg:pt-28">
          <motion.div
            className={cn(heroSerif, "w-full max-w-4xl text-left text-[#ffffff] lg:max-w-5xl")}
            initial="hidden"
            animate="visible"
            variants={heroVariants}
          >
            <h1
              id="homepage-hero-heading"
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
              <Link href="/login?next=/dashboard">Get Started</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
