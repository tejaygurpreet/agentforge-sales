"use client";

import { getInboxDraftCountAction, getInboxUnreadCountAction } from "@/app/(dashboard)/actions";
import { useInboxRealtime } from "@/hooks/use-inbox-realtime";
import { toast } from "@/hooks/use-toast";
import { INBOX_NOTIFICATIONS_POLL_MS } from "@/lib/inbox-shared";
import { createClient } from "@/lib/supabase";
import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  inboxActive: boolean;
  onCount: (n: number) => void;
  onDraftCount: (n: number) => void;
};

/**
 * Prompt 119 — Realtime + polling unread badge; toast when new activity while user is elsewhere.
 */
export function InboxNotificationsBridge({ inboxActive, onCount, onDraftCount }: Props) {
  const [userId, setUserId] = useState<string | null>(null);
  const prevUnread = useRef<number | null>(null);
  const boot = useRef(true);

  useEffect(() => {
    void createClient()
      .auth.getUser()
      .then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const refresh = useCallback(async () => {
    const [n, d] = await Promise.all([getInboxUnreadCountAction(), getInboxDraftCountAction()]);
    onCount(n);
    onDraftCount(d);
    if (boot.current) {
      boot.current = false;
      prevUnread.current = n;
      return;
    }
    if (prevUnread.current !== null && n > prevUnread.current && !inboxActive) {
      toast({
        title: "New reply",
        description: "You have new activity in your Professional Inbox.",
        className:
          "border-border/50 bg-gradient-to-r from-muted/95 via-card to-accent/30 text-foreground shadow-soft",
      });
    }
    prevUnread.current = n;
  }, [inboxActive, onCount, onDraftCount]);

  useInboxRealtime(userId, refresh);

  useEffect(() => {
    const id = window.setInterval(() => void refresh(), INBOX_NOTIFICATIONS_POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [inboxActive, refresh]);

  return null;
}
