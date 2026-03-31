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
  count: number;
  setCount: (n: number) => void;
};

const InboxUnreadContext = createContext<InboxUnreadContextValue | null>(null);

/**
 * Prompt 123 — Shared unread count for header mail button + `ProfessionalInbox` on `/inbox`.
 */
export function InboxUnreadProvider({
  initialCount,
  children,
}: {
  initialCount: number;
  children: ReactNode;
}) {
  const [count, setCountState] = useState(initialCount);

  useEffect(() => {
    setCountState(initialCount);
  }, [initialCount]);

  const setCount = useCallback((n: number) => {
    setCountState(n);
  }, []);

  const value = useMemo(() => ({ count, setCount }), [count, setCount]);

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
