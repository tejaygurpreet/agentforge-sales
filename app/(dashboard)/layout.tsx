import type { DashboardNavLink } from "@/components/dashboard/dashboard-shell";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { fetchWhiteLabelSettings } from "@/lib/white-label";
import { redirect } from "next/navigation";

/** Auth + Supabase use cookies — must not be statically generated (Vercel / Next.js). */
export const dynamic = "force-dynamic";

const DASHBOARD_NAV: DashboardNavLink[] = [
  { href: "/", label: "Dashboard" },
  { href: "/agents", label: "Agents" },
  { href: "/replies", label: "Replies" },
  { href: "/analytics", label: "Analytics" },
];

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

  const wl = await fetchWhiteLabelSettings(supabase, user.id);

  return (
    <DashboardShell
      email={user.email ?? ""}
      displayName={displayName}
      whiteLabel={{
        appName: wl.appName,
        logoUrl: wl.logoUrl,
        primaryColor: wl.primaryColor,
      }}
      navLinks={DASHBOARD_NAV}
    >
      {children}
    </DashboardShell>
  );
}
