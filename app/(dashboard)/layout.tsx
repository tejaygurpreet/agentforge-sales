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

  let displayName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim()
      : "";

  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profileError && profileRow?.full_name?.trim()) {
    displayName = profileRow.full_name.trim();
  }

  return (
    <DashboardShell
      email={user.email ?? ""}
      displayName={displayName}
      nav={
        <nav className="flex flex-wrap items-center gap-1 text-sm font-medium sm:gap-2">
          <Link
            href="/"
            className="rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors duration-200 hover:bg-accent/60 hover:text-foreground"
          >
            Dashboard
          </Link>
          <Link
            href="/agents"
            className="rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors duration-200 hover:bg-accent/60 hover:text-foreground"
          >
            Agents
          </Link>
          <Link
            href="/replies"
            className="rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors duration-200 hover:bg-accent/60 hover:text-foreground"
          >
            Replies
          </Link>
          <Link
            href="/analytics"
            className="rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors duration-200 hover:bg-accent/60 hover:text-foreground"
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
