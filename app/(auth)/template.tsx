"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

/** Prompt 134 — Auth pages: soft entrance without fighting split-panel motion. */
export default function AuthTemplate({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-screen min-h-[100dvh]"
    >
      {children}
    </motion.div>
  );
}
