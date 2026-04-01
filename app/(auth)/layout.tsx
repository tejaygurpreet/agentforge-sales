import type { ReactNode } from "react";
import { DEFAULT_BRAND_DISPLAY_NAME } from "@/lib/brand-prompt";

/**
 * Prompt 107 — Auth routes shell.
 * Prompt 136 — Same energetic canvas as root body (sage/coral radial washes).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen min-h-[100dvh] overflow-x-hidden bg-white bg-[radial-gradient(ellipse_100%_80%_at_100%_0%,hsl(var(--coral)_/_0.08),transparent_50%),radial-gradient(ellipse_90%_60%_at_0%_100%,hsl(var(--sage)_/_0.07),transparent_48%)]">
      {children}
      <p className="pointer-events-none absolute bottom-4 left-0 right-0 z-10 text-center text-[11px] font-medium tracking-wide text-muted-foreground/90">
        {DEFAULT_BRAND_DISPLAY_NAME} · Secure sign-in
      </p>
    </div>
  );
}
