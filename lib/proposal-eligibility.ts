import type { CampaignClientSnapshot } from "@/agents/types";

/** Prompt 98 — client + server: when the proposal generator is allowed (mirrors `lib/proposal-generator`). */
export function isProposalEligible(snapshot: CampaignClientSnapshot): boolean {
  if (snapshot.final_status === "failed") return false;
  const qNode = snapshot.results?.qualification_node as { next_best_action?: string } | undefined;
  const nbaFromNode = typeof qNode?.next_best_action === "string" ? qNode.next_best_action.trim() : "";
  const nba = snapshot.qualification_detail?.next_best_action?.trim() || nbaFromNode;
  const score =
    typeof snapshot.qualification_score === "number"
      ? snapshot.qualification_score
      : snapshot.qualification_detail?.score ?? null;
  if (snapshot.lead.status === "qualified") return true;
  if (nba.length >= 12) return true;
  if (typeof score === "number" && Number.isFinite(score) && score >= 48) return true;
  return false;
}
