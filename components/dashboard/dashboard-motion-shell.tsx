"use client";

import { motion } from "framer-motion";
import { usePathname } from "next/navigation";

/**
 * Prompt 136 — Framer Motion route transition (fade + upward slide) for dashboard pages.
 */
export function DashboardMotionShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="w-full"
    >
      {children}
    </motion.div>
  );
}
