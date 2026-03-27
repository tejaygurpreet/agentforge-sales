import "server-only";

import { createServiceRoleSupabase } from "@/lib/supabase-server";
import { fetchLivingObjectionLibraryPromptBlock } from "@/lib/objection-library";

/**
 * Prompt 83 — living objection library context for qualification (and re-used by nurture).
 */
export async function loadLivingObjectionContextForWorkspace(
  workspaceId: string,
): Promise<string> {
  const sb = createServiceRoleSupabase();
  return fetchLivingObjectionLibraryPromptBlock(sb, workspaceId);
}
