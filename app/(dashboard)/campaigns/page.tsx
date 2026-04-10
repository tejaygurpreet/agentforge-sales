import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Building2,
  Layers,
  LineChart,
  Play,
  Star,
  Target,
  TrendingUp,
  User,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

const RECENT = [
  {
    lead: "Jordan Lee",
    company: "Acme Corp",
    status: "COMPLETED",
    when: "Mar 27, 2026, 11:13 PM",
  },
  {
    lead: "Karim Atiyeh",
    company: "Ramp",
    status: "COMPLETED",
    when: "Mar 27, 2026, 1:59 AM",
  },
  {
    lead: "Karim Atiyeh - Head...",
    company: "Ramp",
    status: "COMPLETED",
    when: "Mar 27, 2026, 1:51 AM",
  },
  {
    lead: "Michael Torres",
    company: "Linear",
    status: "COMPLETED",
    when: "Mar 27, 2026, 1:49 AM",
  },
  {
    lead: "Michael Torres",
    company: "Linear",
    status: "COMPLETED",
    when: "Mar 27, 2026, 1:49 AM",
  },
] as const;

/**
 * Prompt 180 — Campaigns overview at `/campaigns`.
 */
export default function CampaignsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 sm:space-y-12">
      <header className="pt-1 sm:pt-2">
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground sm:text-4xl">My Campaigns</h1>
      </header>

      <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="ACTIVE CAMPAIGNS"
          value="16"
          hint="Workspace threads"
          icon={Target}
          accent="text-[#111827]"
        />
        <MetricCard
          label="PIPELINE VALUE"
          value="$1,066,840"
          hint="Forecast total"
          icon={LineChart}
          accent="text-[#B45309]"
        />
        <MetricCard
          label="AVG SCORE"
          value="91/100"
          hint="Composite fit"
          icon={Layers}
          accent="text-[#B45309]/80"
        />
        <MetricCard label="ROI" value="1.7x" hint="Est. vs tooling" icon={TrendingUp} accent="text-foreground/70" />
      </section>

      <section aria-label="Quick actions" className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div
          className={cn(
            "flex flex-col justify-center gap-4 rounded-[var(--card-radius)] border border-[#111827]/12 bg-white bg-gradient-to-br from-white via-[#F9F6F0] to-[#EDE0D4]/35 p-6 shadow-lift sm:p-8",
            "ring-1 ring-[#B45309]/10",
          )}
        >
          <div>
            <h2 className="text-lg font-bold text-foreground">Start new campaign</h2>
            <p className="mt-1 text-sm text-muted-foreground">Jump straight to the lead form and voice presets.</p>
          </div>
          <Button
            size="lg"
            className="h-14 rounded-[var(--card-radius)] border border-[#B45309]/30 bg-[#111827] text-base font-semibold text-white shadow-glow-onyx hover:bg-[#1e293b] sm:max-w-xs"
            asChild
          >
            <a href="#campaign-workspace">
              <Play className="mr-2 h-5 w-5" aria-hidden />
              Start New Campaign
            </a>
          </Button>
        </div>

        <div
          className={cn(
            "flex flex-col justify-between gap-4 rounded-[var(--card-radius)] border-2 border-[#B45309]/40 bg-white bg-gradient-to-br from-white to-[#EDE0D4]/25 p-6 shadow-[var(--card-shadow-spec)] sm:p-8",
            "transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-glow-copper",
          )}
        >
          <div>
            <h2 className="text-lg font-bold text-foreground">Batch mode</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Run parallel campaigns from JSON or saved lead snapshots — built for operators.
            </p>
          </div>
          <Button
            size="lg"
            className="h-12 rounded-[var(--card-radius)] bg-[#B45309] font-semibold text-white shadow-lg hover:bg-[#9a4508]"
            asChild
          >
            <a href="#batch-mode-anchor">Open batch tools</a>
          </Button>
        </div>
      </section>

      <section className="scroll-mt-28 space-y-5" aria-labelledby="recent-campaigns-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="recent-campaigns-heading" className="text-xl font-bold tracking-tight text-foreground">
              Recent campaigns
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Latest five runs in your workspace.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-[var(--card-radius)] border-[#111827]/18 shadow-sm hover:bg-[#EDE0D4]/40"
            asChild
          >
            <Link href="/analytics" className="gap-2">
              Show more
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {RECENT.map((c, i) => (
            <li
              key={`${c.lead}-${c.when}-${i}`}
              className={cn(
                "premium-card-spec warm-card-veil flex flex-col gap-3 rounded-[var(--card-radius)] border border-[#111827]/08 bg-white p-4",
                "shadow-[var(--card-shadow-spec)] transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-glow-onyx",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="inline-flex max-w-[85%] items-center gap-1.5 text-sm font-semibold text-foreground">
                  <User className="h-3.5 w-3.5 shrink-0 text-[#111827]" aria-hidden />
                  <span className="truncate">{c.lead}</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 className="h-3.5 w-3.5 shrink-0 text-[#B45309]/85" aria-hidden />
                <span className="truncate">{c.company}</span>
              </div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{c.status}</p>
              <p className="text-[11px] text-muted-foreground">{c.when}</p>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="deliverability-coach-heading"
        className={cn(
          "premium-card-spec warm-card-veil flex flex-col gap-4 rounded-[var(--card-radius)] border border-[#111827]/10 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8",
          "shadow-[var(--card-shadow-spec)] transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-glow-copper",
        )}
      >
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2 text-[#B45309]">
            <Star className="h-5 w-5 shrink-0 fill-[#B45309]/25 text-[#B45309]" aria-hidden />
            <h2 id="deliverability-coach-heading" className="text-lg font-bold tracking-tight text-foreground">
              Deliverability coach
            </h2>
          </div>
          <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
            Health score and warm-up tips for your sending domain — keep outreach human-first and monitor reply
            quality from Replies.
          </p>
        </div>
      </section>

      <div id="campaign-workspace" className="scroll-mt-28" tabIndex={-1} aria-hidden />
      <div id="batch-mode-anchor" className="scroll-mt-28" tabIndex={-1} aria-hidden />
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  accent: string;
}) {
  return (
    <div
      className={cn(
        "premium-card-spec warm-card-veil flex flex-col gap-1 rounded-[var(--card-radius)] border border-[#111827]/08 px-5 py-5",
        "shadow-card transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-glow-onyx",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
        <Icon className={cn("h-4 w-4 opacity-90", accent)} aria-hidden />
      </div>
      <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums">{value}</p>
      <p className="text-xs font-medium text-muted-foreground">{hint}</p>
    </div>
  );
}
