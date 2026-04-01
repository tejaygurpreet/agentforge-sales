import { listProspectReplies } from "@/app/(dashboard)/actions";
import { DashboardReplyStrip } from "@/components/dashboard/dashboard-reply-strip";
import { RepliesDashboard } from "@/components/dashboard/replies-dashboard";

/** Prompt 136 — Prospect reply analyzer lives here (removed from dashboard campaign workspace). */
export default async function RepliesPage() {
  const rows = await listProspectReplies();
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500 sm:px-6 sm:py-10 lg:px-8">
      <div className="space-y-10">
        <DashboardReplyStrip />
        <RepliesDashboard rows={rows} />
      </div>
    </div>
  );
}
