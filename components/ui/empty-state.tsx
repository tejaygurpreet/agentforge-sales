import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateSize = "sm" | "md" | "lg";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  /** Extra actions (e.g. links or buttons). */
  children?: ReactNode;
  className?: string;
  size?: EmptyStateSize;
  variant?: "default" | "soft";
};

const sizeStyles: Record<
  EmptyStateSize,
  { wrap: string; icon: string; py: string; title: string }
> = {
  sm: {
    wrap: "h-10 w-10 rounded-xl",
    icon: "h-5 w-5",
    py: "py-7",
    title: "text-sm font-semibold tracking-tight",
  },
  md: {
    wrap: "h-14 w-14 rounded-2xl",
    icon: "h-7 w-7",
    py: "py-10",
    title: "text-base font-semibold tracking-tight",
  },
  lg: {
    wrap: "h-16 w-16 rounded-2xl",
    icon: "h-8 w-8",
    py: "py-12",
    title: "text-lg font-semibold tracking-tight",
  },
};

/**
 * Friendly empty / zero-data surface (Prompt 108) — gradients, clear next steps, optional actions.
 * Prompt 111 — entrance animation, hover lift on default variant, icon scale on group hover.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
  size = "md",
  variant = "default",
}: EmptyStateProps) {
  const s = sizeStyles[size];
  return (
    <div
      className={cn(
        "group flex flex-col items-center justify-center gap-4 text-center",
        "animate-in fade-in zoom-in-95 duration-500",
        s.py,
        "px-4",
        variant === "soft"
          ? "rounded-2xl border border-border/40 bg-muted/15 transition-shadow duration-300 hover:shadow-soft"
          : "rounded-2xl border border-dashed border-border/55 bg-gradient-to-b from-muted/35 via-card/50 to-card/90 shadow-inner ring-1 ring-black/[0.02] transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-md hover:shadow-soft",
        className,
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-center border border-primary/20 bg-primary/[0.08] text-primary shadow-sm transition-transform duration-300 ease-out group-hover:scale-105",
          s.wrap,
        )}
      >
        <Icon className={cn(s.icon, "opacity-90 transition-opacity duration-300 group-hover:opacity-100")} aria-hidden />
      </div>
      <div className="max-w-md space-y-2">
        <p className={cn("text-foreground", s.title)}>{title}</p>
        <div className="text-sm leading-relaxed text-muted-foreground [&_code]:rounded-md [&_code]:bg-muted/70 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_strong]:font-semibold [&_strong]:text-foreground/90">
          {description}
        </div>
      </div>
      {children ? (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">{children}</div>
      ) : null}
    </div>
  );
}
