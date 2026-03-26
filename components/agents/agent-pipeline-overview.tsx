import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const nodes = [
  {
    name: "Research",
    detail:
      "Deep structured research: ICP score, industry, BANT, tech stack hints, key stakeholders, pains, and angles.",
  },
  {
    name: "Outreach",
    detail:
      "Personalized subject, HTML email body, LinkedIn DM, hooks, and CTA strategy as validated JSON.",
  },
  {
    name: "Qualification",
    detail:
      "BANT summary, 0–100 score, three objections, and next-best action with conditional routing.",
  },
  {
    name: "Nurture",
    detail:
      "Three-step cadence with day offsets, channels, value-add ideas, assets, and timing rationale.",
  },
];

export function AgentPipelineOverview() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {nodes.map((n) => (
        <Card key={n.name}>
          <CardHeader>
            <CardTitle className="text-base">{n.name}</CardTitle>
            <CardDescription>{n.detail}</CardDescription>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Implemented in{" "}
            <code className="rounded bg-muted px-1 py-0.5">agents/</code> with
            LangGraph conditional edges in{" "}
            <code className="rounded bg-muted px-1 py-0.5">graph.ts</code>.
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
