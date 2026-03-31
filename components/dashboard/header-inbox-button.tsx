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
          "relative h-9 w-9 shrink-0 rounded-xl border-[color-mix(in_srgb,#9CA88B_28%,hsl(var(--border)))] bg-[hsl(var(--card))]/90 shadow-sm transition-all duration-300 ease-out hover:border-[#9CA88B]/45 hover:bg-[color-mix(in_srgb,#9CA88B_10%,hsl(var(--card)))] hover:shadow-md",
          inboxActive &&
            "border-[#9CA88B]/45 bg-[color-mix(in_srgb,#9CA88B_12%,transparent)] ring-1 ring-[#9CA88B]/22",
        )}
        asChild
      >
        <Link href="/inbox" aria-label={aria}>
          <Mail className="h-[1.125rem] w-[1.125rem] text-[color-mix(in_srgb,hsl(var(--foreground))_88%,#6b6358)]" aria-hidden />
          {count > 0 ? (
            <span
              className="absolute -right-1 -top-1 flex min-h-[1.125rem] min-w-[1.125rem] animate-in zoom-in-95 items-center justify-center rounded-full bg-[#9CA88B] px-0.5 text-[9px] font-semibold tabular-nums text-[#F8F5F0] shadow-md ring-2 ring-[#F8F5F0] duration-300"
              aria-hidden
            >
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
          {draftCount > 0 ? (
            <span
              className={cn(
                "absolute -bottom-1 -right-1 flex min-h-[1.125rem] min-w-[1.125rem] animate-in zoom-in-95 items-center justify-center rounded-full bg-[#C8A48A] px-0.5 text-[9px] font-semibold tabular-nums text-[#3a322c] shadow-md ring-2 ring-[#F8F5F0] duration-300",
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
