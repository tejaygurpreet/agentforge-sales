/**
 * Prompt 116–117 — Backup polling while the tab is open (Realtime is primary when enabled).
 * Prompt 120 — Keep tab polling and notification bridge on the same cadence for coherent refresh.
 * Prompt 121 — Search debounce + Realtime debounce tuned for smooth UI without excess network churn.
 */
export const INBOX_POLL_INTERVAL_MS = 45_000;

/** Prompt 120 — Unread badge / toast bridge (`inbox-notifications-bridge.tsx`). */
export const INBOX_NOTIFICATIONS_POLL_MS = INBOX_POLL_INTERVAL_MS;

/** Prompt 121 — Debounce server search (`ProfessionalInbox`) to avoid a request per keystroke. */
export const INBOX_SEARCH_DEBOUNCE_MS = 320;

/**
 * Prompt 121–122 — Coalesce rapid Supabase Realtime events (`use-inbox-realtime`) before refetching lists.
 * Slightly tight for snappier new-reply handling while avoiding duplicate refetches.
 */
export const INBOX_REALTIME_DEBOUNCE_MS = 100;

/**
 * Prompt 124 — Lightweight client-side check before calling compose actions (full validation on server).
 */
export function isLikelyValidRecipientEmail(email: string): boolean {
  const e = email.trim();
  if (e.length < 3 || e.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}
