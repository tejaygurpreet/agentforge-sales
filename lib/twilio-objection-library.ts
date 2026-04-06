import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ensurePersonalWorkspaceMembership, resolveWorkspaceContext } from "@/lib/workspace";
import type { CallTranscriptRow, ObjectionLibraryEntryRow } from "@/types";

/**
 * Prompt 162 — Same workspace-scoped data as dashboard objection library, for `/twilio/objections`.
 */
export async function loadTwilioObjectionLibraryPageData(): Promise<{
  transcripts: CallTranscriptRow[];
  objections: ObjectionLibraryEntryRow[];
}> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { transcripts: [], objections: [] };
  }
  await ensurePersonalWorkspaceMembership(supabase, user.id);
  const ws = await resolveWorkspaceContext(supabase, {
    id: user.id,
    email: user.email ?? null,
  });
  const workspaceId = ws.workspaceId;

  try {
    const [tRes, oRes] = await Promise.all([
      supabase
        .from("call_transcripts")
        .select(
          "id, created_at, thread_id, twilio_call_sid, transcript, sentiment, summary, objections, insights, recording_duration_sec",
        )
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("objection_library")
        .select("id, objection_text, use_count, last_seen_at, normalized_key")
        .eq("workspace_id", workspaceId)
        .order("last_seen_at", { ascending: false })
        .limit(80),
    ]);

    if (tRes.error) {
      console.warn("[AgentForge] twilio_objection_library:call_transcripts", tRes.error.message);
    }
    if (oRes.error) {
      console.warn("[AgentForge] twilio_objection_library:objection_library", oRes.error.message);
    }

    return {
      transcripts: (tRes.data ?? []) as CallTranscriptRow[],
      objections: (oRes.data ?? []) as ObjectionLibraryEntryRow[],
    };
  } catch (e) {
    console.warn("[AgentForge] loadTwilioObjectionLibraryPageData", e);
    return { transcripts: [], objections: [] };
  }
}
