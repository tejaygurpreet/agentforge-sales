"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ReplyIntelProvider } from "@/components/dashboard/reply-intel-context";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface DashboardShellProps {
  email: string;
  /** From signup (user_metadata.full_name); optional. */
  displayName?: string;
  nav: React.ReactNode;
  children: React.ReactNode;
}

export function DashboardShell({ email, displayName, nav, children }: DashboardShellProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

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
        "dark min-h-screen",
        "bg-gradient-to-b from-[hsl(222_47%_5.5%)] via-background to-[hsl(222_40%_7%)]",
        "text-foreground antialiased",
      )}
    >
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:h-[3.75rem]">
          <div className="flex items-center gap-6 sm:gap-8">
            <span className="text-sm font-semibold tracking-tight text-foreground">
              AgentForge Sales
            </span>
            {nav}
          </div>
          <div className="flex items-center gap-3">
            <span
              className="hidden max-w-[240px] truncate text-xs text-muted-foreground sm:inline"
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
              <LogOut className="mr-1 h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <ReplyIntelProvider>{children}</ReplyIntelProvider>
      </main>
    </div>
  );
}
