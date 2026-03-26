import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { createServerSupabaseClient } from "@/lib/supabase-server";

/** Auth + Supabase use cookies — must not be statically generated (Vercel / Next.js). */
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return (
    <DashboardShell
      email={user.email ?? ""}
      nav={
        <nav className="flex items-center gap-4 text-sm font-medium">
          <Link href="/" className="text-muted-foreground hover:text-foreground">
            Dashboard
          </Link>
          <Link
            href="/agents"
            className="text-muted-foreground hover:text-foreground"
          >
            Agents
          </Link>
          <Link
            href="/replies"
            className="text-muted-foreground hover:text-foreground"
          >
            Replies
          </Link>
          <Link
            href="/analytics"
            className="text-muted-foreground hover:text-foreground"
          >
            Analytics
          </Link>
        </nav>
      }
    >
      {children}
    </DashboardShell>
  );
}
