/**
 * Prompt 135 — Setup / integrations hero: connected nodes, warm gradients, no blue.
 */
export function SetupIntegrationsHero({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 560 220"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="sih-a" x1="0" y1="0" x2="560" y2="220" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8F9E7E" stopOpacity="0.2" />
          <stop offset="0.5" stopColor="#D4A373" stopOpacity="0.14" />
          <stop offset="1" stopColor="#FAF7F2" stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id="sih-b" x1="280" y1="40" x2="520" y2="200" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D4A373" stopOpacity="0.35" />
          <stop offset="1" stopColor="#8F9E7E" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      <rect width="560" height="220" rx="20" fill="url(#sih-a)" />
      <circle cx="480" cy="36" r="64" fill="url(#sih-b)" opacity="0.55" />
      <path
        d="M48 120h120c12 0 22-10 22-22V72c0-12 10-22 22-22h104"
        stroke="#8F9E7E"
        strokeOpacity="0.45"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M48 120h200c14 0 26 12 26 26v0c0 14 12 26 26 26h88"
        stroke="#D4A373"
        strokeOpacity="0.4"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="6 8"
      />
      <rect x="32" y="88" width="72" height="64" rx="14" fill="#FAF7F2" stroke="#8F9E7E" strokeOpacity="0.35" strokeWidth="1.5" />
      <circle cx="68" cy="112" r="10" fill="#8F9E7E" fillOpacity="0.35" />
      <path d="M62 128h12M58 136h20" stroke="#D4A373" strokeOpacity="0.45" strokeWidth="3" strokeLinecap="round" />
      <rect x="220" y="40" width="100" height="72" rx="12" fill="#FAF7F2" stroke="#D4A373" strokeOpacity="0.35" strokeWidth="1.5" />
      <rect x="236" y="58" width="68" height="8" rx="3" fill="#8F9E7E" fillOpacity="0.3" />
      <rect x="236" y="74" width="48" height="6" rx="2" fill="#D4A373" fillOpacity="0.25" />
      <rect x="380" y="96" width="120" height="88" rx="14" fill="#FAF7F2" stroke="#8F9E7E" strokeOpacity="0.3" strokeWidth="1.5" />
      <circle cx="440" cy="132" r="22" stroke="#8F9E7E" strokeOpacity="0.35" strokeWidth="2" fill="none" />
      <path d="M432 132l6 6 14-16" stroke="#D4A373" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="400" y="164" width="80" height="6" rx="2" fill="#8F9E7E" fillOpacity="0.2" />
    </svg>
  );
}
