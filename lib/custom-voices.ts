import "server-only";

import type { CustomVoiceProfile } from "@/agents/types";
import { createServerSupabaseClient } from "@/lib/supabase-server";

/** Load a user's custom voice row for LangGraph injection (Prompt 78). */
export async function fetchCustomVoiceProfileForUser(
  userId: string,
  voiceId: string,
): Promise<CustomVoiceProfile | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("custom_voices")
    .select("id, name, description, examples, tone_instructions")
    .eq("id", voiceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.warn("[AgentForge] fetchCustomVoiceProfileForUser", error.message);
    }
    return null;
  }

  const raw = data.examples;
  const examples = Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [];

  return {
    id: data.id,
    name: data.name,
    description: data.description,
    tone_instructions: data.tone_instructions,
    examples,
  };
}
