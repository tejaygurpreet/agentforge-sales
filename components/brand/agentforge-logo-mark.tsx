import { cn } from "@/lib/utils";

/** Prompt 138 — Header mark: onyx + copper on warm canvas (matches default brand). */
export function AgentForgeLogoMark({ className }: { className?: string }) {
  return (
    <svg
      className={cn("shrink-0", className)}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="2" y="2" width="36" height="36" rx="10" fill="#F9F6F0" stroke="#111827" strokeOpacity="0.22" strokeWidth="1.25" />
      <path
        d="M11 27V13h5l4.5 10h.1L25 13h4v14h-3v-9.5h-.1L21 27h-3l-5-9.5h-.1V27H11z"
        fill="#111827"
      />
      <circle cx="31" cy="10" r="3.25" fill="#B45309" fillOpacity="0.92" />
    </svg>
  );
}
