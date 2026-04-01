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
 * Prompt 136 — `useSearchParams` for `?compose=1` requires Suspense around `InboxPageClient`.
 */
export default async function InboxPage() {
  const [initialThreads, initialDrafts] = await Promise.all([
    listInboxThreadsAction(),
    listInboxDraftsAction(),
  ]);
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] animate-pulse rounded-[var(--card-radius)] border border-border/40 bg-[#FAF7F2]/80 shadow-inner" />
      }
    >
      <InboxPageClient initialThreads={initialThreads} initialDrafts={initialDrafts} />
    </Suspense>
  );
}
