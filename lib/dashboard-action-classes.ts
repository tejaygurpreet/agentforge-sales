import { cn } from "@/lib/utils";

/**
 * Prompt 29 — Dashboard actions must stay readable on any theme (including dark + heavy primary tints).
 * Near-white surface + near-black label in both light and dark mode; `!` beats outline hover tokens.
 */
export const dashboardOutlineActionClass = cn(
  "!border-2 !border-zinc-800 !bg-white !font-bold !text-zinc-950 !shadow-sm",
  "hover:!bg-zinc-50 hover:!text-zinc-950",
  "active:!bg-zinc-100",
  "dark:!border-white dark:!bg-white dark:!text-black",
  "dark:hover:!bg-zinc-100 dark:hover:!text-black",
  "[&_svg]:!text-zinc-950 dark:[&_svg]:!text-black",
);
