import { listInboxDraftsAction } from "@/app/(dashboard)/actions";
import { InboxPageClient } from "@/components/dashboard/inbox-page-client";
import { fetchInboxPageInitialData } from "@/lib/inbox";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { Metadata } from "next";
import { Suspense } from "react";

/** Server actions / Supabase — dynamic inbox. */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Inbox" };
}

/**
 * Prompt 138 — Onyx Copper inbox; `?compose=1` via Suspense; compose FAB softened in `ProfessionalInbox`.
 * Prompt 141 — `InboxUnreadProvider` wraps the dashboard from `(dashboard)/layout.tsx` so this page’s
 * `InboxPageClient` / `ProfessionalInbox` (`useInboxUnread`) stay inside the same tree as the header.
 * Prompt 149 — Inbox fetch via `fetchInboxPageInitialData`: `inbox_threads` + `inbox_messages!left` join in lib.
 * Prompt 150 — `fetchInboxThreadsForUserDisplay` falls back to thread IDs from the user’s `inbox_messages` (+ SR)
 * when `inbox_threads.user_id` / RLS yields zero rows so the sidebar populates from the same messages in DB.
 * Prompt 151 — Same helper also tries `inbox_messages → inbox_threads!inner` for `user_id = auth user`, then
 * message-derived thread synthesis when thread rows still cannot be read so sidebar count matches message count.
 * Prompt 152 — Unread badge = inbound `is_read = false`; reply autosave drafts in `inbox_messages`; conversation
 * pane scroll + newest-first + highlighted unread replies (see `lib/inbox.ts`, header mail button, `ProfessionalInbox`).
 * Prompt 154 — Gmail-like threading: `resolveInboxThreadForReply` + inbound webhook thread match by prospect,
 * unread-first list sort, header badge = inbound unread only (see `lib/inbox.ts`, `header-inbox-button.tsx`).
 * Prompt 155 — Inbound `email.received` is handled by `app/api/webhooks/resend/route.ts` → `ingestResendEmailReceivedWebhook`
 * (parse id, to/cc/bcc → `inbox_local_part`, Receiving API body, `persistInboundResendReplyToInbox`).
 * Prompt 156 — Hero banner removed; subtle floating envelope field (`InboxFloatingEnvelopeField` + `globals.css`).
 * This route is `/inbox` (repo path `app/(dashboard)/inbox/page.tsx`; same as a logical `app/inbox/page.tsx`).
 */

/** Lucide-style mail outline — used only as decorative background (Prompt 156). */
function InboxFloatingEnvelopeField() {
  const icon = (
    <svg
      viewBox="0 0 24 24"
      className="h-full w-full"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
  return (
    <div
      className="inbox-float-field pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[var(--card-radius)]"
      aria-hidden
    >
      <div className="inbox-float-env inbox-float-env--1">{icon}</div>
      <div className="inbox-float-env inbox-float-env--2">{icon}</div>
      <div className="inbox-float-env inbox-float-env--3">{icon}</div>
      <div className="inbox-float-env inbox-float-env--4">{icon}</div>
      <div className="inbox-float-env inbox-float-env--5">{icon}</div>
      <div className="inbox-float-env inbox-float-env--6">{icon}</div>
      <div className="inbox-float-env inbox-float-env--7">{icon}</div>
      <div className="inbox-float-env inbox-float-env--8">{icon}</div>
    </div>
  );
}

export default async function InboxPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let initialThreads: Awaited<ReturnType<typeof fetchInboxPageInitialData>>["threads"] = [];
  let initialDrafts: Awaited<ReturnType<typeof listInboxDraftsAction>> = [];
  let messageFetchCount = 0;

  if (user) {
    const [{ threads, messageCount }, drafts] = await Promise.all([
      fetchInboxPageInitialData(supabase, user.id),
      listInboxDraftsAction(),
    ]);
    initialThreads = threads;
    initialDrafts = drafts;
    messageFetchCount = messageCount;
  }

  console.log(
    "[AgentForge][inbox-page] fetched inbox_threads=",
    initialThreads.length,
    "inbox_messages(count)=",
    messageFetchCount,
  );

  return (
    <div className="relative isolate w-full min-w-0">
      <InboxFloatingEnvelopeField />
      <Suspense
        fallback={
          <div className="relative z-10 min-h-[50vh] animate-pulse rounded-[var(--card-radius)] border border-[#111827]/08 bg-[#F9F6F0]/95 shadow-inner" />
        }
      >
        <InboxPageClient initialThreads={initialThreads} initialDrafts={initialDrafts} />
      </Suspense>
    </div>
  );
}
