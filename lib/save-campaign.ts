import "server-only";

import type { CampaignClientSnapshot, Lead, LeadEnrichmentPayload } from "@/agents/types";
import {
  aggregateObjectionsForPersistence,
  computeDisplayQualificationScore,
} from "@/lib/agents/qualification_node";
import {
  deriveFollowUpApprovalStatus,
  nextFollowUpSendIso,
} from "@/lib/agents/nurture_node";
import { computeForecastFromSnapshot } from "@/lib/forecast";
import { scoreLeadForPriority } from "@/lib/scoring";
import { notifyCampaignCompletedPush } from "@/lib/push";
import { getServiceRoleSupabaseOrNull } from "@/lib/supabase-server";

/** Shallow copy of upsert row without listed keys (schema fallback retries). */
function omitCampaignUpsertFields(
  row: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const out = { ...row };
  for (const k of keys) {
    delete out[k];
  }
  return out;
}

export interface SaveCampaignParams {
  userId: string;
  threadId: string;
  lead: Lead;
  snapshot: CampaignClientSnapshot;
  /** Prompt 80 — optional inbox health + status on `campaigns` row when columns exist. */
  deliverability?: {
    spam_score: number;
    deliverability_status: string;
  };
  /** Prompt 85 — A/B experiment grouping (optional). */
  abTestId?: string | null;
  abVariant?: "A" | "B" | null;
  templateId?: string | null;
  abVoiceNote?: string | null;
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

  const { snapshot, userId, threadId, lead, deliverability } = params;
  const abTestId = params.abTestId?.trim() || null;
  const abVariant = params.abVariant ?? null;
  const templateId = params.templateId?.trim() || null;
  const abVoiceNote = params.abVoiceNote?.trim()?.slice(0, 800) || null;
  const completedAt = snapshot.campaign_completed_at ?? null;

  let resultsJson: Record<string, unknown>;
  try {
    resultsJson = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;
  } catch {
    console.error("[AgentForge] saveCampaign: could not serialize snapshot");
    return;
  }

  const enriched =
    (snapshot.lead_enrichment_preview as LeadEnrichmentPayload | null | undefined) ??
    null;

  const fc = computeForecastFromSnapshot(snapshot);
  const fu = snapshot.smart_follow_up_engine;
  const followUpSnapshot =
    fu != null
      ? (JSON.parse(JSON.stringify(fu)) as Record<string, unknown>)
      : null;
  const followUpApproval =
    fu != null ? deriveFollowUpApprovalStatus(fu.steps) : null;
  const followUpNextAt = fu != null ? nextFollowUpSendIso(fu.steps) : null;

  const leadScoringRow =
    snapshot.final_status !== "failed"
      ? (() => {
          const sc = scoreLeadForPriority(snapshot, { replyInterest0to10: null });
          return {
            lead_score: {
              icp_fit: sc.dimensions.icp_fit,
              intent_signals: sc.dimensions.intent_signals,
              reply_probability: sc.dimensions.reply_probability,
              deal_value_potential: sc.dimensions.deal_value_potential,
              composite: sc.composite,
              tier: sc.tier,
            },
            priority_reason: sc.priority_reason.slice(0, 2400),
          };
        })()
      : null;

  const qualDisplay = computeDisplayQualificationScore(snapshot, null);
  const objectionRows = aggregateObjectionsForPersistence(snapshot);
  const qualScoreToStore =
    qualDisplay.refined ??
    qualDisplay.base ??
    (typeof snapshot.qualification_score === "number" ? snapshot.qualification_score : null) ??
    snapshot.qualification_detail?.score ??
    null;
  const qualificationPatch: Record<string, unknown> = {};
  if (snapshot.final_status !== "failed") {
    if (qualScoreToStore != null) {
      qualificationPatch.qualification_score = Math.round(
        Math.min(100, Math.max(0, qualScoreToStore)),
      );
    }
    if (objectionRows.length > 0) {
      qualificationPatch.detected_objections = objectionRows;
    }
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
    ...(deliverability
      ? {
          spam_score: Math.max(0, Math.min(100, Math.round(deliverability.spam_score))),
          deliverability_status: deliverability.deliverability_status.slice(0, 32),
        }
      : {}),
    ...(enriched
      ? {
          enriched_data: enriched as unknown as Record<string, unknown>,
        }
      : {}),
    ...(abTestId
      ? {
          ab_test_id: abTestId,
          ab_variant: abVariant,
          ab_voice_note: abVoiceNote,
        }
      : {}),
    ...(templateId ? { template_id: templateId } : {}),
    predicted_revenue: fc.predictedRevenueUsd,
    win_probability: fc.winProbability,
    ...(followUpSnapshot
      ? {
          follow_up_engine_snapshot: followUpSnapshot,
          follow_up_approval_status: followUpApproval,
          follow_up_next_send_at: followUpNextAt,
        }
      : {}),
    ...(leadScoringRow ?? {}),
    ...(Object.keys(qualificationPatch).length > 0 ? qualificationPatch : {}),
  };

  const rowRecord = row as unknown as Record<string, unknown>;

  let { error } = await sb.from("campaigns").upsert(row, {
    onConflict: "thread_id",
  });

  if (
    error &&
    enriched &&
    /enriched_data|column|schema/i.test(
      `${error.message} ${error.details ?? ""} ${error.hint ?? ""}`,
    )
  ) {
    ({ error } = await sb.from("campaigns").upsert(
      omitCampaignUpsertFields(rowRecord, ["enriched_data"]),
      {
        onConflict: "thread_id",
      },
    ));
  }

  if (
    error &&
    /ab_test_id|ab_variant|template_id|ab_voice_note|column|schema/i.test(
      `${error.message} ${error.details ?? ""} ${error.hint ?? ""}`,
    )
  ) {
    ({ error } = await sb.from("campaigns").upsert(
      omitCampaignUpsertFields(rowRecord, [
        "ab_test_id",
        "ab_variant",
        "template_id",
        "ab_voice_note",
      ]),
      {
        onConflict: "thread_id",
      },
    ));
  }

  if (
    error &&
    /predicted_revenue|win_probability|column|schema/i.test(
      `${error.message} ${error.details ?? ""} ${error.hint ?? ""}`,
    )
  ) {
    ({ error } = await sb.from("campaigns").upsert(
      omitCampaignUpsertFields(rowRecord, ["predicted_revenue", "win_probability"]),
      {
        onConflict: "thread_id",
      },
    ));
  }

  if (
    error &&
    /follow_up_engine_snapshot|follow_up_approval_status|follow_up_next_send_at|column|schema/i.test(
      `${error.message} ${error.details ?? ""} ${error.hint ?? ""}`,
    )
  ) {
    ({ error } = await sb.from("campaigns").upsert(
      omitCampaignUpsertFields(rowRecord, [
        "follow_up_engine_snapshot",
        "follow_up_approval_status",
        "follow_up_next_send_at",
      ]),
      {
        onConflict: "thread_id",
      },
    ));
  }

  if (
    error &&
    /lead_score|priority_reason|column|schema/i.test(
      `${error.message} ${error.details ?? ""} ${error.hint ?? ""}`,
    )
  ) {
    ({ error } = await sb.from("campaigns").upsert(
      omitCampaignUpsertFields(rowRecord, ["lead_score", "priority_reason"]),
      {
        onConflict: "thread_id",
      },
    ));
  }

  if (
    error &&
    /qualification_score|detected_objections|column|schema/i.test(
      `${error.message} ${error.details ?? ""} ${error.hint ?? ""}`,
    )
  ) {
    ({ error } = await sb.from("campaigns").upsert(
      omitCampaignUpsertFields(rowRecord, ["qualification_score", "detected_objections"]),
      {
        onConflict: "thread_id",
      },
    ));
  }

  if (error) {
    console.error(
      "[AgentForge] saveCampaign",
      error.message,
      error.code,
      error.details,
    );
    return;
  }

  const fin = snapshot.final_status;
  if (fin === "completed" || fin === "completed_with_errors") {
    void notifyCampaignCompletedPush(userId, lead.name, threadId).catch(() => {});
  }
}
