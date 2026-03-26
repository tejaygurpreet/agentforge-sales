import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CampaignThreadRow } from "@/types";

interface CampaignListProps {
  campaigns: CampaignThreadRow[];
}

export function CampaignList({ campaigns }: CampaignListProps) {
  return (
    <Card className="rounded-2xl border-border/80 bg-card/95 shadow-lg ring-1 ring-border/20 transition-all duration-300 hover:shadow-xl dark:ring-white/[0.06]">
      <CardHeader>
        <CardTitle>Active campaigns</CardTitle>
        <CardDescription>
          Recent threads from <code className="text-xs">agent_graph_checkpoints</code>{" "}
          (one row per <span className="font-mono text-xs">user_id + lead id</span>).
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
                className="flex flex-col gap-1 rounded-lg border bg-muted/30 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
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
