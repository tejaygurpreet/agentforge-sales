import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CalendarClock, Phone, Sparkles } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Coming Soon",
  description: "Calendar and voice integrations are on the way.",
};

/**
 * Prompt 164 — Shared “Coming Soon” destination for Guided Setup Calendar & Twilio CTAs.
 */
export default function ComingSoonPage() {
  return (
    <div className="relative mx-auto flex min-h-[min(72vh,680px)] w-full max-w-xl flex-col items-center justify-center px-5 py-14 sm:px-8">
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[var(--card-radius)]"
        aria-hidden
      >
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-gradient-to-br from-sage/20 via-terracotta/10 to-transparent blur-3xl" />
        <div className="absolute -bottom-20 right-0 h-64 w-64 rounded-full bg-gradient-to-tl from-highlight/15 to-transparent blur-3xl" />
      </div>

      <div
        className={[
          "mb-8 flex h-28 w-28 items-center justify-center rounded-[var(--card-radius)]",
          "border border-sage/20 bg-gradient-to-br from-white/90 via-[#FAF7F2] to-muted/30",
          "shadow-[var(--card-shadow-spec)] ring-1 ring-highlight/15",
        ].join(" ")}
      >
        <div className="relative flex items-center justify-center gap-1">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-sage/25 bg-sage/10 text-sage shadow-inner">
            <CalendarClock className="h-7 w-7" strokeWidth={1.75} aria-hidden />
          </span>
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-terracotta/25 bg-terracotta/10 text-terracotta shadow-inner">
            <Phone className="h-7 w-7" strokeWidth={1.75} aria-hidden />
          </span>
          <span className="absolute -right-1 -top-1 flex h-8 w-8 items-center justify-center rounded-full border border-highlight/30 bg-white/95 text-highlight shadow-sm">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
        </div>
      </div>

      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-sage">AgentForge</p>
      <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Coming Soon</h1>
      <p className="mt-4 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
        Deep calendar OAuth (Google &amp; Microsoft) and Twilio voice workflows — including smart scheduling,
        call logging, and a shared objection library — are shipping next. You&apos;ll connect everything from
        Setup in one place.
      </p>
      <p className="mt-3 max-w-md text-pretty text-xs text-muted-foreground/90">
        For now, continue with brand, campaigns, and inbox — we&apos;ll notify you when these integrations go
        live.
      </p>

      <Button
        size="lg"
        className="mt-10 h-12 min-w-[220px] rounded-[var(--card-radius)] bg-sage px-8 text-base font-semibold text-primary-foreground shadow-glow ring-1 ring-sage/20 transition hover:bg-sage/90"
        asChild
      >
        <Link href="/">
          <ArrowLeft className="mr-2 h-4 w-4 opacity-90" aria-hidden />
          Back to Dashboard
        </Link>
      </Button>
    </div>
  );
}
