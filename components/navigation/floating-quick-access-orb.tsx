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
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const STORAGE_KEY = "af-quick-orb-pos-onyx-v3";
const ORB_SIZE = 58;
const MENU_RADIUS_BASE = 168;
const DRAG_THRESHOLD = 6;

/** Premium gold for lightning + menu icons (Onyx Copper palette accent). */
const GOLD = "#D4AF37";
/** Warm sand for hover labels. */
const LABEL_COLOR = "#EDE0D4";

const MENU = [
  { label: "Inbox", href: "/inbox", icon: Inbox },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Setup", href: "/setup", icon: Settings },
  { label: "Agents", href: "/agents", icon: Bot },
  { label: "Replies", href: "/replies", icon: MessageSquareReply },
  { label: "Compose email", href: "/inbox?compose=1", icon: Mail },
  { label: "Recent campaigns", href: "/#recent-campaigns", icon: Layers },
  { label: "Workspace", href: "/#campaign-workspace", icon: LayoutDashboard },
] as const;

/** Round icon footprint — collapsed diameter. */
const BUTTON_PX = 50;
const BUTTON_R = BUTTON_PX / 2;
const VIEWPORT_PAD = 14;
/**
 * Inflate ring fit checks so radial positions leave room for hover-expanded pills
 * (icon + label to the right) without clipping the viewport.
 */
const HOVER_LABEL_INFLATE = 92;

type Pos = { left: number; top: number };

type MenuGeom = { radius: number; startAngle: number };

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

function buttonBounds(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  i: number,
  n: number,
  inflate: number,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const angle = startAngle + (2 * Math.PI * i) / n;
  const px = cx + Math.cos(angle) * radius;
  const py = cy + Math.sin(angle) * radius;
  const r = BUTTON_R + inflate;
  return {
    minX: px - r,
    maxX: px + r,
    minY: py - r,
    maxY: py + r,
  };
}

function ringFitsViewport(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  n: number,
  pad: number,
): boolean {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  for (let i = 0; i < n; i++) {
    const b = buttonBounds(cx, cy, radius, startAngle, i, n, HOVER_LABEL_INFLATE);
    if (b.minX < pad || b.maxX > vw - pad || b.minY < pad || b.maxY > vh - pad) {
      return false;
    }
  }
  return true;
}

/**
 * Orb stays the true center: shrink radius and/or rotate the ring so collapsed + hover
 * inflated bounds stay on-screen (best direction / no cutoff).
 */
function computeRadialMenuGeom(pos: Pos, itemCount: number): MenuGeom {
  if (typeof window === "undefined") {
    return { radius: MENU_RADIUS_BASE, startAngle: -Math.PI / 2 };
  }
  const cx = pos.left + ORB_SIZE / 2;
  const cy = pos.top + ORB_SIZE / 2;
  const pad = VIEWPORT_PAD;
  const n = itemCount;
  const minRadius = Math.ceil(ORB_SIZE / 2 + BUTTON_R + 12);

  const tryAngles = 24;
  for (let r = MENU_RADIUS_BASE; r >= minRadius; r -= 6) {
    for (let a = 0; a < tryAngles; a++) {
      const startAngle = -Math.PI / 2 + (a * 2 * Math.PI) / tryAngles;
      if (ringFitsViewport(cx, cy, r, startAngle, n, pad)) {
        return { radius: r, startAngle };
      }
    }
  }

  return {
    radius: minRadius,
    startAngle: -Math.PI / 2,
  };
}

const hoverEase = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * Prompt 139 — Radial orb + hover: icon-only circle by default; on hover, subtle scale
 * and label fades/slides in to the right of the gold icon (warm sand type).
 */
export function FloatingQuickAccessOrb() {
  const [pos, setPos] = useState<Pos | null>(null);
  const [open, setOpen] = useState(false);
  const [menuGeom, setMenuGeom] = useState<MenuGeom>({
    radius: MENU_RADIUS_BASE,
    startAngle: -Math.PI / 2,
  });
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
      if (!raw) {
        const prev = localStorage.getItem("af-quick-orb-pos-onyx-v2");
        if (prev) {
          localStorage.setItem(STORAGE_KEY, prev);
          const p = JSON.parse(prev) as Pos;
          if (typeof p.left === "number" && typeof p.top === "number") {
            setPos(clampPos(p.left, p.top));
            return;
          }
        }
      } else {
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
        typeof window !== "undefined" ? window.innerWidth - ORB_SIZE - 20 : 20,
        typeof window !== "undefined" ? window.innerHeight - ORB_SIZE - 24 : 100,
      ),
    );
  }, []);

  useEffect(() => {
    function onResize() {
      setPos((prev) => (prev ? clampPos(prev.left, prev.top) : prev));
      if (open && pos) {
        setMenuGeom(computeRadialMenuGeom(pos, MENU.length));
      }
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, pos]);

  useLayoutEffect(() => {
    if (open && pos) {
      setMenuGeom(computeRadialMenuGeom(pos, MENU.length));
    }
  }, [open, pos]);

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
      setPos(clampPos(drag.current.startLeft + dx, drag.current.startTop + dy));
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

  const n = MENU.length;
  const { radius: ringR, startAngle } = menuGeom;
  const ringPad = HOVER_LABEL_INFLATE + BUTTON_PX / 2 + 20;
  const ringBox = ringR * 2 + ringPad * 2;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100]">
      <AnimatePresence>
        {open ? (
          <motion.button
            type="button"
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-auto absolute inset-0 bg-[#111827]/18 backdrop-blur-[4px]"
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
          {open ? (
            <motion.div
              key="menu-ring"
              initial={{ scale: 0.08, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.1, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 28, mass: 0.82 }}
              className="pointer-events-none absolute left-1/2 top-1/2 z-[101] -translate-x-1/2 -translate-y-1/2 overflow-visible"
              style={{ width: ringBox, height: ringBox }}
            >
              {MENU.map((item, i) => {
                const angle = startAngle + (2 * Math.PI * i) / n;
                const x = Math.cos(angle) * ringR;
                const y = Math.sin(angle) * ringR;
                const Icon = item.icon;
                return (
                  <motion.div
                    key={item.href}
                    initial={{ opacity: 0, scale: 0.35, x: 0, y: 0 }}
                    animate={{ opacity: 1, scale: 1, x, y }}
                    exit={{ opacity: 0, scale: 0.2, x: 0, y: 0 }}
                    transition={{
                      type: "spring",
                      stiffness: 420,
                      damping: 32,
                      delay: 0.04 * i,
                    }}
                    className="pointer-events-auto absolute left-1/2 top-1/2 z-[102] -translate-x-1/2 -translate-y-1/2 overflow-visible"
                  >
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "group relative flex h-[50px] min-h-[50px] max-h-[50px] min-w-[50px] max-w-[50px] items-center justify-center overflow-hidden rounded-full border-2 border-[#B45309] bg-[#111827] will-change-transform",
                        "shadow-[0_12px_28px_-8px_rgba(17,24,39,0.45)]",
                        "transition-[min-width,max-width,transform,box-shadow,padding,gap] duration-300",
                        "hover:z-[120] hover:min-w-[220px] hover:max-w-[min(280px,calc(100vw-40px))] hover:scale-[1.06] hover:justify-start hover:gap-2.5 hover:pl-3.5 hover:pr-4",
                        "hover:shadow-[0_0_28px_-4px_rgba(180,83,9,0.55),0_16px_36px_-10px_rgba(17,24,39,0.5)]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B45309]/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F9F6F0]",
                      )}
                      style={{ transitionTimingFunction: hoverEase }}
                      aria-label={item.label}
                    >
                      <Icon
                        className="relative z-[1] h-[22px] w-[22px] shrink-0"
                        strokeWidth={2.1}
                        style={{ color: GOLD }}
                        aria-hidden
                      />
                      <span
                        className={cn(
                          "pointer-events-none select-none text-left text-[11px] font-semibold leading-none tracking-tight sm:text-xs",
                          "max-w-0 -translate-x-1 overflow-hidden opacity-0",
                          "transition-[max-width,opacity,transform,margin] duration-300",
                          "group-hover:ml-0 group-hover:max-w-[15rem] group-hover:translate-x-0 group-hover:opacity-100",
                        )}
                        style={{
                          color: LABEL_COLOR,
                          transitionTimingFunction: hoverEase,
                        }}
                        aria-hidden
                      >
                        {item.label}
                      </span>
                    </Link>
                  </motion.div>
                );
              })}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <motion.button
          type="button"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={cn(
            "pointer-events-auto absolute z-[103] flex h-[58px] w-[58px] items-center justify-center rounded-full",
            "border-2 border-[#B45309]/90 bg-[#111827]",
            "shadow-[0_0_0_1px_rgba(180,83,9,0.12),0_10px_38px_-10px_rgba(17,24,39,0.55),0_0_40px_-12px_rgba(180,83,9,0.28)]",
            "motion-safe:animate-orb-idle motion-safe:[&_.orb-zap]:animate-orb-spark-soft",
            "transition-[transform,box-shadow] duration-300 hover:scale-[1.03] active:scale-[0.98]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B45309]/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F9F6F0]",
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
                initial={{ rotate: -90, opacity: 0, scale: 0.85 }}
                animate={{ rotate: 0, opacity: 1, scale: 1 }}
                exit={{ rotate: 90, opacity: 0, scale: 0.85 }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
              >
                <X className="h-6 w-6 text-white drop-shadow" strokeWidth={2.5} />
              </motion.span>
            ) : (
              <motion.span
                key="zap"
                className="orb-zap flex items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <Zap
                  className="h-7 w-7 drop-shadow-[0_0_14px_rgba(212,175,55,0.45)]"
                  strokeWidth={2.15}
                  fill={GOLD}
                  fillOpacity={0.22}
                  style={{ color: GOLD }}
                  aria-hidden
                />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </div>
  );
}
