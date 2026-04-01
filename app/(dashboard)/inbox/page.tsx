import { listInboxDraftsAction, listInboxThreadsAction } from "@/app/(dashboard)/actions";
import { InboxPageClient } from "@/components/dashboard/inbox-page-client";
import type { Metadata } from "next";
import { Suspense } from "react";

/** Server actions / Supabase — dynamic inbox. */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Inbox" };
}

/**
 * Prompt 138 — Onyx Copper inbox; `?compose=1` via Suspense; compose FAB softened in `ProfessionalInbox`.
 */
export default async function InboxPage() {
  const [initialThreads, initialDrafts] = await Promise.all([
    listInboxThreadsAction(),
    listInboxDraftsAction(),
  ]);
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] animate-pulse rounded-[var(--card-radius)] border border-[#111827]/08 bg-[#F9F6F0]/95 shadow-inner" />
      }
    >
      <InboxPageClient initialThreads={initialThreads} initialDrafts={initialDrafts} />
    </Suspense>
  );
}
