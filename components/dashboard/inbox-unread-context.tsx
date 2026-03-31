"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type InboxUnreadContextValue = {
  /** Unread thread count (Prompt 123). */
  count: number;
  setCount: (n: number) => void;
  /** Prompt 129 — saved compose drafts. */
  draftCount: number;
  setDraftCount: (n: number) => void;
};

const InboxUnreadContext = createContext<InboxUnreadContextValue | null>(null);

/**
 * Prompt 123 — Shared unread count for header mail button + `ProfessionalInbox` on `/inbox`.
 * Prompt 129 — Draft count for header + compose (same provider).
 */
export function InboxUnreadProvider({
  initialCount,
  initialDraftCount,
  children,
}: {
  initialCount: number;
  initialDraftCount: number;
  children: ReactNode;
}) {
  const [count, setCountState] = useState(initialCount);
  const [draftCount, setDraftCountState] = useState(initialDraftCount);

  useEffect(() => {
    setCountState(initialCount);
  }, [initialCount]);

  useEffect(() => {
    setDraftCountState(initialDraftCount);
  }, [initialDraftCount]);

  const setCount = useCallback((n: number) => {
    setCountState(n);
  }, []);

  const setDraftCount = useCallback((n: number) => {
    setDraftCountState(n);
  }, []);

  const value = useMemo(
    () => ({ count, setCount, draftCount, setDraftCount }),
    [count, setCount, draftCount, setDraftCount],
  );

  return (
    <InboxUnreadContext.Provider value={value}>{children}</InboxUnreadContext.Provider>
  );
}

export function useInboxUnread(): InboxUnreadContextValue {
  const ctx = useContext(InboxUnreadContext);
  if (!ctx) {
    throw new Error("useInboxUnread must be used within InboxUnreadProvider");
  }
  return ctx;
}
