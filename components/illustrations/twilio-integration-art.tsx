/** Prompt 136 — Voice / phone waves illustration. */
export function TwilioIntegrationArt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="10" y="14" width="180" height="92" rx="14" fill="#FAF7F2" stroke="#D4A373" strokeOpacity="0.35" strokeWidth="1.5" />
      <path
        d="M52 60c0-12 10-22 22-22h52c12 0 22 10 22 22s-10 22-22 22H74c-12 0-22-10-22-22z"
        fill="#8F9E7E"
        fillOpacity="0.2"
        stroke="#8F9E7E"
        strokeOpacity="0.45"
        strokeWidth="1.5"
      />
      <path
        d="M88 48c-4 8-4 24 0 32M100 42c-6 12-6 36 0 48M112 48c4 8 4 24 0 32"
        stroke="#FF9A8B"
        strokeOpacity="0.5"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="100" cy="60" r="6" fill="#D4A373" fillOpacity="0.55" />
    </svg>
  );
}
