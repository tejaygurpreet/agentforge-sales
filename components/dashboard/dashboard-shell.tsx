"use client";

import { LogOut, Menu } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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

export type DashboardNavLink = { href: string; label: string };

interface DashboardShellProps {
  email: string;
  /** From signup (user_metadata.full_name); optional. */
  displayName?: string;
  /** Prompt 79 — header product name + optional mark. */
  whiteLabel?: {
    appName: string;
    logoUrl: string;
    primaryColor: string;
  };
  /** Prompt 84 — primary nav (desktop + mobile sheet). */
  navLinks: DashboardNavLink[];
  children: React.ReactNode;
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
  return (
    <ul
      className={cn(
        stacked
          ? "flex flex-col gap-1"
          : "flex flex-row flex-wrap items-center gap-1",
      )}
    >
      {links.map((l) => (
        <li key={l.href}>
          <Link
            href={l.href}
            onClick={onNavigate}
            className={cn(
              "block rounded-md text-sm font-medium text-muted-foreground transition-colors duration-200 hover:bg-accent/60 hover:text-foreground",
              stacked ? "px-3 py-2.5" : "px-2.5 py-1.5",
            )}
          >
            {l.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function DashboardShell({
  email,
  displayName,
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

  return (
    <div
      className={cn(
        "dark min-h-screen min-h-[100dvh]",
        "bg-gradient-to-b from-[hsl(222_47%_5.5%)] via-background to-[hsl(222_40%_7%)]",
        "text-foreground antialiased",
      )}
    >
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center justify-between gap-2 px-3 py-2 sm:h-[3.75rem] sm:px-4 sm:py-0">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-6 md:gap-8">
            <span
              className="flex min-w-0 items-center gap-2 text-sm font-semibold tracking-tight text-foreground"
              style={
                whiteLabel?.primaryColor
                  ? { color: whiteLabel.primaryColor }
                  : undefined
              }
            >
              {whiteLabel?.logoUrl?.trim() ? (
                <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded-md bg-background/50">
                  <Image
                    src={whiteLabel.logoUrl.trim()}
                    alt=""
                    width={28}
                    height={28}
                    className="object-contain"
                    unoptimized
                  />
                </span>
              ) : null}
              <span className="truncate">{whiteLabel?.appName?.trim() || DEFAULT_BRAND_DISPLAY_NAME}</span>
            </span>

            <nav className="hidden md:block" aria-label="Main">
              <NavLinkList links={navLinks} stacked={false} />
            </nav>

            <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0 md:hidden"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm border-border/80 p-0 sm:max-w-md">
                <DialogHeader className="border-b border-border/60 px-4 py-3">
                  <DialogTitle className="text-left text-sm font-medium">Menu</DialogTitle>
                </DialogHeader>
                <nav className="px-2 py-3" aria-label="Mobile main">
                  <NavLinkList
                    links={navLinks}
                    stacked
                    onNavigate={() => setMobileOpen(false)}
                  />
                </nav>
              </DialogContent>
            </Dialog>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <span
              className="hidden max-w-[200px] truncate text-xs text-muted-foreground md:inline lg:max-w-[240px]"
              title={email}
            >
              {displayName ? `${displayName} · ${email}` : email}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="border-border/80 shadow-sm transition-all duration-200 hover:border-primary/35 hover:bg-primary/5"
              onClick={handleSignOut}
              disabled={pending}
            >
              <LogOut className="mr-1 h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-3 py-6 sm:px-6 sm:py-10">
        <ReplyIntelProvider>{children}</ReplyIntelProvider>
      </main>
    </div>
  );
}
