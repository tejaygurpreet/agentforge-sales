/**
 * Prompt 136 — Decorative voice waveform for Jump To sidebar (sage / terracotta / coral).
 */
export function VoiceWavesMini({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M4 28c4-8 8-8 12 0s8 8 12 0 8-8 12 0 8 8 12 0 8-8 12 0 8 8 12 0"
        stroke="#8F9E7E"
        strokeOpacity={0.55}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <path
        d="M8 20c3-10 6-10 9 0s6 10 9 0 6-10 9 0 6 10 9 0 6-10 9 0 6 10 9 0"
        stroke="#D4A373"
        strokeOpacity={0.65}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <path
        d="M12 32c2-14 4-14 6 0s4 14 6 0 4-14 6 0 4 14 6 0 4-14 6 0 4 14 6 0"
        stroke="#FF9A8B"
        strokeOpacity={0.75}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
    </svg>
  );
}
