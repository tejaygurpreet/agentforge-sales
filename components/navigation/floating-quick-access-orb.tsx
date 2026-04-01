"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  Bot,
  Inbox,
  Layers,
  LayoutDashboard,
  Mail,
  MessageSquareReply,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "af-quick-orb-pos-v1";
const ORB_SIZE = 56;
const DRAG_THRESHOLD = 6;

type Pos = { left: number; top: number };

function clampPos(left: number, top: number): Pos {
  if (typeof window === "undefined") return { left, top };
  const pad = 10;
  const maxL = window.innerWidth - ORB_SIZE - pad;
  const maxT = window.innerHeight - ORB_SIZE - pad;
  return {
    left: Math.min(Math.max(pad, left), maxL),
    top: Math.min(Math.max(pad, top), maxT),
  };
}

const MENU: { label: string; href: string; icon: typeof Inbox; accent: string }[] = [
  { label: "Inbox", href: "/inbox", icon: Inbox, accent: "bg-sage/15 text-sage ring-sage/25" },
  { label: "Analytics", href: "/analytics", icon: BarChart3, accent: "bg-terracotta/15 text-terracotta ring-terracotta/25" },
  { label: "Setup", href: "/setup", icon: Settings, accent: "bg-coral/15 text-coral ring-coral/20" },
  { label: "Agents", href: "/agents", icon: Bot, accent: "bg-sage/12 text-sage ring-sage/20" },
  { label: "Replies", href: "/replies", icon: MessageSquareReply, accent: "bg-terracotta/12 text-terracotta ring-terracotta/20" },
  { label: "Workspace", href: "/#campaign-workspace", icon: LayoutDashboard, accent: "bg-coral/12 text-coral ring-coral/18" },
  { label: "Compose", href: "/inbox?compose=1", icon: Mail, accent: "bg-sage/14 text-sage ring-sage/22" },
  { label: "Recent", href: "/#recent-campaigns", icon: Layers, accent: "bg-terracotta/14 text-terracotta ring-terracotta/22" },
];

/**
 * Prompt 136 — Draggable floating quick-access orb with radial menu (sage / terracotta / coral).
 */
export function FloatingQuickAccessOrb() {
  const [pos, setPos] = useState<Pos | null>(null);
  const [open, setOpen] = useState(false);
  const drag = useRef({
    active: false,
    pointerId: 0 as number,
    startLeft: 0,
    startTop: 0,
    originX: 0,
    originY: 0,
    moved: false,
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Pos;
        if (typeof p.left === "number" && typeof p.top === "number") {
          setPos(clampPos(p.left, p.top));
          return;
        }
      }
    } catch {
      /* ignore */
    }
    setPos(
      clampPos(
        typeof window !== "undefined" ? window.innerWidth - ORB_SIZE - 24 : 24,
        typeof window !== "undefined" ? window.innerHeight - ORB_SIZE - 28 : 120,
      ),
    );
  }, []);

  useEffect(() => {
    function onResize() {
      setPos((prev) => (prev ? clampPos(prev.left, prev.top) : prev));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const persist = useCallback((p: Pos) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (pos === null || open) return;
      drag.current = {
        active: true,
        pointerId: e.pointerId,
        startLeft: pos.left,
        startTop: pos.top,
        originX: e.clientX,
        originY: e.clientY,
        moved: false,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [open, pos],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (open || !drag.current.active || pos === null) return;
      const dx = e.clientX - drag.current.originX;
      const dy = e.clientY - drag.current.originY;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD) drag.current.moved = true;
      const next = clampPos(drag.current.startLeft + dx, drag.current.startTop + dy);
      setPos(next);
    },
    [open, pos],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (open) {
        setOpen(false);
        try {
          (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        return;
      }
      if (!drag.current.active) return;
      drag.current.active = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (pos) persist(pos);
      if (!drag.current.moved) {
        setOpen(true);
      }
    },
    [open, pos, persist],
  );

  if (pos === null) return null;

  const radius = 128;
  const n = MENU.length;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100]" aria-hidden={!open}>
      <AnimatePresence>
        {open ? (
          <motion.button
            type="button"
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-auto absolute inset-0 bg-[#3d3428]/20 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            aria-label="Close quick menu"
          />
        ) : null}
      </AnimatePresence>

      <div
        className="pointer-events-none absolute"
        style={{
          left: pos.left,
          top: pos.top,
          width: ORB_SIZE,
          height: ORB_SIZE,
        }}
      >
        <AnimatePresence>
          {open
            ? MENU.map((item, i) => {
                const angle = (2 * Math.PI * i) / n - Math.PI / 2;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;
                const Icon = item.icon;
                return (
                  <motion.div
                    key={item.href}
                    initial={{ opacity: 0, scale: 0.5, x: 0, y: 0 }}
                    animate={{ opacity: 1, scale: 1, x, y }}
                    exit={{ opacity: 0, scale: 0.5, x: 0, y: 0 }}
                    transition={{ type: "spring", stiffness: 380, damping: 26, delay: i * 0.02 }}
                    className="pointer-events-auto absolute left-1/2 top-1/2 z-[102] -translate-x-1/2 -translate-y-1/2"
                  >
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex h-11 w-11 items-center justify-center rounded-full border border-white/70 shadow-soft ring-2 transition-transform duration-200 hover:scale-110 hover:shadow-glow",
                        item.accent,
                      )}
                      title={item.label}
                    >
                      <Icon className="h-5 w-5" aria-hidden />
                      <span className="sr-only">{item.label}</span>
                    </Link>
                  </motion.div>
                );
              })
            : null}
        </AnimatePresence>

        <motion.button
          type="button"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={cn(
            "pointer-events-auto absolute z-[103] flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/80",
            "bg-gradient-to-br from-sage via-sage/90 to-terracotta/90 text-[#faf8f4] shadow-[0_12px_40px_-8px_hsl(9_100%_77%_/0.55),0_0_0_1px_hsl(82_14%_56%_/0.35)]",
            "motion-safe:animate-fab-energetic transition-transform hover:scale-105 active:scale-95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F4F0E8]",
          )}
          style={{ left: 0, top: 0 }}
          aria-expanded={open}
          aria-haspopup="true"
          aria-label={open ? "Close quick navigation" : "Open quick navigation"}
        >
          <AnimatePresence mode="wait" initial={false}>
            {open ? (
              <motion.span
                key="x"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <X className="h-6 w-6" strokeWidth={2.5} />
              </motion.span>
            ) : (
              <motion.span
                key="spark"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
              >
                <Sparkles className="h-7 w-7" strokeWidth={2} />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </div>
  );
}
