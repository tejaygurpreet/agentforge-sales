/** Prompt 136 — Inbox route masthead: mail flow + energy accents. */
export function InboxHeroArt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 640 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id="ib136" x1="0" y1="0" x2="640" y2="100" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8F9E7E" stopOpacity="0.2" />
          <stop offset="0.5" stopColor="#FF9A8B" stopOpacity="0.12" />
          <stop offset="1" stopColor="#D4A373" stopOpacity="0.18" />
        </linearGradient>
      </defs>
      <rect width="640" height="100" rx="20" fill="url(#ib136)" />
      <path
        d="M48 52h180M420 52h172"
        stroke="#8F9E7E"
        strokeOpacity="0.25"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="5 8"
      />
      <g transform="translate(260 28)">
        <rect width="120" height="56" rx="10" fill="#FAF7F2" stroke="#D4A373" strokeOpacity="0.4" strokeWidth="1.5" />
        <path d="M0 28l60 16 60-16" stroke="#8F9E7E" strokeOpacity="0.45" strokeWidth="1.5" fill="none" />
      </g>
      <g transform="translate(520 34) rotate(8)">
        <rect width="48" height="36" rx="6" fill="#FAF7F2" stroke="#FF9A8B" strokeOpacity="0.45" strokeWidth="1.2" />
        <path d="M0 10l24 12L48 10" stroke="#FF9A8B" strokeOpacity="0.4" strokeWidth="1.2" fill="none" />
      </g>
      <g transform="translate(72 34) rotate(-6)">
        <rect width="44" height="34" rx="6" fill="#FAF7F2" stroke="#8F9E7E" strokeOpacity="0.4" strokeWidth="1.2" />
        <path d="M0 9l22 11L44 9" stroke="#8F9E7E" strokeOpacity="0.35" strokeWidth="1.2" fill="none" />
      </g>
      <circle cx="200" cy="30" r="4" fill="#FF9A8B" fillOpacity="0.6" />
      <circle cx="440" cy="68" r="5" fill="#8F9E7E" fillOpacity="0.45" />
    </svg>
  );
}
