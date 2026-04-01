"use client";

import { InboxNotificationsBridge } from "@/components/dashboard/inbox-notifications-bridge";
import { useInboxUnread } from "@/components/dashboard/inbox-unread-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Mail } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Prompt 123 — Mail icon in dashboard header with unread badge; links to `/inbox`.
 * Prompt 136 — Pulsing / glowing mail affordance + coral-sage ring energy.
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
          "relative h-9 w-9 shrink-0 overflow-visible rounded-[var(--card-radius)] border border-sage/35 bg-card/95 shadow-soft ring-1 ring-coral/15 transition-[transform,box-shadow,border-color,background-color] duration-200 ease-in-out hover:border-coral/40 hover:bg-gradient-to-br hover:from-sage/10 hover:to-coral/10 hover:shadow-glow hover:scale-[1.06]",
          inboxActive && "border-coral/45 bg-sage/12 shadow-glow-coral ring-2 ring-sage/25",
        )}
        asChild
      >
        <Link href="/inbox" aria-label={aria} className="relative">
          <motion.span
            className="inline-flex"
            animate={
              inboxActive
                ? { scale: [1, 1.06, 1] }
                : { scale: [1, 1.1, 1] }
            }
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <Mail
              className="h-[1.125rem] w-[1.125rem] text-sage drop-shadow-[0_0_10px_hsl(9_100%_77%_/0.35)]"
              aria-hidden
            />
          </motion.span>
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
