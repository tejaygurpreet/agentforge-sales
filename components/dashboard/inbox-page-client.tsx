"use client";

import { InboxHeroArt } from "@/components/illustrations/inbox-hero-art";
import { ProfessionalInbox } from "@/components/dashboard/professional-inbox";
import { useInboxUnread } from "@/components/dashboard/inbox-unread-context";
import type { InboxDraftRow, InboxThreadRow } from "@/lib/inbox";
import { motion } from "framer-motion";

type Props = {
  initialThreads: InboxThreadRow[];
  initialDrafts: InboxDraftRow[];
};

/**
 * Prompt 136 — Illustrated masthead + `ProfessionalInbox` (animated compose, blank new compose, 3s draft sync).
 */
export function InboxPageClient({ initialThreads, initialDrafts }: Props) {
  const { setCount } = useInboxUnread();

  return (
    <div className="w-full space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
        className="overflow-hidden rounded-[var(--card-radius)] border border-coral/20 bg-white/80 shadow-soft ring-1 ring-sage/10"
      >
        <InboxHeroArt className="h-auto w-full" />
      </motion.div>
      <ProfessionalInbox
        initialThreads={initialThreads}
        initialDrafts={initialDrafts}
        onUnreadCountChange={(n) => {
          setCount(n);
        }}
      />
    </div>
  );
}
