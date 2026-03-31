"use client";

import { INBOX_REALTIME_DEBOUNCE_MS } from "@/lib/inbox-shared";
import { createClient } from "@/lib/supabase";
import { useEffect, useRef } from "react";

/**
 * Prompt 117 — Supabase Realtime on `inbox_messages` + `inbox_threads` for the signed-in user.
 * Prompt 121 — Debounce window from `INBOX_REALTIME_DEBOUNCE_MS` to batch bursty updates.
 * Polling remains a fallback if Realtime is disabled in the project.
 */
export function useInboxRealtime(userId: string | null, onChange: () => void) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!userId) return;

    let debounce: ReturnType<typeof setTimeout> | null = null;

    const bump = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        onChangeRef.current();
      }, INBOX_REALTIME_DEBOUNCE_MS);
    };

    const supabase = createClient();
    const channel = supabase
      .channel(`inbox-realtime-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inbox_messages",
          filter: `user_id=eq.${userId}`,
        },
        bump,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inbox_threads",
          filter: `user_id=eq.${userId}`,
        },
        bump,
      )
      .subscribe();

    return () => {
      if (debounce) clearTimeout(debounce);
      void supabase.removeChannel(channel);
    };
  }, [userId]);
}
