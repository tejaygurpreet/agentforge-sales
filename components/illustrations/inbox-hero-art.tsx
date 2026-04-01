/** Prompt 137 — Onyx Copper inbox masthead. */
export function InboxHeroArt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 640 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id="ib-onyx" x1="0" y1="0" x2="640" y2="100" gradientUnits="userSpaceOnUse">
          <stop stopColor="#111827" stopOpacity="0.1" />
          <stop offset="0.55" stopColor="#EDE0D4" stopOpacity="0.55" />
          <stop offset="1" stopColor="#B45309" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      <rect width="640" height="100" rx="20" fill="url(#ib-onyx)" />
      <path
        d="M48 52h180M420 52h172"
        stroke="#111827"
        strokeOpacity="0.18"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="5 8"
      />
      <g transform="translate(260 28)">
        <rect width="120" height="56" rx="10" fill="#F9F6F0" stroke="#B45309" strokeOpacity="0.32" strokeWidth="1.5" />
        <path d="M0 28l60 16 60-16" stroke="#111827" strokeOpacity="0.28" strokeWidth="1.5" fill="none" />
      </g>
      <g transform="translate(520 34) rotate(8)">
        <rect width="48" height="36" rx="6" fill="#F9F6F0" stroke="#B45309" strokeOpacity="0.36" strokeWidth="1.2" />
        <path d="M0 10l24 12L48 10" stroke="#B45309" strokeOpacity="0.3" strokeWidth="1.2" fill="none" />
      </g>
      <g transform="translate(72 34) rotate(-6)">
        <rect width="44" height="34" rx="6" fill="#F9F6F0" stroke="#111827" strokeOpacity="0.28" strokeWidth="1.2" />
        <path d="M0 9l22 11L44 9" stroke="#111827" strokeOpacity="0.24" strokeWidth="1.2" fill="none" />
      </g>
      <circle cx="200" cy="30" r="4" fill="#B45309" fillOpacity="0.5" />
      <circle cx="440" cy="68" r="5" fill="#111827" fillOpacity="0.32" />
    </svg>
  );
}
