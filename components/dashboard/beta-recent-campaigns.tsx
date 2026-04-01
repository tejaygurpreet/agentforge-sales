"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PersistedCampaignRow } from "@/types";
import { motion } from "framer-motion";
import { ArrowRight, Building2, User } from "lucide-react";
import Link from "next/link";

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

type Props = {
  campaigns: PersistedCampaignRow[];
};

/**
 * Prompt 136 — Last five campaigns in light cards; full history on Analytics.
 */
export function BetaRecentCampaigns({ campaigns }: Props) {
  const top = campaigns.slice(0, 5);

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.06 }}
      className="space-y-5"
      aria-labelledby="recent-campaigns-heading"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="recent-campaigns-heading" className="text-xl font-bold tracking-tight text-foreground">
            Recent campaigns
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Latest five runs in your workspace.</p>
        </div>
        <Button variant="outline" size="sm" className="rounded-[var(--card-radius)] shadow-sm" asChild>
          <Link href="/analytics" className="gap-2">
            Show more
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </Button>
      </div>

      {top.length === 0 ? (
        <p className="rounded-[var(--card-radius)] border border-dashed border-border/60 bg-muted/20 px-5 py-8 text-center text-sm text-muted-foreground">
          No campaigns yet — start one below.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {top.map((c, i) => (
            <motion.li
              key={c.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 * i, duration: 0.35 }}
              className={cn(
                "premium-card-spec flex flex-col gap-3 rounded-[var(--card-radius)] border border-border/40 bg-[#FAF7F2] p-4",
                "shadow-[var(--card-shadow-spec)] transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-glow",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="inline-flex max-w-[85%] items-center gap-1.5 text-sm font-semibold text-foreground">
                  <User className="h-3.5 w-3.5 shrink-0 text-sage" aria-hidden />
                  <span className="truncate">{c.lead_name || "Lead"}</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 className="h-3.5 w-3.5 shrink-0 text-terracotta/80" aria-hidden />
                <span className="truncate">{c.company || "—"}</span>
              </div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {statusLabel(c.status)}
              </p>
              <p className="text-[11px] text-muted-foreground">{formatWhen(c.created_at)}</p>
            </motion.li>
          ))}
        </ul>
      )}
    </motion.section>
  );
}
