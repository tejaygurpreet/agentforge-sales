"use client";

import { VoiceWavesMini } from "@/components/illustrations/voice-waves-mini";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  BarChart3,
  BookOpen,
  Inbox,
  Mic2,
  Settings,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

type Props = {
  onSelectTab: (tab: string) => void;
};

const linkClass =
  "group flex items-center gap-3 rounded-[var(--card-radius)] px-3 py-2.5 text-sm font-medium text-foreground outline-none transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:bg-white/80 hover:shadow-glow focus-visible:ring-2 focus-visible:ring-sage/40";

export function DashboardJumpToSidebar({ onSelectTab }: Props) {
  return (
    <motion.aside
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
      className={cn(
        "premium-card-spec sticky top-28 hidden h-fit flex-col gap-5 rounded-[var(--card-radius)] border border-border/45 bg-[#FAF7F2] p-7 shadow-soft lg:flex",
        "ring-1 ring-sage/10",
      )}
      aria-label="Quick navigation"
    >
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Jump to
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Snap to inbox, analytics, or a home tab — fast.
        </p>
      </div>

      <nav className="flex flex-col gap-2">
        <motion.div whileHover={{ x: 2 }} transition={{ type: "spring", stiffness: 400, damping: 28 }}>
          <Link href="/inbox" className={linkClass}>
            <Inbox className="h-4 w-4 shrink-0 text-sage" aria-hidden />
            Inbox
          </Link>
        </motion.div>
        <motion.div whileHover={{ x: 2 }} transition={{ type: "spring", stiffness: 400, damping: 28 }}>
          <Link href="/analytics" className={linkClass}>
            <BarChart3 className="h-4 w-4 shrink-0 text-terracotta" aria-hidden />
            Analytics
          </Link>
        </motion.div>
        <motion.div whileHover={{ x: 2 }} transition={{ type: "spring", stiffness: 400, damping: 28 }}>
          <Link href="/setup" className={linkClass}>
            <Settings className="h-4 w-4 shrink-0 text-coral" aria-hidden />
            Setup
          </Link>
        </motion.div>
        <motion.div whileHover={{ x: 2 }} transition={{ type: "spring", stiffness: 400, damping: 28 }}>
          <button type="button" onClick={() => onSelectTab("workspace")} className={cn(linkClass, "w-full text-left")}>
            <Sparkles className="h-4 w-4 shrink-0 text-sage" aria-hidden />
            Workspace
          </button>
        </motion.div>
        <motion.div whileHover={{ x: 2 }} transition={{ type: "spring", stiffness: 400, damping: 28 }}>
          <button type="button" onClick={() => onSelectTab("voices")} className={cn(linkClass, "w-full text-left")}>
            <Mic2 className="h-4 w-4 shrink-0 text-terracotta" aria-hidden />
            Voices
          </button>
        </motion.div>
        <motion.div whileHover={{ x: 2 }} transition={{ type: "spring", stiffness: 400, damping: 28 }}>
          <button type="button" onClick={() => onSelectTab("playbooks")} className={cn(linkClass, "w-full text-left")}>
            <BookOpen className="h-4 w-4 shrink-0 text-coral" aria-hidden />
            Playbooks
          </button>
        </motion.div>
      </nav>

      <div className="rounded-[var(--card-radius)] border border-sage/15 bg-white/60 px-3 py-3 shadow-inner">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Voice layer
        </p>
        <VoiceWavesMini className="mt-2 h-8 w-full text-sage" />
      </div>
    </motion.aside>
  );
}
