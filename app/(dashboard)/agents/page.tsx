import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AgentPipelineOverview } from "@/components/agents/agent-pipeline-overview";
import { Button } from "@/components/ui/button";

export default function AgentsPage() {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Dashboard
          </Link>
        </Button>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
        <p className="text-sm text-muted-foreground">
          Orchestration graph, tools, and observability hooks.
        </p>
      </div>
      <AgentPipelineOverview />
    </div>
  );
}
