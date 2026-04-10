import type { Metadata } from "next";
import { headers } from "next/headers";
import { getInboxDraftCountAction, getInboxUnreadCountAction } from "@/app/(dashboard)/actions";
import { DashboardMotionShell } from "@/components/dashboard/dashboard-motion-shell";
import type { DashboardNavLink } from "@/components/dashboard/dashboard-shell";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { InboxUnreadProvider } from "@/components/dashboard/inbox-unread-context";
import { DEFAULT_BRAND_DISPLAY_NAME } from "@/lib/brand-prompt";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { fetchWhiteLabelSettings } from "@/lib/white-label";
import { redirect } from "next/navigation";

/** Auth + Supabase use cookies — must not be statically generated (Vercel / Next.js). */
export const dynamic = "force-dynamic";

/** Prompt 112 — Browser tab / PWA title follows white-label `app_name` when set. */
export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      title: { default: "Dashboard", template: `%s · ${DEFAULT_BRAND_DISPLAY_NAME}` },
    };
  }
  const wl = await fetchWhiteLabelSettings(supabase, user.id);
  const name = wl.appName?.trim() || DEFAULT_BRAND_DISPLAY_NAME;
  return {
    title: {
      default: name,
      template: `%s · ${name}`,
    },
    description: `${name} — campaign intelligence workspace`,
    applicationName: name,
    appleWebApp: { title: name, statusBarStyle: "default" },
  };
}

/** Prompt 177 — `(dashboard)` routes require auth; marketing lives at `/homepage` with its own layout. */
/** Prompt 171 — No separate "Campaigns" nav item (workspace reachable from Dashboard). */
const DASHBOARD_NAV: DashboardNavLink[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/setup", label: "Setup" },
  { href: "/replies", label: "Replies" },
  { href: "/analytics", label: "Analytics" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect(`/login?next=${encodeURIComponent(pathname || "/dashboard")}`);
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
  const [initialInboxUnreadCount, initialDraftCount] = await Promise.all([
    getInboxUnreadCountAction(),
    getInboxDraftCountAction(),
  ]);

  return (
    <InboxUnreadProvider
      initialCount={initialInboxUnreadCount}
      initialDraftCount={initialDraftCount}
    >
      <DashboardShell
        email={user.email ?? ""}
        displayName={displayName}
        whiteLabel={{
          appName: wl.appName,
          logoUrl: wl.logoUrl,
          primaryColor: wl.primaryColor,
          secondaryColor: wl.secondaryColor,
        }}
        navLinks={DASHBOARD_NAV}
      >
        <DashboardMotionShell>{children}</DashboardMotionShell>
      </DashboardShell>
    </InboxUnreadProvider>
  );
}
