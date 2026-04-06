"use client";

import { ProfessionalInbox } from "@/components/dashboard/professional-inbox";
import { useInboxUnread } from "@/components/dashboard/inbox-unread-context";
import type { InboxDraftRow, InboxThreadRow } from "@/lib/inbox";
import { useSearchParams } from "next/navigation";

type Props = {
  initialThreads: InboxThreadRow[];
  initialDrafts: InboxDraftRow[];
};

/**
 * Prompt 137 — `?compose=1` opens compose.
 * Prompt 141 — `useInboxUnread` is satisfied by `InboxUnreadProvider` in `(dashboard)/layout.tsx`.
 * Prompt 156 — Masthead / hero banner removed; floating envelopes live on the server `page.tsx` layer.
 */
export function InboxPageClient({ initialThreads, initialDrafts }: Props) {
  const { setCount } = useInboxUnread();
  const searchParams = useSearchParams();
  const initialComposeOpen = searchParams.get("compose") === "1";

  return (
    <div className="relative z-10 w-full">
      <ProfessionalInbox
        initialThreads={initialThreads}
        initialDrafts={initialDrafts}
        initialComposeOpen={initialComposeOpen}
        onUnreadCountChange={(n) => {
          setCount(n);
        }}
      />
    </div>
  );
}
