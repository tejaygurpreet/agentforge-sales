"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ReplyIntelProvider } from "@/components/dashboard/reply-intel-context";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase";

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
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-8">
            <span className="text-sm font-semibold tracking-tight">
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
              onClick={handleSignOut}
              disabled={pending}
            >
              <LogOut className="mr-1 h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <ReplyIntelProvider>{children}</ReplyIntelProvider>
      </main>
    </div>
  );
}
