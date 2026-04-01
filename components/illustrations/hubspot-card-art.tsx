/** Prompt 135 — Decorative HubSpot-style CRM hub (sage + terracotta only). */
export function HubSpotCardArt({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 200 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="hsa" x1="30" y1="10" x2="170" y2="130" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8F9E7E" stopOpacity="0.25" />
          <stop offset="1" stopColor="#D4A373" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <rect x="8" y="16" width="184" height="108" rx="16" fill="url(#hsa)" stroke="#D4A373" strokeOpacity="0.35" strokeWidth="1.2" />
      <circle cx="100" cy="58" r="28" fill="#FAF7F2" stroke="#8F9E7E" strokeOpacity="0.45" strokeWidth="1.5" />
      <path
        d="M88 58c0-6.6 5.4-12 12-12s12 5.4 12 12-5.4 12-12 12"
        stroke="#8F9E7E"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="100" cy="58" r="6" fill="#D4A373" fillOpacity="0.55" />
      <rect x="36" y="98" width="52" height="14" rx="6" fill="#8F9E7E" fillOpacity="0.35" />
      <rect x="112" y="98" width="52" height="14" rx="6" fill="#D4A373" fillOpacity="0.3" />
      <path d="M24 40l16-8 16 8" stroke="#8F9E7E" strokeOpacity="0.4" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
