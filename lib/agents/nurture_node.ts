import "server-only";

import type { NurtureOutput, QualificationAgentResult } from "@/agents/types";

export {
  loadLivingObjectionContextForWorkspace,
  buildMeetingSchedulingPromptBlock,
  inferLeadTimezoneHint,
  inferResponsePatternFromOutreach,
} from "@/lib/agents/qualification_node";

/** Prompt 89 — keep nurture slots if model omitted them but qual produced structured windows. */
export function mergeQualMeetingIntoNurtureOutput(
  nurture: NurtureOutput,
  qual: QualificationAgentResult | undefined | null,
): NurtureOutput {
  if (nurture.meeting_time_suggestions && nurture.meeting_time_suggestions.length > 0) {
    return nurture;
  }
  const fromQual = qual?.meeting_time_suggestions;
  if (!fromQual?.length) return nurture;
  return { ...nurture, meeting_time_suggestions: fromQual };
}
