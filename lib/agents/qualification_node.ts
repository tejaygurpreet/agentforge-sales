import "server-only";

import type { Lead, ResearchOutput } from "@/agents/types";
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

/** Prompt 89 — coarse region hint for scheduling (not a geolocation guarantee). */
export function inferLeadTimezoneHint(lead: Lead, research?: ResearchOutput | null): string {
  const email = lead.email?.toLowerCase() ?? "";
  const company = `${lead.company ?? ""} ${lead.notes ?? ""}`.toLowerCase();
  if (/\.(co\.uk|uk)\b/.test(email) || /\b(london|manchester|uk|united kingdom)\b/.test(company)) {
    return "Europe/London — prefer 09:00–17:00 local for buyer-facing slots.";
  }
  if (/\.(de|fr|nl|eu|ie)\b/.test(email) || /\b(berlin|paris|amsterdam|dublin)\b/.test(company)) {
    return "EU business hours — stagger vs US rep mornings.";
  }
  if (/\.(com\.au|nz|jp|in|sg|hk)\b/.test(email) || /\b(sydney|tokyo|singapore|mumbai)\b/.test(company)) {
    return "APAC — use early local morning or late US evening; confirm on reply.";
  }
  return "Americas default (America/New_York style) — confirm actual locale on live reply.";
}

export function inferResponsePatternFromOutreach(emailBodyExcerpt?: string | null): string {
  const body = (emailBodyExcerpt ?? "").slice(0, 2500);
  if (/\basync|when you have a moment|no rush|at your pace\b/i.test(body)) return "async_heavy";
  if (/\b(morning|8\s*(:|\.)?00|9\s*(:|\.)?00|10\s*(:|\.)?00|before noon)\b/i.test(body)) {
    return "morning_preferred";
  }
  if (/\b(afternoon|3\s*(:|\.)?00|4\s*(:|\.)?00|later in the day)\b/i.test(body)) {
    return "evening_ok";
  }
  return "unknown";
}

/**
 * Prompt 89 — injected into qualification (and referenced in nurture) for smart meeting windows.
 */
export function buildMeetingSchedulingPromptBlock(
  lead: Lead,
  research?: ResearchOutput | null,
  outreachEmailExcerpt?: string | null,
): string {
  const tz = inferLeadTimezoneHint(lead, research);
  const pattern = inferResponsePatternFromOutreach(outreachEmailExcerpt ?? undefined);
  const region = research?.industry_inference?.slice(0, 120) ?? "";
  return `=== MEETING_SCHEDULING_CONTEXT (Prompt 89) ===
Lead timezone / region hint: ${tz}${region ? `\nResearch industry context (non-authoritative): ${region}` : ""}
Inferred cadence from outreach excerpt: ${pattern}
Add **optional** JSON keys:
- "meeting_time_suggestions": 2–4 objects with label, start_iso, end_iso (UTC ISO8601), timezone_hint (IANA-style label), rationale (≤220 chars). Each window **45 minutes**, **weekdays**, **business hours**, on **at least two different calendar days**, respecting the timezone hint and cadence.
- "response_pattern_hint": one of morning_preferred | async_heavy | evening_ok | unknown (may match ${pattern}).
Omit these keys entirely if scheduling is premature.`;
}
