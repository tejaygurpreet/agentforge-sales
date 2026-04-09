"use client";

import {
  BarChart3,
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
  "/campaigns": LayoutDashboard,
  "/setup": Sparkles,
  "/onboarding": Sparkles,
  "/replies": MessageSquareReply,
  "/analytics": BarChart3,
};

interface DashboardShellProps {
  email: string;
  displayName?: string;
  guestMode?: boolean;
  hideShellFooter?: boolean;
  whiteLabel?: {
    appName: string;
    logoUrl: string;
    primaryColor: string;
    secondaryColor?: string;
  };
  navLinks: DashboardNavLink[];
  children: React.ReactNode;
}

function navLinkActive(pathname: string, href: string): boolean {
  const base = href.split("#")[0] || href;
  if (base === "/") return pathname === "/";
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Prompt 138 — Full desktop nav: Dashboard · Setup · Agents · Replies · Analytics with copper underline. */
function DesktopMainNav({ links }: { links: DashboardNavLink[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden min-w-0 flex-1 justify-center md:flex">
      <ul className="flex flex-wrap items-center justify-center gap-x-0.5 lg:gap-x-1">
        {links.map((l) => {
          const active = navLinkActive(pathname, l.href);
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                className={cn(
                  "relative block px-3 py-2 text-[13px] font-bold tracking-tight transition-colors duration-200 lg:text-sm",
                  "after:absolute after:inset-x-3 after:bottom-1 after:h-px after:origin-center after:scale-x-0 after:bg-[#B45309] after:transition-transform after:duration-200 after:ease-out",
                  active
                    ? "text-[#111827] after:scale-x-100"
                    : "text-[#111827]/72 hover:text-[#111827] hover:after:scale-x-100 hover:after:bg-[#B45309]/55",
                )}
                aria-current={active ? "page" : undefined}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function NavLinkListMobile({
  links,
  onNavigate,
}: {
  links: DashboardNavLink[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <ul className="flex flex-col gap-1.5">
      {links.map((l) => {
        const active = navLinkActive(pathname, l.href);
        const Icon = NAV_ICONS[l.href] ?? LayoutDashboard;
        return (
          <li key={l.href}>
            <Link
              href={l.href}
              onClick={onNavigate}
              className={cn(
                "group/nav flex items-center gap-2 rounded-[var(--card-radius)] px-3 py-3 text-sm font-semibold outline-none transition-colors duration-200",
                "focus-visible:ring-2 focus-visible:ring-terracotta/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F9F6F0]",
                active
                  ? "bg-[#111827]/[0.07] text-foreground ring-1 ring-[#B45309]/20"
                  : "text-muted-foreground hover:bg-[#EDE0D4]/40 hover:text-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 opacity-90",
                  active && "text-[#B45309]",
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

function HeaderBrandTitle({
  whiteLabel,
}: {
  whiteLabel?: DashboardShellProps["whiteLabel"];
}) {
  const custom = whiteLabel?.appName?.trim();
  if (custom) {
    return (
      <span className="truncate text-[0.95rem] font-bold leading-tight tracking-[-0.02em] text-[#111827]">
        {custom}
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap text-[0.95rem] font-bold leading-tight tracking-[-0.02em] text-[#111827]">
      Agent<span className="text-[#B45309]">Forge</span> Sales
    </span>
  );
}

export function DashboardShell({
  email,
  displayName,
  guestMode = false,
  hideShellFooter = false,
  whiteLabel,
  navLinks,
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
  const userName = displayName?.trim() || "Member";

  const brandCssVars = useMemo((): CSSProperties | undefined => {
    const p = whiteLabel?.primaryColor?.trim();
    const s = whiteLabel?.secondaryColor?.trim();
    if (!p && !s) return undefined;
    return {
      ...(p ? ({ "--brand-primary": p } as CSSProperties) : {}),
      ...(s ? ({ "--brand-secondary": s } as CSSProperties) : {}),
    };
  }, [whiteLabel?.primaryColor, whiteLabel?.secondaryColor]);

  const logoUsesWhiteLabelColor = Boolean(whiteLabel?.primaryColor?.trim());

  return (
    <div
      className="flex min-h-screen min-h-[100dvh] flex-col bg-background text-foreground antialiased selection:bg-[#EDE0D4]/80 selection:text-foreground"
      style={brandCssVars}
    >
        <header className="sticky top-0 z-30 border-b border-[#111827]/10 bg-[#F9F6F0]/96 shadow-[0_1px_0_0_rgba(17,24,39,0.06),0_18px_48px_-28px_rgba(17,24,39,0.1)] backdrop-blur-xl supports-[backdrop-filter]:bg-[#F9F6F0]/90">
          <div className="mx-auto flex min-h-[3.5rem] max-w-7xl items-center gap-3 px-5 py-3 sm:h-[3.65rem] sm:gap-4 sm:px-8 sm:py-0">
            <Link
              href="/"
              className={cn(
                "group flex min-w-0 shrink-0 items-center gap-2.5 transition-opacity duration-200 hover:opacity-92",
                !logoUsesWhiteLabelColor && "text-[#111827]",
              )}
              style={logoUsesWhiteLabelColor && whiteLabel ? { color: whiteLabel.primaryColor } : undefined}
            >
              {whiteLabel?.logoUrl?.trim() ? (
                <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-[var(--card-radius)] border border-[#111827]/12 bg-card shadow-soft ring-1 ring-black/[0.04] transition-transform duration-200 ease-out group-hover:scale-[1.02]">
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
                <AgentForgeLogoMark className="h-8 w-8 shrink-0 text-[#111827] transition-transform duration-200 ease-out group-hover:scale-[1.03]" />
              )}
              <HeaderBrandTitle whiteLabel={whiteLabel} />
            </Link>

            {!guestMode && <DesktopMainNav links={navLinks} />}

            <div
              className={cn(
                "flex shrink-0 items-center gap-2 sm:gap-3",
                !guestMode && "md:ml-auto",
                guestMode && "ml-auto",
              )}
            >
              {guestMode ? (
                <>
                  <span className="max-w-[120px] truncate text-sm font-semibold tracking-tight text-[#111827]">
                    Guest
                  </span>
                  <Button
                    asChild
                    size="sm"
                    className="h-9 shrink-0 rounded-xl bg-[#111827] px-4 text-[13px] font-semibold text-white shadow-sm hover:bg-[#1e293b]"
                  >
                    <Link href="/login?next=/campaigns">Login / Signup</Link>
                  </Button>
                </>
              ) : (
                <>
                  <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
                    <DialogTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 shrink-0 rounded-xl border-[#111827]/14 bg-white/85 shadow-sm hover:bg-white md:hidden"
                        aria-label="Open navigation"
                      >
                        <Menu className="h-[18px] w-[18px] text-[#111827]" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-sm border-border/50 p-0 sm:max-w-md">
                      <DialogHeader className="border-b border-border/40 bg-[#F9F6F0]/80 px-4 py-4">
                        <DialogTitle className="text-left text-[15px] font-semibold tracking-tight text-[#111827]">
                          Navigation
                        </DialogTitle>
                      </DialogHeader>
                      <nav className="px-3 py-4" aria-label="Mobile main">
                        <NavLinkListMobile links={navLinks} onNavigate={() => setMobileOpen(false)} />
                      </nav>
                    </DialogContent>
                  </Dialog>

                  <HeaderInboxButton />
                  <span
                    className="hidden max-w-[160px] truncate text-right text-sm font-semibold tracking-tight text-[#111827] lg:block"
                    title={userName}
                  >
                    {userName}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0 rounded-xl border-[#111827]/14 bg-white/85 shadow-sm hover:bg-white lg:hidden"
                    onClick={handleSignOut}
                    disabled={pending}
                    aria-label={email ? `Sign out (${email})` : "Sign out"}
                  >
                    <LogOut className="h-[18px] w-[18px] text-[#111827]" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="hidden h-9 shrink-0 rounded-xl border-[#111827]/14 bg-white/85 px-3 text-[13px] font-semibold shadow-sm hover:bg-white lg:inline-flex"
                    onClick={handleSignOut}
                    disabled={pending}
                    aria-label={email ? `Sign out (${email})` : "Sign out"}
                  >
                    <LogOut className="mr-1.5 h-3.5 w-3.5" />
                    Sign out
                  </Button>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 bg-transparent px-5 py-9 sm:px-8 sm:py-10">
          <ReplyIntelProvider>{children}</ReplyIntelProvider>
        </main>
        {!hideShellFooter && (
          <footer
            className="mt-auto border-t border-border/35 bg-gradient-to-t from-muted/25 via-transparent to-transparent [border-top-color:color-mix(in_srgb,var(--brand-primary,transparent)_5%,hsl(var(--border)))]"
            role="contentinfo"
          >
            <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8">
              <p className="text-center text-[11px] leading-relaxed tracking-wide text-muted-foreground/90">
                <span className="font-medium text-foreground/85">{brandLabel}</span>
                <span className="mx-2 inline-block h-0.5 w-0.5 rounded-full bg-border align-middle opacity-70" aria-hidden />
                <span className="text-muted-foreground/80">Campaign intelligence workspace</span>
              </p>
            </div>
          </footer>
        )}
    </div>
  );
}
