import type {
  CampaignClientSnapshot,
  SequenceRecommendationSnapshot,
  SdrVoiceTone,
} from "@/agents/types";
import type { CampaignSequenceRow } from "@/types";

export type HistoricCampaignSample = {
  sequence_id: string | null;
  composite: number | null;
  industry_bucket: string | null;
  company: string;
};

export type CustomVoiceOption = {
  id: string;
  name: string;
};

const TECH_RE = /software|saas|cloud|api|platform|data|ai|ml|devops|cyber|security|tech/i;
const FIN_RE = /bank|capital|finance|fintech|wealth|asset|insurance|credit|fund/i;
const HEALTH_RE = /health|medical|pharma|bio|clinical|care|hospital|patient/i;
const RETAIL_RE = /retail|commerce|e-?commerce|store|brand|consumer|shop/i;

export type IndustryBucket = "tech" | "finance" | "health" | "retail" | "general";

export function inferIndustryBucket(company: string, email: string): IndustryBucket {
  const blob = `${company} ${email}`.toLowerCase();
  if (TECH_RE.test(blob)) return "tech";
  if (FIN_RE.test(blob)) return "finance";
  if (HEALTH_RE.test(blob)) return "health";
  if (RETAIL_RE.test(blob)) return "retail";
  return "general";
}

function industryBucketFromInference(text: string | null | undefined): IndustryBucket | null {
  if (!text?.trim()) return null;
  const t = text.toLowerCase();
  if (TECH_RE.test(t)) return "tech";
  if (FIN_RE.test(t)) return "finance";
  if (HEALTH_RE.test(t)) return "health";
  if (RETAIL_RE.test(t)) return "retail";
  return null;
}

function voiceForBucket(bucket: IndustryBucket): SdrVoiceTone {
  switch (bucket) {
    case "tech":
      return "data_driven_analyst";
    case "finance":
      return "consultative_enterprise";
    case "health":
      return "warm_relationship_builder";
    case "retail":
      return "bold_challenger";
    default:
      return "default";
  }
}

function sequenceEmailWeight(seq: CampaignSequenceRow): number {
  const steps = seq.steps ?? [];
  if (steps.length === 0) return 0.5;
  const emails = steps.filter((s) => s.channel === "email").length;
  return emails / steps.length;
}

function parseSnapshotFromResults(results: unknown): CampaignClientSnapshot | null {
  if (!results || typeof results !== "object" || Array.isArray(results)) return null;
  const o = results as Record<string, unknown>;
  if (typeof o.thread_id !== "string" || typeof o.final_status !== "string") return null;
  if (!o.lead || typeof o.lead !== "object") return null;
  return results as unknown as CampaignClientSnapshot;
}

/** Extract lightweight stats from a persisted `campaigns.results` row. */
export function historicSampleFromResultsRow(
  results: unknown,
  fallbackCompany: string,
): HistoricCampaignSample | null {
  const snap = parseSnapshotFromResults(results);
  if (!snap) return null;
  const seqId = snap.sequence_plan?.sequence_id ?? null;
  const rawSnap = snap as unknown as Record<string, unknown>;
  const ls = rawSnap.lead_score as { composite?: unknown } | undefined;
  const composite =
    typeof ls?.composite === "number" && Number.isFinite(ls.composite)
      ? Math.min(100, Math.max(0, Math.round(ls.composite)))
      : null;
  const research = snap.research_output as { industry_inference?: string } | null;
  const ib =
    industryBucketFromInference(research?.industry_inference ?? null) ??
    inferIndustryBucket(
      typeof snap.lead?.company === "string" ? snap.lead.company : fallbackCompany,
      typeof snap.lead?.email === "string" ? snap.lead.email : "",
    );
  const company =
    typeof snap.lead?.company === "string" ? snap.lead.company : fallbackCompany;
  return {
    sequence_id: seqId,
    composite,
    industry_bucket: ib,
    company,
  };
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 50;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Prompt 95 — heuristic recommendation from workspace sequences + historic campaigns.
 * No extra LLM calls; deterministic and backward-compatible.
 */
export function buildSequenceRecommendation(args: {
  company: string;
  email: string;
  notes?: string;
  sequences: CampaignSequenceRow[];
  historicSamples: HistoricCampaignSample[];
  customVoices: CustomVoiceOption[];
}): SequenceRecommendationSnapshot {
  const company = args.company.trim() || "this account";
  const email = args.email.trim().toLowerCase();
  const bucket = inferIndustryBucket(company, email);
  const voice = voiceForBucket(bucket);

  let custom_voice_id: string | null = null;
  let custom_voice_name: string | null = null;
  if (args.customVoices.length === 1) {
    custom_voice_id = args.customVoices[0]!.id;
    custom_voice_name = args.customVoices[0]!.name;
  }

  const bySeq = new Map<string, HistoricCampaignSample[]>();
  for (const h of args.historicSamples) {
    if (!h.sequence_id) continue;
    const arr = bySeq.get(h.sequence_id) ?? [];
    arr.push(h);
    bySeq.set(h.sequence_id, arr);
  }

  let bestSeq: CampaignSequenceRow | null = null;
  let bestScore = -Infinity;

  for (const seq of args.sequences) {
    const samples = bySeq.get(seq.id) ?? [];
    let score = 48;
    const composites = samples.map((s) => s.composite).filter((x): x is number => x != null);
    if (composites.length > 0) {
      score += (mean(composites) - 50) * 0.35;
    }
    const sameIndustry = samples.filter((s) => s.industry_bucket === bucket);
    score += Math.min(22, sameIndustry.length * 4);
    score += sequenceEmailWeight(seq) * (bucket === "tech" || bucket === "finance" ? 14 : 8);
    if (samples.length > 0) score += Math.min(12, samples.length * 2);
    if (score > bestScore) {
      bestScore = score;
      bestSeq = seq;
    }
  }

  if (!bestSeq && args.sequences.length > 0) {
    bestSeq =
      [...args.sequences].sort(
        (a, b) => sequenceEmailWeight(b) - sequenceEmailWeight(a),
      )[0] ?? null;
  }

  const signals_used: string[] = [
    `industry_signals:${bucket}`,
    "workspace_campaign_history",
    "saved_sequence_library",
  ];
  if (args.notes?.trim()) signals_used.push("lead_notes_present");
  if (email.includes(".edu")) signals_used.push("edu_domain");

  const whyLines: string[] = [];
  whyLines.push(
    `Your company and domain read as a ${bucket.replace(/_/g, " ")} motion — we bias voice and pacing for that context.`,
  );
  if (bestSeq) {
    const hist = bySeq.get(bestSeq.id) ?? [];
    if (hist.length > 0) {
      const comps = hist.map((h) => h.composite).filter((x): x is number => x != null);
      whyLines.push(
        `${bestSeq.name} has ${hist.length} prior workspace run(s)${
          comps.length
            ? ` with mean composite ${Math.round(mean(comps))}/100 where we could read scores.`
            : " (scores still warming up in your data)."
        }`,
      );
    } else {
      whyLines.push(
        `${bestSeq.name} is the best structural fit from your library for this profile (channel mix + cadence).`,
      );
    }
  } else {
    whyLines.push(
      "No saved sequence is required — the default pipeline still runs; add a playbook in Sequences when you want tracked milestones.",
    );
  }
  if (custom_voice_id) {
    whyLines.push(
      `You only have one custom voice on file — we surface it so tone stays consistent with your library.`,
    );
  } else {
    whyLines.push(
      `Preset “${voice.replace(/_/g, " ")}” keeps research → outreach → nurture aligned for this segment.`,
    );
  }

  let confidence = 40;
  if (args.historicSamples.length >= 8) confidence += 18;
  else if (args.historicSamples.length >= 3) confidence += 10;
  if (bestSeq && (bySeq.get(bestSeq.id)?.length ?? 0) >= 2) confidence += 14;
  if (bucket !== "general") confidence += 8;
  if (args.sequences.length > 0) confidence += 5;
  confidence = Math.min(93, Math.round(confidence));

  const first_message_hint = (() => {
    switch (bucket) {
      case "tech":
        return `Open with one specific product or infrastructure angle tied to ${company}, then a single measurable proof point — skip generic praise.`;
      case "finance":
        return `Lead with governance, risk, or efficiency your motion credibly improves; keep claims precise and audit-friendly.`;
      case "health":
        return `Start with patient or clinician impact, not features; show you understand compliance and workflow realities.`;
      case "retail":
        return `Anchor on a shopper or brand moment, then tie to revenue or conversion — keep it vivid and short.`;
      default:
        return `Reference something concrete about ${company} (news, motion, or stack hint), then one crisp value line — avoid template-y openers.`;
    }
  })();

  return {
    engine_version: "p95-v1",
    computed_at: new Date().toISOString(),
    recommended_sequence_id: bestSeq?.id ?? null,
    recommended_sequence_name: bestSeq?.name ?? null,
    confidence_0_to_100: confidence,
    sdr_voice_tone: voice,
    custom_voice_id,
    custom_voice_name,
    first_message_hint,
    why_this_sequence: whyLines.join("\n\n"),
    signals_used,
  };
}
