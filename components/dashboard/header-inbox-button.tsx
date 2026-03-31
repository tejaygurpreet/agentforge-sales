"use client";

import { InboxNotificationsBridge } from "@/components/dashboard/inbox-notifications-bridge";
import { useInboxUnread } from "@/components/dashboard/inbox-unread-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Mail } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Prompt 123 — Mail icon in dashboard header with unread badge; links to `/inbox`.
 * Prompt 126 — Aligned with shell toolbar (h-9, shared outline + hover ring).
 * Prompt 130 — Sage badge = unread; terracotta = draft count (both from `InboxUnreadProvider`).
 */
export function HeaderInboxButton() {
  const pathname = usePathname();
  const { count, setCount, draftCount, setDraftCount } = useInboxUnread();
  const inboxActive = pathname === "/inbox";
  const labelParts: string[] = [];
  if (count > 0) labelParts.push(`${count} unread`);
  if (draftCount > 0) labelParts.push(`${draftCount} drafts`);
  const aria =
    labelParts.length > 0 ? `Inbox, ${labelParts.join(", ")}` : "Inbox";

  return (
    <>
      <InboxNotificationsBridge
        inboxActive={inboxActive}
        onCount={setCount}
        onDraftCount={setDraftCount}
      />
      <Button
        variant="outline"
        size="icon"
        className={cn(
          "relative h-9 w-9 shrink-0 rounded-[var(--card-radius)] border border-sage/28 bg-card/90 shadow-soft transition-[transform,box-shadow,border-color,background-color] duration-200 ease-in-out hover:border-sage/45 hover:bg-sage/10 hover:shadow-card hover:scale-[1.02]",
          inboxActive &&
            "border-sage/45 bg-sage/12 ring-1 ring-sage/22",
        )}
        asChild
      >
        <Link href="/inbox" aria-label={aria}>
          <Mail className="h-[1.125rem] w-[1.125rem] text-[color-mix(in_srgb,hsl(var(--foreground))_88%,#6b6358)]" aria-hidden />
          {count > 0 ? (
            <span
              className="absolute -right-1 -top-1 flex min-h-[1.125rem] min-w-[1.125rem] animate-in zoom-in-95 items-center justify-center rounded-full bg-sage px-0.5 text-[9px] font-semibold tabular-nums text-[#F8F5F0] shadow-md ring-2 ring-[#F8F5F0] duration-300"
              aria-hidden
            >
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
          {draftCount > 0 ? (
            <span
              className={cn(
                "absolute -bottom-1 -right-1 flex min-h-[1.125rem] min-w-[1.125rem] animate-in zoom-in-95 items-center justify-center rounded-full bg-terracotta px-0.5 text-[9px] font-semibold tabular-nums text-[#3a322c] shadow-md ring-2 ring-[#F8F5F0] duration-300",
                count > 0 && "-translate-x-0.5",
              )}
              aria-hidden
            >
              {draftCount > 99 ? "99+" : draftCount}
            </span>
          ) : null}
        </Link>
      </Button>
    </>
  );
}
