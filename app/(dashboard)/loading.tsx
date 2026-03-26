import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Prompt 71 — dashboard route loading skeleton (dark shell matches logged-in layout). */
export default function DashboardLoading() {
  return (
    <div className="dark min-h-screen bg-gradient-to-b from-[hsl(222_47%_5.5%)] via-background to-[hsl(222_40%_7%)]">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:space-y-10 sm:px-6 lg:px-8">
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
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
        <Card className="border-border/60 bg-card/50 shadow-lg">
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
