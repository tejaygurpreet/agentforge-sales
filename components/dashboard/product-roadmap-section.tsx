import { cn } from "@/lib/utils";
import { BarChart3, Layers, Radio } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type ProductRoadmapAnalyticsPreview = {
  campaignCount: number;
  avgCompositeScore: number | null;
  replyAnalyzedCount: number;
};

type Props = {
  analyticsPreview: ProductRoadmapAnalyticsPreview;
};

/**
 * Product roadmap + live analytics snapshot (dashboard). Prompt 58: neutral naming for listing polish.
 */
export function ProductRoadmapSection({ analyticsPreview }: Props) {
  const { campaignCount, avgCompositeScore, replyAnalyzedCount } = analyticsPreview;

  return (
    <section aria-label="Product roadmap" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Product roadmap</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Scale and signal layers on the horizon — your single-lead pipeline and analytics stay fully usable
            today.
          </p>
        </div>
        <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-widest">
          Shipping in waves
        </Badge>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card
          className={cn(
            "premium-card-interactive rounded-xl border-border/70 bg-card/90 shadow-md ring-1 ring-border/15 dark:ring-white/[0.05]",
          )}
        >
          <CardHeader className="space-y-3 pb-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="rounded-lg border border-border/60 bg-muted/40 p-2 text-primary">
                  <Layers className="h-4 w-4" aria-hidden />
                </span>
                <CardTitle className="text-base font-semibold">Batch mode</CardTitle>
              </div>
              <Badge variant="outline" className="shrink-0 border-dashed text-[10px] text-muted-foreground">
                Roadmap
              </Badge>
            </div>
            <CardDescription className="text-xs leading-relaxed">
              Upload CSV or connect a list source to run the research → outreach → qualification → nurture graph
              across many leads with per-row threads and bundled exports.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Queuing, retries, and export packaging are in design — keep using single-lead runs for production
              quality today.
            </p>
          </CardContent>
        </Card>

        <Card
          className={cn(
            "premium-card-interactive rounded-xl border-border/70 bg-card/90 shadow-md ring-1 ring-border/15 dark:ring-white/[0.05]",
          )}
        >
          <CardHeader className="space-y-3 pb-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="rounded-lg border border-border/60 bg-muted/40 p-2 text-primary">
                  <Radio className="h-4 w-4" aria-hidden />
                </span>
                <CardTitle className="text-base font-semibold">Signals</CardTitle>
              </div>
              <Badge
                variant="secondary"
                className="shrink-0 bg-amber-500/12 text-[10px] text-amber-950 dark:text-amber-100"
              >
                In progress
              </Badge>
            </div>
            <CardDescription className="text-xs leading-relaxed">
              Intent, job-change, and stack signals as weighted inputs to research — composes with optional live
              web digest already available in the product.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Adapter contracts are being defined; core graph outputs remain unchanged while we wire providers.
            </p>
          </CardContent>
        </Card>

        <Card
          className={cn(
            "premium-card-interactive rounded-xl border-border/70 bg-card/90 shadow-md ring-1 ring-emerald-500/15 dark:ring-emerald-500/10",
          )}
        >
          <CardHeader className="space-y-3 pb-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 p-2 text-emerald-700 dark:text-emerald-400">
                  <BarChart3 className="h-4 w-4" aria-hidden />
                </span>
                <CardTitle className="text-base font-semibold">Analytics</CardTitle>
              </div>
              <Badge className="shrink-0 border-emerald-600/30 bg-emerald-600/15 text-[10px] text-emerald-950 dark:text-emerald-100">
                Live
              </Badge>
            </div>
            <CardDescription className="text-xs leading-relaxed">
              Workspace rollups from saved campaigns and prospect reply analyses — open the full page for
              distribution charts and averages.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div className="grid grid-cols-3 gap-2 rounded-lg border border-border/50 bg-muted/20 px-2 py-3 text-center">
              <div>
                <p className="text-xl font-bold tabular-nums leading-none text-foreground">{campaignCount}</p>
                <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Campaigns
                </p>
              </div>
              <div>
                <p className="text-xl font-bold tabular-nums leading-none text-foreground">
                  {avgCompositeScore != null ? `${avgCompositeScore}` : "—"}
                </p>
                <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Avg score
                </p>
              </div>
              <div>
                <p className="text-xl font-bold tabular-nums leading-none text-foreground">
                  {replyAnalyzedCount}
                </p>
                <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Reply analyses
                </p>
              </div>
            </div>
            <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
              <Link href="/analytics">Open analytics</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
