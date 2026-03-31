import type { InboxThreadRow } from "@/lib/inbox";

/**
 * Prompt 117 — Unread if latest activity is newer than last read, or the thread was never opened.
 */
export function computeThreadUnread(
  lastMessageAtIso: string,
  userLastReadAtIso: string | null | undefined,
): boolean {
  const last = new Date(lastMessageAtIso).getTime();
  if (Number.isNaN(last)) return false;
  if (userLastReadAtIso == null || String(userLastReadAtIso).trim() === "") return true;
  const read = new Date(userLastReadAtIso).getTime();
  if (Number.isNaN(read)) return true;
  return last > read;
}

/**
 * Prompt 117 — Client-safe thread filters (used by `ProfessionalInbox`).
 */
export type InboxThreadFilter =
  | "all"
  | "unread"
  | "campaign"
  | "needs_review"
  | "reviewed"
  | "archived";

/** Prompt 119 — Thread is snoozed to a future time. */
export function threadIsSnoozed(t: Pick<InboxThreadRow, "snoozed_until">): boolean {
  if (!t.snoozed_until || String(t.snoozed_until).trim() === "") return false;
  return new Date(t.snoozed_until).getTime() > Date.now();
}

export function threadIsArchived(t: InboxThreadRow): boolean {
  return t.archived_at != null && String(t.archived_at).trim() !== "";
}

/** Unread when the user has not read past the latest activity (server sets `has_unread`). */
export function threadAppearsUnread(t: InboxThreadRow): boolean {
  return t.has_unread === true;
}

export function applyInboxThreadFilter(
  threads: InboxThreadRow[],
  filter: InboxThreadFilter,
): InboxThreadRow[] {
  switch (filter) {
    case "all":
      return threads;
    case "unread":
      return threads.filter(threadAppearsUnread);
    case "campaign":
      return threads.filter(
        (x) => x.campaign_thread_id != null && String(x.campaign_thread_id).trim() !== "",
      );
    case "needs_review":
      return threads.filter((x) => x.needs_review === true);
    case "reviewed":
      return threads.filter((x) => x.needs_review !== true);
    case "archived":
      return threads.filter(threadIsArchived);
    default:
      return threads;
  }
}
