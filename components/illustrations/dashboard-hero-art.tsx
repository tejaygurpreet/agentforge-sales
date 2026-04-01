/**
 * Prompt 137 — Onyx Copper hero art: Deep onyx #111827 · Copper #B45309 · Warm sand #EDE0D4.
 */
export function DashboardHeroArt({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 560 340"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="dh-onyx-bg" x1="0" y1="0" x2="560" y2="340" gradientUnits="userSpaceOnUse">
          <stop stopColor="#111827" stopOpacity="0.12" />
          <stop offset="0.4" stopColor="#EDE0D4" stopOpacity="0.65" />
          <stop offset="0.7" stopColor="#B45309" stopOpacity="0.1" />
          <stop offset="1" stopColor="#111827" stopOpacity="0.08" />
        </linearGradient>
        <linearGradient id="dh-onyx-agent" x1="60" y1="80" x2="220" y2="280" gradientUnits="userSpaceOnUse">
          <stop stopColor="#111827" stopOpacity="0.26" />
          <stop offset="1" stopColor="#B45309" stopOpacity="0.16" />
        </linearGradient>
        <filter id="dh-onyx-soft" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
      </defs>
      <rect width="560" height="340" rx="24" fill="url(#dh-onyx-bg)" />
      <path
        d="M40 260c40-30 100-48 180-42s140 28 200 62"
        stroke="#B45309"
        strokeOpacity="0.35"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="6 10"
        fill="none"
      />
      <path
        d="M32 120c60 20 120 8 176-24"
        stroke="#111827"
        strokeOpacity="0.25"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="4 8"
        fill="none"
      />
      <g opacity="0.92">
        <path
          d="M380 48l28 18-28 18-28-18 28-18z"
          fill="#FFFFFF"
          stroke="#111827"
          strokeWidth="1.5"
          strokeOpacity="0.35"
        />
        <path d="M352 66l28 16v24l-28-16V66z" fill="#B45309" fillOpacity="0.15" />
        <path d="M408 66l-28 16v24l28-16V66z" fill="#111827" fillOpacity="0.1" />
      </g>
      <g transform="translate(300 200) rotate(-18)">
        <rect x="0" y="8" width="44" height="32" rx="6" fill="#FFFFFF" stroke="#B45309" strokeWidth="1.5" strokeOpacity="0.38" />
        <path d="M0 8l22 14L44 8" stroke="#B45309" strokeOpacity="0.32" strokeWidth="1.5" fill="none" />
      </g>
      <g transform="translate(420 88) rotate(12)">
        <rect x="0" y="6" width="40" height="28" rx="5" fill="#FFFFFF" stroke="#111827" strokeWidth="1.5" strokeOpacity="0.32" />
        <path d="M0 6l20 12L40 6" stroke="#111827" strokeOpacity="0.28" strokeWidth="1.5" fill="none" />
      </g>
      <g transform="translate(250 52) rotate(-8)">
        <rect x="0" y="4" width="36" height="26" rx="4" fill="#FFFFFF" stroke="#B45309" strokeWidth="1.5" strokeOpacity="0.4" />
        <path d="M0 4l18 11L36 4" stroke="#B45309" strokeOpacity="0.35" strokeWidth="1.5" fill="none" />
      </g>
      <rect x="72" y="88" width="168" height="200" rx="20" fill="url(#dh-onyx-agent)" stroke="#111827" strokeOpacity="0.28" strokeWidth="1.5" />
      <circle cx="156" cy="132" r="36" fill="#FFFFFF" fillOpacity="0.96" stroke="#111827" strokeOpacity="0.32" strokeWidth="1.5" />
      <line x1="156" y1="96" x2="156" y2="76" stroke="#B45309" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="156" cy="70" r="5" fill="#B45309" fillOpacity="0.7" />
      <circle cx="144" cy="128" r="5" fill="#111827" fillOpacity="0.35" />
      <circle cx="168" cy="128" r="5" fill="#111827" fillOpacity="0.35" />
      <path d="M142 148c8 6 20 6 28 0" stroke="#111827" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path
        d="M96 178h120M96 198h100M96 218h88"
        stroke="#FFFFFF"
        strokeOpacity="0.65"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <rect x="96" y="244" width="88" height="28" rx="10" fill="#111827" fillOpacity="0.28" />
      <text x="108" y="262" fill="#374151" fillOpacity="0.65" fontSize="11" fontWeight="600" fontFamily="system-ui, sans-serif">
        AI · RUN
      </text>
      <g transform="translate(320 96)">
        <rect x="0" y="0" width="200" height="160" rx="16" fill="#FFFFFF" fillOpacity="0.96" stroke="#B45309" strokeOpacity="0.26" strokeWidth="1.5" />
        <text x="12" y="26" fill="#4b5563" fillOpacity="0.7" fontSize="11" fontWeight="700" fontFamily="system-ui, sans-serif" letterSpacing="0.08em">
          SIGNALS
        </text>
        <rect x="20" y="120" width="28" height="32" rx="4" fill="#111827" fillOpacity="0.32" />
        <rect x="56" y="92" width="28" height="60" rx="4" fill="#B45309" fillOpacity="0.32" />
        <rect x="92" y="72" width="28" height="80" rx="4" fill="#111827" fillOpacity="0.38" />
        <rect x="128" y="104" width="28" height="48" rx="4" fill="#EDE0D4" fillOpacity="0.9" />
        <path d="M16 56h168" stroke="#111827" strokeOpacity="0.1" strokeWidth="1" />
        <path d="M16 72h120M16 88h140" stroke="#B45309" strokeOpacity="0.12" strokeWidth="3" strokeLinecap="round" />
      </g>
      <g filter="url(#dh-onyx-soft)">
        <path
          d="M468 240l8 14 16-10-10 14 18 4-18 6 10 14-16-10-8 14-8-14-16 10 10-14-18-4 18-6-10-14 16 10 8-14z"
          fill="#B45309"
          fillOpacity="0.22"
        />
      </g>
      <circle cx="492" cy="52" r="6" fill="#111827" fillOpacity="0.28" />
      <circle cx="48" cy="200" r="5" fill="#B45309" fillOpacity="0.36" />
      <path d="M228 64l6 6M234 64l-6 6" stroke="#B45309" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M244 58l4 4M248 58l-4 4" stroke="#111827" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
