"use client";

import {
  BarChart3,
  Bot,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareReply,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { HeaderInboxButton } from "@/components/dashboard/header-inbox-button";
import { InboxUnreadProvider } from "@/components/dashboard/inbox-unread-context";
import { ReplyIntelProvider } from "@/components/dashboard/reply-intel-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AgentForgeLogoMark } from "@/components/brand/agentforge-logo-mark";
import { DEFAULT_BRAND_DISPLAY_NAME } from "@/lib/brand-prompt";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";

export type DashboardNavLink = { href: string; label: string };

const NAV_ICONS: Record<string, LucideIcon> = {
  "/": LayoutDashboard,
  "/setup": Sparkles,
  "/onboarding": Sparkles,
  "/agents": Bot,
  "/replies": MessageSquareReply,
  "/analytics": BarChart3,
};

interface DashboardShellProps {
  /** Kept for sign-out / account flows; not shown in header (Prompt 136 beta). */
  email: string;
  /** Shown alone on the right — no email in the header (Prompt 136 beta). */
  displayName?: string;
  /** Prompt 79 — header product name + optional mark. Prompt 112 — full palette for CSS variables. */
  whiteLabel?: {
    appName: string;
    logoUrl: string;
    primaryColor: string;
    secondaryColor?: string;
  };
  /** Prompt 84 — primary nav (desktop + mobile sheet). */
  navLinks: DashboardNavLink[];
  /** Prompt 123 — seed unread badge (`getInboxUnreadCountAction`). */
  initialInboxUnreadCount: number;
  /** Prompt 129 — seed draft badge (`getInboxDraftCountAction`). */
  initialDraftCount: number;
  children: React.ReactNode;
}

function navLinkActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinkList({
  links,
  stacked,
  onNavigate,
}: {
  links: DashboardNavLink[];
  stacked: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <ul
      className={cn(
        stacked ? "flex flex-col gap-1.5" : "flex flex-row flex-wrap items-center gap-0.5 md:gap-1.5",
      )}
    >
      {links.map((l) => {
        const active = navLinkActive(pathname, l.href);
        const Icon = NAV_ICONS[l.href] ?? LayoutDashboard;
        return (
          <li key={l.href}>
            <Link
              href={l.href}
              onClick={onNavigate}
              className={cn(
                "group/nav flex items-center gap-2 rounded-[var(--card-radius)] text-sm font-medium outline-none transition-[transform,box-shadow,background-color,color] duration-200 ease-in-out",
                "focus-visible:ring-2 focus-visible:ring-sage/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
                stacked ? "px-3 py-3" : "px-3 py-2",
                active
                  ? "bg-sage/[0.12] text-foreground shadow-soft ring-1 ring-sage/22"
                  : "text-muted-foreground hover:-translate-y-0.5 hover:scale-[1.02] hover:bg-sage/[0.08] hover:text-foreground hover:shadow-soft",
                "active:scale-[0.98]",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 opacity-90 transition-transform duration-200 ease-out group-hover/nav:translate-x-0.5",
                  active && "text-sage",
                )}
                aria-hidden
              />
              {l.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function DashboardShell({
  email,
  displayName,
  whiteLabel,
  navLinks,
  initialInboxUnreadCount,
  initialDraftCount,
  children,
}: DashboardShellProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mobileOpen, setMobileOpen] = useState(false);

  function handleSignOut() {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    });
  }

  const brandLabel = whiteLabel?.appName?.trim() || DEFAULT_BRAND_DISPLAY_NAME;

  const brandCssVars = useMemo((): CSSProperties | undefined => {
    const p = whiteLabel?.primaryColor?.trim();
    const s = whiteLabel?.secondaryColor?.trim();
    if (!p && !s) return undefined;
    return {
      ...(p ? ({ "--brand-primary": p } as CSSProperties) : {}),
      ...(s ? ({ "--brand-secondary": s } as CSSProperties) : {}),
    };
  }, [whiteLabel?.primaryColor, whiteLabel?.secondaryColor]);

  return (
    <InboxUnreadProvider initialCount={initialInboxUnreadCount} initialDraftCount={initialDraftCount}>
      <div
        className="flex min-h-screen min-h-[100dvh] flex-col bg-background text-foreground antialiased selection:bg-sage/15 selection:text-foreground"
        style={brandCssVars}
      >
        <header className="energetic-banner-wash sticky top-0 z-30 border-b border-coral/25 bg-[#faf8f4]/92 shadow-[0_1px_0_0_hsl(9_100%_77%_/0.14),0_20px_56px_-24px_hsl(30_12%_15%_/0.12)] backdrop-blur-xl supports-[backdrop-filter]:bg-[#faf8f4]/85">
          <div className="mx-auto flex min-h-[3.5rem] max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-3 sm:h-[3.75rem] sm:px-8 sm:py-0">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 sm:gap-x-6 md:gap-x-8">
            <Link
              href="/"
              className="group flex min-w-0 max-w-[min(100%,min(280px,92vw))] shrink-0 items-center gap-2.5 text-[0.95rem] font-bold tracking-[-0.02em] text-[color-mix(in_srgb,hsl(var(--foreground))_92%,#5c5348)] transition-all duration-300 ease-out hover:text-foreground hover:[text-shadow:0_1px_0_rgba(255,255,255,0.5)] active:scale-[0.995] sm:max-w-md md:max-w-lg sm:text-lg"
              style={
                whiteLabel?.primaryColor
                  ? { color: whiteLabel.primaryColor }
                  : undefined
              }
            >
              {whiteLabel?.logoUrl?.trim() ? (
                <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-[var(--card-radius)] border border-sage/35 bg-card shadow-soft ring-1 ring-black/[0.04] transition-[transform,box-shadow] duration-200 ease-in-out group-hover:scale-[1.02] group-hover:shadow-card group-hover:ring-sage/25">
                  <Image
                    src={whiteLabel.logoUrl.trim()}
                    alt=""
                    width={36}
                    height={36}
                    className="object-contain"
                    unoptimized
                  />
                </span>
              ) : (
                <AgentForgeLogoMark className="h-9 w-9 transition-transform duration-200 ease-out group-hover:scale-[1.04]" />
              )}
              <span className="min-w-0 break-words text-balance sm:whitespace-normal sm:tracking-[-0.03em]">
                {whiteLabel?.appName?.trim() || DEFAULT_BRAND_DISPLAY_NAME}
              </span>
            </Link>

            <nav className="hidden min-w-0 flex-1 md:block md:max-w-none" aria-label="Main">
              <NavLinkList links={navLinks} stacked={false} />
            </nav>

            <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0 rounded-xl border-border/60 shadow-sm md:hidden"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm border-border/60 p-0 sm:max-w-md">
                <DialogHeader className="border-b border-border/50 bg-muted/20 px-4 py-4">
                  <DialogTitle className="text-left text-base font-semibold tracking-tight">Navigate</DialogTitle>
                  <p className="text-left text-xs text-muted-foreground">Jump to any area of the app</p>
                </DialogHeader>
                <nav className="px-3 py-4" aria-label="Mobile main">
                  <NavLinkList
                    links={navLinks}
                    stacked
                    onNavigate={() => setMobileOpen(false)}
                  />
                </nav>
              </DialogContent>
            </Dialog>
            </div>

            <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3 md:pl-1">
            <HeaderInboxButton />
            <span
              className="hidden max-w-[min(100%,200px)] truncate text-right text-sm font-semibold tracking-tight text-foreground md:block"
              title={displayName?.trim() || "Gurpreet Singh"}
            >
              {displayName?.trim() || "Gurpreet Singh"}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 rounded-xl border-border/60 shadow-sm transition-all duration-200 hover:scale-[1.02] hover:border-sage/35 hover:bg-sage/[0.08]"
              onClick={handleSignOut}
              disabled={pending}
              aria-label={email ? `Sign out (${email})` : "Sign out"}
            >
              <LogOut className="mr-1 h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 bg-transparent px-5 py-9 sm:px-8 sm:py-10">
          <ReplyIntelProvider>{children}</ReplyIntelProvider>
        </main>
        <footer
          className="mt-auto border-t border-border/35 bg-gradient-to-t from-muted/30 via-transparent to-transparent [border-top-color:color-mix(in_srgb,var(--brand-primary,transparent)_6%,hsl(var(--border)))]"
          role="contentinfo"
        >
          <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8">
            <p className="text-center text-[11px] leading-relaxed tracking-wide text-muted-foreground/90">
              <span className="font-medium text-foreground/80">{brandLabel}</span>
              <span className="mx-2 inline-block h-0.5 w-0.5 rounded-full bg-border align-middle opacity-70" aria-hidden />
              <span className="text-muted-foreground/80">Campaign intelligence workspace</span>
            </p>
          </div>
        </footer>
      </div>
    </InboxUnreadProvider>
  );
}
