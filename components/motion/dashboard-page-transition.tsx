"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Prompt 136 — Energetic route entrance: fade + stronger slide + springy ease.
 */
export function DashboardPageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.44, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
