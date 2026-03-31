import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Prompt 113–114 — dashboard route loading: light canvas + shimmer skeletons (matches signed-in shell). */
export default function DashboardLoading() {
  return (
    <div className="ux-loading-canvas animate-in fade-in duration-300">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 motion-safe:animate-content-settle sm:space-y-10 sm:px-6 lg:px-8">
        <div className="space-y-4">
          <Skeleton className="h-11 w-72 rounded-xl" />
          <Skeleton className="h-4 w-full max-w-xl rounded-md" />
          <div className="flex flex-wrap gap-2 pt-2">
            <Skeleton className="h-7 w-28 rounded-full" />
            <Skeleton className="h-7 w-36 rounded-full" />
            <Skeleton className="h-7 w-32 rounded-full" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-36 rounded-2xl shadow-sm ring-1 ring-border/30" />
          <Skeleton className="h-36 rounded-2xl shadow-sm ring-1 ring-border/30" />
          <Skeleton className="h-36 rounded-2xl shadow-sm ring-1 ring-border/30" />
          <Skeleton className="h-36 rounded-2xl shadow-sm ring-1 ring-border/30" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-48 rounded-2xl shadow-sm ring-1 ring-border/30" />
          <Skeleton className="h-48 rounded-2xl shadow-sm ring-1 ring-border/30" />
        </div>
        <Card className="border-border/55 bg-card/80 shadow-soft ring-1 ring-black/[0.03]">
          <CardHeader className="space-y-2">
            <Skeleton className="h-6 w-56 rounded-md" />
            <Skeleton className="h-4 w-full max-w-2xl rounded-md" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
