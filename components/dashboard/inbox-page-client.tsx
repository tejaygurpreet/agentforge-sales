"use client";

import { ProfessionalInbox } from "@/components/dashboard/professional-inbox";
import { useInboxUnread } from "@/components/dashboard/inbox-unread-context";
import type { InboxThreadRow } from "@/lib/inbox";

type Props = {
  initialThreads: InboxThreadRow[];
};

/**
 * Prompt 123 — Client shell for `/inbox`; syncs list-derived unread with header via `InboxUnreadProvider`.
 */
export function InboxPageClient({ initialThreads }: Props) {
  const { setCount } = useInboxUnread();

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out">
      <ProfessionalInbox
        initialThreads={initialThreads}
        onUnreadCountChange={(n) => {
          setCount(n);
        }}
      />
    </div>
  );
}
