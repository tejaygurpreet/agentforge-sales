import "server-only";

import type { CampaignClientSnapshot, Lead } from "@/agents/types";
import { getServiceRoleSupabaseOrNull } from "@/lib/supabase-server";

export interface SaveCampaignParams {
  userId: string;
  threadId: string;
  lead: Lead;
  snapshot: CampaignClientSnapshot;
}

/**
 * Persists a campaign run to `public.campaigns` using the service role.
 * Uses upsert on `thread_id` so a second save for the same run is idempotent.
 */
export async function saveCampaign(params: SaveCampaignParams): Promise<void> {
  const sb = getServiceRoleSupabaseOrNull();
  if (!sb) {
    console.warn("[AgentForge] saveCampaign skipped — SUPABASE_SERVICE_ROLE_KEY missing");
    return;
  }

  const { snapshot, userId, threadId, lead } = params;
  const completedAt = snapshot.campaign_completed_at ?? null;

  let resultsJson: Record<string, unknown>;
  try {
    resultsJson = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;
  } catch {
    console.error("[AgentForge] saveCampaign: could not serialize snapshot");
    return;
  }

  const row = {
    user_id: userId,
    thread_id: threadId,
    lead_name: lead.name,
    company: lead.company,
    email: lead.email,
    status: snapshot.final_status,
    completed_at: completedAt,
    results: resultsJson,
  };

  const { error } = await sb.from("campaigns").upsert(row, {
    onConflict: "thread_id",
  });

  if (error) {
    console.error(
      "[AgentForge] saveCampaign",
      error.message,
      error.code,
      error.details,
    );
  }
}
