import { DashboardMotionShell } from "@/components/dashboard/dashboard-motion-shell";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { InboxUnreadProvider } from "@/components/dashboard/inbox-unread-context";

/**
 * Prompt 177 — Marketing homepage: guest header only (logo, Guest, Login/Signup), no main nav links.
 */
export default function HomepageLayout({ children }: { children: React.ReactNode }) {
  return (
    <InboxUnreadProvider initialCount={0} initialDraftCount={0}>
      <DashboardShell
        guestMode
        hideShellFooter
        email=""
        displayName="Guest"
        navLinks={[]}
      >
        <DashboardMotionShell>{children}</DashboardMotionShell>
      </DashboardShell>
    </InboxUnreadProvider>
  );
}
