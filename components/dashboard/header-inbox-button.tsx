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
 */
export function HeaderInboxButton() {
  const pathname = usePathname();
  const { count, setCount } = useInboxUnread();
  const inboxActive = pathname === "/inbox";

  return (
    <>
      <InboxNotificationsBridge inboxActive={inboxActive} onCount={setCount} />
      <Button
        variant="outline"
        size="icon"
        className={cn(
          "relative h-9 w-9 shrink-0 rounded-xl border-border/60 shadow-sm transition-all duration-200 ease-out hover:border-primary/35 hover:bg-primary/[0.06]",
          inboxActive && "border-primary/40 bg-primary/[0.1] ring-1 ring-primary/22",
        )}
        asChild
      >
        <Link href="/inbox" aria-label={count > 0 ? `Inbox, ${count} unread` : "Inbox"}>
          <Mail className="h-[1.125rem] w-[1.125rem]" aria-hidden />
          {count > 0 ? (
            <span
              className="absolute -right-1 -top-1 flex min-h-[1.125rem] min-w-[1.125rem] animate-in zoom-in-95 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent px-0.5 text-[9px] font-semibold tabular-nums text-white shadow-md ring-2 ring-background duration-300"
              aria-hidden
            >
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </Link>
      </Button>
    </>
  );
}
