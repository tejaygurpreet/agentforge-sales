import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_CHARS = 4_000;

function normalizeObjectionKey(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 240);
}

/**
 * Prompt 83 — compact text block for qualification/nurture prompts from `objection_library`.
 */
export async function fetchLivingObjectionLibraryPromptBlock(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<string> {
  const ws = workspaceId.trim();
  if (!ws) {
    return "(no living objection library yet — transcribe outbound calls to grow this.)";
  }
  const { data, error } = await supabase
    .from("objection_library")
    .select("objection_text, use_count, last_seen_at")
    .eq("workspace_id", ws)
    .order("last_seen_at", { ascending: false })
    .limit(40);

  if (error) {
    console.warn("[AgentForge] objection_library:read_failed", error.message);
    return "(living objection library unavailable — continue without it.)";
  }
  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) {
    return "(no objections logged yet from transcribed calls — infer from lead + research only.)";
  }
  const lines = rows.map((r) => {
    const t =
      typeof (r as { objection_text?: unknown }).objection_text === "string"
        ? (r as { objection_text: string }).objection_text
        : "";
    const c = (r as { use_count?: unknown }).use_count;
    const count = typeof c === "number" ? c : 1;
    return `- (${count}×) ${t}`;
  });
  let blob = lines.join("\n");
  if (blob.length > MAX_CHARS) {
    blob = `${blob.slice(0, MAX_CHARS)}…`;
  }
  return `LIVING_OBJECTION_LIBRARY (real phrases from this workspace's transcribed calls — address patterns, don't quote verbatim):\n${blob}`;
}

/**
 * Prompt 83 — upserts rows in `objection_library` after a transcript is saved.
 */
export async function mergeObjectionsIntoLibrary(
  supabase: SupabaseClient,
  workspaceId: string,
  transcriptId: string,
  objections: string[],
): Promise<void> {
  const ws = workspaceId.trim();
  if (!ws || objections.length === 0) return;

  const now = new Date().toISOString();
  for (const raw of objections) {
    const objection_text = typeof raw === "string" ? raw.trim() : "";
    if (!objection_text) continue;
    const normalized_key = normalizeObjectionKey(objection_text);
    if (!normalized_key) continue;

    const { data: existing } = await supabase
      .from("objection_library")
      .select("id, use_count")
      .eq("workspace_id", ws)
      .eq("normalized_key", normalized_key)
      .maybeSingle();

    if (existing && typeof (existing as { id?: string }).id === "string") {
      const prev = (existing as { use_count?: number }).use_count ?? 1;
      await supabase
        .from("objection_library")
        .update({
          use_count: prev + 1,
          last_seen_at: now,
          objection_text,
          source_transcript_id: transcriptId,
        })
        .eq("id", (existing as { id: string }).id);
    } else {
      await supabase.from("objection_library").insert({
        workspace_id: ws,
        objection_text,
        normalized_key,
        source_transcript_id: transcriptId,
        use_count: 1,
        last_seen_at: now,
      });
    }
  }
}
