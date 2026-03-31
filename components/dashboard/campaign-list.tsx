import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CampaignThreadRow, LeadPriorityTier } from "@/types";
import { Percent } from "lucide-react";

function tierOutlineClass(tier: LeadPriorityTier | null | undefined): string | undefined {
  if (!tier) return undefined;
  switch (tier) {
    case "critical":
      return "border-rose-500/45 bg-rose-500/[0.1] text-rose-950 dark:border-rose-400/40 dark:bg-rose-500/15 dark:text-rose-50";
    case "high":
      return "border-amber-500/45 bg-amber-500/[0.1] text-amber-950 dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-50";
    case "medium":
      return "border-sky-500/40 bg-sky-500/[0.1] text-sky-950 dark:border-sky-400/40 dark:bg-sky-500/14 dark:text-sky-50";
    default:
      return "border-muted-foreground/30 bg-muted/30 text-muted-foreground";
  }
}

interface CampaignListProps {
  campaigns: CampaignThreadRow[];
}

export function CampaignList({ campaigns }: CampaignListProps) {
  return (
    <Card className="premium-card-interactive rounded-2xl border-border/80 bg-card/95 shadow-lg ring-1 ring-border/20 dark:ring-white/[0.06]">
      <CardHeader>
        <CardTitle>Active campaigns</CardTitle>
        <CardDescription>
          Recent threads from <code className="text-xs">agent_graph_checkpoints</code>{" "}
          (one row per <span className="font-mono text-xs">user_id + lead id</span>). When a thread
          matches a scored run in <code className="text-xs">campaigns</code>, priority badges show
          suggested contact order.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {campaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No runs yet. Start a campaign below.
          </p>
        ) : (
          <ul className="space-y-3">
            {campaigns.map((c) => (
              <li
                key={c.thread_id}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border border-border/50 bg-muted/25 px-3 py-2 text-sm transition-colors duration-200",
                  "sm:flex-row sm:items-center sm:justify-between",
                  "hover:border-border hover:bg-muted/40",
                )}
              >
                <div>
                  <p className="font-medium">
                    {c.lead_preview ?? "Lead"}{" "}
                    <span className="text-muted-foreground">
                      @ {c.company_preview ?? "—"}
                    </span>
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {c.thread_id}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {c.lead_priority_score != null && c.lead_priority_tier ? (
                    <Badge
                      variant="outline"
                      className={cn(
                        "px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        tierOutlineClass(c.lead_priority_tier),
                      )}
                      title="Smart lead priority (workspace leaderboard)"
                    >
                      Prio {c.lead_priority_score}
                    </Badge>
                  ) : null}
                  {c.deal_close_probability != null ? (
                    <Badge
                      variant="outline"
                      className="gap-0.5 border-teal-500/40 bg-teal-500/[0.12] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-teal-950 dark:border-teal-400/40 dark:bg-teal-500/16 dark:text-teal-50"
                      title={
                        c.deal_confidence
                          ? `Deal close estimate · ${c.deal_confidence} confidence`
                          : "Deal close estimate (Prompt 93)"
                      }
                    >
                      <Percent className="h-3 w-3 opacity-90" aria-hidden />
                      Close {c.deal_close_probability}%
                      {c.deal_confidence ? ` · ${c.deal_confidence}` : ""}
                    </Badge>
                  ) : null}
                  {c.sdr_voice_label ? (
                    <Badge
                      variant="outline"
                      className="border-violet-500/40 bg-violet-500/[0.12] px-2.5 py-0.5 text-xs font-semibold tracking-tight text-violet-950 dark:border-violet-400/40 dark:bg-violet-500/16 dark:text-violet-50"
                      title={`SDR voice: ${c.sdr_voice_label}`}
                    >
                      Voice: {c.sdr_voice_label}
                    </Badge>
                  ) : null}
                  {c.current_agent ? (
                    <Badge variant="outline">{c.current_agent}</Badge>
                  ) : null}
                  {c.outreach_sent ? (
                    <Badge variant="secondary">Email sent</Badge>
                  ) : null}
                  <span className="text-xs text-muted-foreground">
                    {new Date(c.updated_at).toLocaleString()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
