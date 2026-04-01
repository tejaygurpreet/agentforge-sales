/** Prompt 136 — HubSpot-style CRM hub illustration (sage / terracotta / coral, no third-party marks). */
export function HubspotIntegrationHero({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 320 220"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="hs136" x1="40" y1="20" x2="280" y2="200" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8F9E7E" stopOpacity="0.35" />
          <stop offset="0.45" stopColor="#FF9A8B" stopOpacity="0.2" />
          <stop offset="1" stopColor="#D4A373" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      <rect x="16" y="16" width="288" height="188" rx="20" fill="url(#hs136)" opacity="0.85" />
      <circle cx="160" cy="110" r="52" fill="#FAF7F2" fillOpacity="0.95" stroke="#8F9E7E" strokeOpacity="0.4" strokeWidth="2" />
      <circle cx="160" cy="110" r="28" fill="none" stroke="#D4A373" strokeOpacity="0.45" strokeWidth="2.5" />
      <circle cx="160" cy="110" r="12" fill="#FF9A8B" fillOpacity="0.55" />
      <path
        d="M88 110h40M232 110h40M160 42v36M160 142v36"
        stroke="#8F9E7E"
        strokeOpacity="0.35"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="88" cy="110" r="14" fill="#FAF7F2" stroke="#D4A373" strokeWidth="1.5" />
      <circle cx="232" cy="110" r="14" fill="#FAF7F2" stroke="#8F9E7E" strokeWidth="1.5" />
      <circle cx="160" cy="48" r="12" fill="#FAF7F2" stroke="#FF9A8B" strokeWidth="1.5" />
      <circle cx="160" cy="172" r="12" fill="#FAF7F2" stroke="#D4A373" strokeWidth="1.5" />
      <rect x="48" y="168" width="56" height="36" rx="8" fill="#FAF7F2" stroke="#8F9E7E" strokeOpacity="0.35" />
      <rect x="56" y="178" width="16" height="16" rx="2" fill="#8F9E7E" fillOpacity="0.35" />
      <path d="M80 186h16M80 194h10" stroke="#D4A373" strokeOpacity="0.4" strokeWidth="2" strokeLinecap="round" />
      <rect x="216" y="168" width="56" height="36" rx="8" fill="#FAF7F2" stroke="#D4A373" strokeOpacity="0.35" />
      <path d="M228 182h32M228 194h24" stroke="#8F9E7E" strokeOpacity="0.3" strokeWidth="3" strokeLinecap="round" />
      <text x="24" y="36" fill="#5c4a42" fillOpacity="0.55" fontSize="10" fontWeight="700" fontFamily="system-ui, sans-serif" letterSpacing="0.12em">
        CRM SYNC
      </text>
    </svg>
  );
}
