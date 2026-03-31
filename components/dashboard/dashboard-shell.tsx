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
import { DEFAULT_BRAND_DISPLAY_NAME } from "@/lib/brand-prompt";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";

export type DashboardNavLink = { href: string; label: string };

const NAV_ICONS: Record<string, LucideIcon> = {
  "/": LayoutDashboard,
  "/onboarding": Sparkles,
  "/agents": Bot,
  "/replies": MessageSquareReply,
  "/analytics": BarChart3,
};

interface DashboardShellProps {
  email: string;
  /** From signup (user_metadata.full_name); optional. */
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
                "group/nav flex items-center gap-2 rounded-xl text-sm font-medium outline-none transition-all duration-200 ease-out",
                "focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                stacked ? "px-3 py-3" : "px-3 py-2",
                active
                  ? "bg-primary/[0.12] text-foreground shadow-soft ring-1 ring-primary/22"
                  : "text-muted-foreground hover:bg-primary/[0.08] hover:text-foreground hover:shadow-sm",
                "active:scale-[0.98]",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 opacity-90 transition-transform duration-200 ease-out group-hover/nav:translate-x-0.5",
                  active && "text-primary",
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
        className="flex min-h-screen min-h-[100dvh] flex-col text-foreground antialiased selection:bg-primary/15 selection:text-foreground"
        style={brandCssVars}
      >
        <header className="sticky top-0 z-30 border-b border-[color-mix(in_srgb,hsl(var(--foreground))_6%,hsl(var(--border)))] bg-[#F8F5F0]/95 bg-gradient-to-b from-[#F8F5F0] via-[#F8F5F0]/92 to-[color-mix(in_srgb,#F8F5F0_88%,#EDE8E0)] shadow-[0_1px_0_0_rgba(60,48,36,0.06),0_10px_40px_-18px_rgba(55,45,35,0.12)] backdrop-blur-xl supports-[backdrop-filter]:bg-[#F8F5F0]/80">
          <div className="mx-auto flex min-h-[3.5rem] max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-2.5 px-3 py-2.5 sm:h-[3.75rem] sm:px-6 sm:py-0">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 sm:gap-x-5 md:gap-x-7">
            <Link
              href="/"
              className="group flex shrink-0 items-center gap-2.5 text-[0.95rem] font-semibold tracking-[-0.02em] text-[color-mix(in_srgb,hsl(var(--foreground))_92%,#5c5348)] transition-all duration-300 ease-out hover:text-foreground hover:[text-shadow:0_1px_0_rgba(255,255,255,0.5)] active:scale-[0.995] sm:text-base"
              style={
                whiteLabel?.primaryColor
                  ? { color: whiteLabel.primaryColor }
                  : undefined
              }
            >
              {whiteLabel?.logoUrl?.trim() ? (
                <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-xl border border-[color-mix(in_srgb,#9CA88B_35%,hsl(var(--border)))] bg-[hsl(var(--card))] shadow-[0_2px_8px_-2px_rgba(55,48,40,0.12)] ring-1 ring-black/[0.04] transition-all duration-300 group-hover:scale-[1.03] group-hover:shadow-md group-hover:ring-[#9CA88B]/25">
                  <Image
                    src={whiteLabel.logoUrl.trim()}
                    alt=""
                    width={36}
                    height={36}
                    className="object-contain"
                    unoptimized
                  />
                </span>
              ) : null}
              <span className="whitespace-nowrap sm:tracking-[-0.03em]">
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

            <div className="flex shrink-0 items-center gap-2 sm:gap-3 md:pl-1">
            <HeaderInboxButton />
            <span
              className="hidden max-w-[min(200px,28vw)] truncate text-xs leading-tight text-muted-foreground md:inline lg:max-w-[min(260px,32vw)]"
              title={email}
            >
              {displayName ? `${displayName} · ${email}` : email}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 rounded-xl border-border/60 shadow-sm transition-all duration-200 hover:border-primary/35 hover:bg-primary/[0.07]"
              onClick={handleSignOut}
              disabled={pending}
            >
              <LogOut className="mr-1 h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-7 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500 sm:px-6 sm:py-11">
          <ReplyIntelProvider>{children}</ReplyIntelProvider>
        </main>
        <footer
          className="mt-auto border-t border-border/35 bg-gradient-to-t from-muted/30 via-transparent to-transparent [border-top-color:color-mix(in_srgb,var(--brand-primary,transparent)_6%,hsl(var(--border)))]"
          role="contentinfo"
        >
          <div className="mx-auto max-w-6xl px-3 py-5 sm:px-6 sm:py-6">
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
