import { getDashboardAnalytics } from "@/app/(dashboard)/actions";
import { AnalyticsDashboard } from "@/components/dashboard/analytics-dashboard";

export default async function AnalyticsPage() {
  const data = await getDashboardAnalytics();
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <AnalyticsDashboard data={data} />
    </div>
  );
}
