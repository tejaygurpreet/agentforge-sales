import { listInboxThreadsAction } from "@/app/(dashboard)/actions";
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
 */
export default async function InboxPage() {
  const initialThreads = await listInboxThreadsAction();
  return <InboxPageClient initialThreads={initialThreads} />;
}
