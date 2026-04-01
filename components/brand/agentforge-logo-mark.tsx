import { cn } from "@/lib/utils";

/** Prompt 135 — Compact mark for header when no custom logo (sage + terracotta, no blue). */
export function AgentForgeLogoMark({ className }: { className?: string }) {
  return (
    <svg
      className={cn("shrink-0", className)}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="2" y="2" width="36" height="36" rx="10" fill="#FAF7F2" stroke="#8F9E7E" strokeOpacity="0.45" strokeWidth="1.25" />
      <path d="M11 27V13h5l4.5 10h.1L25 13h4v14h-3v-9.5h-.1L21 27h-3l-5-9.5h-.1V27H11z" fill="#8F9E7E" />
      <circle cx="31" cy="10" r="3.25" fill="#D4A373" fillOpacity="0.9" />
    </svg>
  );
}
