import type { CampaignClientSnapshot } from "@/agents/types";

/**
 * Prompt 100 — high qualification gate for personalized demo script + booking.
 * Stricter than proposal eligibility (48+): requires qualified status or strong score.
 */
export function isPersonalizedDemoEligible(snapshot: CampaignClientSnapshot): boolean {
  if (snapshot.final_status === "failed") return false;
  const score =
    typeof snapshot.qualification_score === "number"
      ? snapshot.qualification_score
      : snapshot.qualification_detail?.score ?? null;
  if (snapshot.lead.status === "qualified") return true;
  if (typeof score === "number" && Number.isFinite(score) && score >= 70) return true;
  return false;
}
