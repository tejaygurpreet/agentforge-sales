import "server-only";

import type { CampaignLiveSignal } from "@/agents/types";
import { getServiceRoleSupabaseOrNull } from "@/lib/supabase-server";

/**
 * Persists live signals after research (Prompt 70). Uses service role when available
 * so inserts succeed even if JWT policies are strict; logs and no-ops on failure.
 */
export async function persistCampaignSignalsToSupabase(params: {
  userId: string;
  threadId: string;
  signals: CampaignLiveSignal[];
}): Promise<void> {
  const { userId, threadId, signals } = params;
  if (!signals.length) return;
  const sb = getServiceRoleSupabaseOrNull();
  if (!sb) {
    console.warn("[AgentForge] persistCampaignSignals skipped — SUPABASE_SERVICE_ROLE_KEY missing");
    return;
  }
  const rows = signals.map((s) => ({
    user_id: userId,
    thread_id: threadId,
    signal_type: s.signal_type,
    signal_text: s.signal_text.slice(0, 4_000),
    created_at: s.captured_at,
  }));
  const { error } = await sb.from("campaign_signals").insert(rows);
  if (error) {
    console.error(
      "[AgentForge] campaign_signals insert",
      error.message,
      error.code,
      error.details,
    );
  }
}
