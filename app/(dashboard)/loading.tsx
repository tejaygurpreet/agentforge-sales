import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="mx-auto min-h-screen max-w-6xl space-y-10 px-4 py-10 sm:px-6 lg:px-8">
      <div className="space-y-4 border-b border-border/50 pb-10">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <Skeleton className="h-20 max-w-2xl rounded-lg" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
      </div>
      <Card className="border-border/80 shadow-md">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </CardContent>
      </Card>
    </div>
  );
}
