import "server-only";

import type { CampaignClientSnapshot, Lead, LeadEnrichmentPayload } from "@/agents/types";
import { computeForecastFromSnapshot } from "@/lib/forecast";
import { notifyCampaignCompletedPush } from "@/lib/push";
import { getServiceRoleSupabaseOrNull } from "@/lib/supabase-server";

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
  };

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
    const { enriched_data: _e, ...rowLegacy } = row as typeof row & {
      enriched_data?: unknown;
    };
    ({ error } = await sb.from("campaigns").upsert(rowLegacy, {
      onConflict: "thread_id",
    }));
  }

  if (
    error &&
    /ab_test_id|ab_variant|template_id|ab_voice_note|column|schema/i.test(
      `${error.message} ${error.details ?? ""} ${error.hint ?? ""}`,
    )
  ) {
    const {
      ab_test_id: _a,
      ab_variant: _b,
      template_id: _t,
      ab_voice_note: _n,
      ...rowNoAb
    } = row as typeof row & {
      ab_test_id?: unknown;
      ab_variant?: unknown;
      template_id?: unknown;
      ab_voice_note?: unknown;
    };
    ({ error } = await sb.from("campaigns").upsert(rowNoAb, {
      onConflict: "thread_id",
    }));
  }

  if (
    error &&
    /predicted_revenue|win_probability|column|schema/i.test(
      `${error.message} ${error.details ?? ""} ${error.hint ?? ""}`,
    )
  ) {
    const {
      predicted_revenue: _pr,
      win_probability: _wp,
      ...rowNoForecast
    } = row as typeof row & { predicted_revenue?: unknown; win_probability?: unknown };
    ({ error } = await sb.from("campaigns").upsert(rowNoForecast, {
      onConflict: "thread_id",
    }));
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
