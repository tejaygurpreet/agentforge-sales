"use client";

import { PasteReplyPanel } from "@/components/dashboard/paste-reply-panel";
import { useReplyIntel } from "@/components/dashboard/reply-intel-context";
import { cn } from "@/lib/utils";

/**
 * Prospect reply analyzer — between Report branding and New campaign (Prompt 55 + 58). Thread/lead from latest completed run when present.
 * Prompt 105: section chrome + anchor spacing for light-theme polish.
 */
export function DashboardReplyStrip() {
  const { replyIntel } = useReplyIntel();
  return (
    <section
      id="reply-intelligence"
      aria-label="Prospect reply analyzer"
      className={cn(
        "scroll-mt-24",
        "rounded-2xl border border-border/40 bg-gradient-to-b from-muted/25 via-transparent to-transparent p-1 shadow-sm ring-1 ring-black/[0.02]",
      )}
    >
      <div className="rounded-[14px] bg-background/40 p-1 sm:p-1.5">
        <PasteReplyPanel
          threadId={replyIntel?.threadId ?? null}
          company={replyIntel?.company ?? null}
          leadName={replyIntel?.leadName ?? null}
          prospectEmail={replyIntel?.prospectEmail ?? null}
        />
      </div>
    </section>
  );
}
