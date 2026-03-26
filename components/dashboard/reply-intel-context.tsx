"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ReplyIntelContextValue = {
  threadId: string;
  company: string;
  leadName: string;
  prospectEmail: string;
};

type ReplyIntelStore = {
  replyIntel: ReplyIntelContextValue | null;
  setReplyIntel: (v: ReplyIntelContextValue | null) => void;
};

const ReplyIntelContext = createContext<ReplyIntelStore | null>(null);

export function ReplyIntelProvider({ children }: { children: ReactNode }) {
  const [replyIntel, setReplyIntelState] = useState<ReplyIntelContextValue | null>(null);
  const setReplyIntel = useCallback((v: ReplyIntelContextValue | null) => {
    setReplyIntelState(v);
  }, []);
  const value = useMemo(
    () => ({ replyIntel, setReplyIntel }),
    [replyIntel, setReplyIntel],
  );
  return <ReplyIntelContext.Provider value={value}>{children}</ReplyIntelContext.Provider>;
}

export function useReplyIntel(): ReplyIntelStore {
  const c = useContext(ReplyIntelContext);
  if (!c) {
    throw new Error("useReplyIntel must be used within ReplyIntelProvider");
  }
  return c;
}
