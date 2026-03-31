import type { ReactNode } from "react";
import { DEFAULT_BRAND_DISPLAY_NAME } from "@/lib/brand-prompt";

/**
 * Shared shell for login & signup (Prompt 107): soft gradients, radial highlight, centered content.
 * Prompt 112 — footer line uses default brand constant (auth is pre-session; white-label applies after sign-in).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen min-h-[100dvh] overflow-x-hidden bg-gradient-to-b from-amber-50/50 via-background to-violet-50/40">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_-15%,hsl(var(--primary)/0.14),transparent_55%)]"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tl from-violet-200/25 via-transparent to-transparent" aria-hidden />
      <div className="relative flex min-h-screen min-h-[100dvh] flex-col items-center justify-center px-4 py-10 sm:px-6 sm:py-12">
        {children}
      </div>
      <p className="pointer-events-none absolute bottom-4 left-0 right-0 text-center text-[11px] font-medium tracking-wide text-muted-foreground/80">
        {DEFAULT_BRAND_DISPLAY_NAME} · Secure sign-in
      </p>
    </div>
  );
}
