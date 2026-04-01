import { listInboxDraftsAction, listInboxThreadsAction } from "@/app/(dashboard)/actions";
import { InboxPageClient } from "@/components/dashboard/inbox-page-client";
import type { Metadata } from "next";

/** Server actions / Supabase — dynamic inbox. */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Inbox" };
}

/**
 * Prompt 123 — Dedicated Professional Inbox (`/inbox`). Unread badge is seeded in `(dashboard)/layout`
 * via `getInboxUnreadCountAction` and updated from the header bridge + this page.
 * Prompt 124 — “Compose” opens `ComposeNewEmailDialog` inside `ProfessionalInbox` (header + FAB).
 * Prompt 130 — Prefetch threads + drafts; compose always starts blank unless opened from Drafts.
 * Prompt 134 — Three-column inbox + floating compose; route transition via `(dashboard)/template.tsx`.
 * Prompt 135 — Sage/terracotta chrome, illustrated empty states, animated FAB; compose blank + 3s draft sync.
 * Prompt 136 — `InboxPageClient` masthead SVG + FAB; compose blank + 3s draft sync in dialog.
 */
export default async function InboxPage() {
  const [initialThreads, initialDrafts] = await Promise.all([
    listInboxThreadsAction(),
    listInboxDraftsAction(),
  ]);
  return <InboxPageClient initialThreads={initialThreads} initialDrafts={initialDrafts} />;
}
