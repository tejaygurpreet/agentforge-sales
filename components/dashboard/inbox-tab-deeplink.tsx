"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

type Props = {
  setMainTab: (tab: string) => void;
};

/**
 * Prompt 119 — `/?tab=inbox` opens the Inbox tab (wrapped in Suspense for `useSearchParams`).
 */
export function InboxTabDeepLink({ setMainTab }: Props) {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");

  useEffect(() => {
    if (tab === "inbox") setMainTab("inbox");
  }, [tab, setMainTab]);

  return null;
}
