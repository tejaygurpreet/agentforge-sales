"use client";

import { PasteReplyPanel } from "@/components/dashboard/paste-reply-panel";
import { useReplyIntel } from "@/components/dashboard/reply-intel-context";

/**
 * Prospect reply analyzer — between Report branding and New campaign (Prompt 55 + 58). Thread/lead from latest completed run when present.
 */
export function DashboardReplyStrip() {
  const { replyIntel } = useReplyIntel();
  return (
    <section
      id="reply-intelligence"
      aria-label="Prospect reply analyzer"
      className="scroll-mt-24 space-y-3"
    >
      <PasteReplyPanel
        threadId={replyIntel?.threadId ?? null}
        company={replyIntel?.company ?? null}
        leadName={replyIntel?.leadName ?? null}
        prospectEmail={replyIntel?.prospectEmail ?? null}
      />
    </section>
  );
}
