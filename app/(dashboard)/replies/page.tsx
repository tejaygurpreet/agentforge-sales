import { listProspectReplies } from "@/app/(dashboard)/actions";
import { RepliesDashboard } from "@/components/dashboard/replies-dashboard";

export default async function RepliesPage() {
  const rows = await listProspectReplies();
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <RepliesDashboard rows={rows} />
    </div>
  );
}
