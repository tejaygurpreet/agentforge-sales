import { getDashboardAnalytics } from "@/app/(dashboard)/actions";
import { AnalyticsDashboard } from "@/components/dashboard/analytics-dashboard";

export default async function AnalyticsPage() {
  const data = await getDashboardAnalytics();
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500 sm:px-6 sm:py-10 lg:px-8">
      <AnalyticsDashboard data={data} />
    </div>
  );
}
