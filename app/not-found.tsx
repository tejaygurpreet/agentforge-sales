import { Compass, Home } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Prompt 113 — friendly 404 with light aesthetic and clear way home. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen min-h-[100dvh] flex-col items-center justify-center bg-background bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--canvas-mid))_42%,hsl(var(--canvas-btm))_100%)] bg-fixed px-4 py-12">
      <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-500 motion-safe:animate-content-settle">
        <div className="rounded-2xl border border-border/55 bg-card/95 p-8 text-center shadow-lift ring-1 ring-black/[0.04] backdrop-blur-sm">
          <div className="mb-6 flex justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.1] to-accent/[0.06] text-primary shadow-sm ring-1 ring-primary/15">
              <Compass className="h-7 w-7" aria-hidden />
            </span>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/80">404</p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground">This page isn&apos;t here</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            The link may be outdated or the page may have moved. Use the button below to return to your
            workspace.
          </p>
          <Button asChild className="mt-8 gap-2 rounded-xl shadow-soft">
            <Link href="/">
              <Home className="h-4 w-4" aria-hidden />
              Back to dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
