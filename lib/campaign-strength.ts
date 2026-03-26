import type { CampaignClientSnapshot } from "@/agents/types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function nodeHasError(snapshot: CampaignClientSnapshot, key: string): boolean {
  const n = snapshot.results?.[key];
  return (
    typeof n === "object" &&
    n !== null &&
    "error" in n &&
    typeof (n as { error: string }).error === "string"
  );
}

function nodeDegraded(snapshot: CampaignClientSnapshot, key: string): boolean {
  const n = snapshot.results?.[key];
  return isRecord(n) && n.degraded === true;
}

export type CampaignStrengthResult = {
  composite: number;
  label: "Strong" | "Promising" | "Solid" | "Mixed" | "At risk";
  summary: string;
  stepsComplete: number;
  /** Raw ICP score when present. */
  icp: number | null;
  /** Qualification score when present. */
  qual: number | null;
  /** Pre-penalty blended signal (for transparency). */
  signalCore: number;
};

/**
 * Blends ICP + qualification (soft harmony), pipeline coverage, delivery bonus,
 * recovery penalties, and Prompt 21 **quality bonuses** so the headline score
 * matches premium end-to-end output when the run is clean and signals align.
 */
export function computeCampaignStrength(
  snapshot: CampaignClientSnapshot,
): CampaignStrengthResult {
  const icp =
    typeof snapshot.research_output?.icp_fit_score === "number"
      ? snapshot.research_output.icp_fit_score
      : null;
  const qual =
    snapshot.qualification_score ?? snapshot.qualification_detail?.score ?? null;
  const qualNum = typeof qual === "number" ? qual : null;

  const steps = [
    Boolean(snapshot.research_output && !nodeHasError(snapshot, "research_node")),
    Boolean(snapshot.outreach_output && !nodeHasError(snapshot, "outreach_node")),
    Boolean(
      (snapshot.qualification_detail != null ||
        snapshot.qualification_score != null) &&
        !nodeHasError(snapshot, "qualification_node"),
    ),
    Boolean(snapshot.nurture_output && !nodeHasError(snapshot, "nurture_node")),
  ];
  const stepsComplete = steps.filter(Boolean).length;
  const pipelineRatio = stepsComplete / 4;

  if (snapshot.final_status === "failed") {
    return {
      composite: 0,
      label: "At risk",
      summary:
        "Run did not finish successfully — fix configuration or review pipeline errors before judging strength.",
      stepsComplete,
      icp,
      qual: qualNum,
      signalCore: 0,
    };
  }

  let signalCore: number;
  let spread = 0;
  if (icp != null && qualNum != null) {
    const avg = (icp + qualNum) / 2;
    spread = Math.abs(icp - qualNum);
    const harmony = Math.max(0.93, 1 - spread / 155);
    signalCore = avg * harmony;
    if (icp >= 72 && qualNum >= 72 && spread <= 18) {
      signalCore = Math.min(98, signalCore + 1.35);
    }
    if (icp >= 76 && qualNum >= 76 && spread <= 12) {
      signalCore = Math.min(99, signalCore + 0.85);
    }
  } else if (icp != null) {
    signalCore = icp;
  } else if (qualNum != null) {
    signalCore = qualNum;
  } else {
    signalCore = 52;
  }

  const emailSent = snapshot.outreach_output?.email_sent === true;
  const deliveryBoost = emailSent && stepsComplete >= 3 ? 2.75 : emailSent ? 1.6 : 0;

  let recoveryPenalty = 0;
  if (nodeDegraded(snapshot, "research_node")) recoveryPenalty += 2.5;
  if (nodeDegraded(snapshot, "qualification_node")) recoveryPenalty += 2.5;
  if (nodeDegraded(snapshot, "outreach_node")) recoveryPenalty += 1.5;
  if (nodeDegraded(snapshot, "nurture_node")) recoveryPenalty += 1;
  recoveryPenalty = Math.min(6, recoveryPenalty);

  let qualityBonus = 0;
  if (stepsComplete === 4 && snapshot.final_status === "completed") {
    qualityBonus += 1.75;
  } else if (snapshot.final_status === "completed_with_errors") {
    qualityBonus -= 1;
  }
  if (
    icp != null &&
    qualNum != null &&
    icp >= 73 &&
    qualNum >= 73 &&
    spread <= 15
  ) {
    qualityBonus += 1.1;
  }

  const raw =
    signalCore * 0.81 +
    pipelineRatio * 100 * 0.19 +
    deliveryBoost -
    recoveryPenalty +
    qualityBonus;
  const capped = Math.min(100, Math.max(0, Math.round(raw)));

  let label: CampaignStrengthResult["label"] = "Solid";
  if (capped >= 82) label = "Strong";
  else if (capped >= 70) label = "Promising";
  else if (capped >= 54) label = "Solid";
  else if (capped >= 38) label = "Mixed";
  else label = "At risk";

  const parts: string[] = [];
  if (icp != null) parts.push(`ICP ${icp}`);
  if (qualNum != null) parts.push(`Qual ${qualNum}`);
  const signalPhrase =
    parts.length > 0 ? `${parts.join(" · ")}` : "Limited scoring signal";

  let summary: string;
  if (stepsComplete === 4) {
    if (capped >= 80 && snapshot.final_status === "completed") {
      summary = `${signalPhrase} — full pipeline, clean run. Index rewards aligned ICP and qualification, stage coverage, and delivery.`;
    } else {
      summary = `${signalPhrase} — full pipeline. Composite blends research fit, qualification, coverage, and first-touch delivery.`;
    }
  } else {
    summary = `${signalPhrase}; ${stepsComplete} of 4 stages complete — score reflects partial coverage until the run finishes.`;
  }

  return {
    composite: capped,
    label,
    summary,
    stepsComplete,
    icp,
    qual: qualNum,
    signalCore: Math.round(signalCore * 10) / 10,
  };
}

export function safeCampaignDownloadBasename(
  company: string,
  threadId: string,
): string {
  const slug =
    company
      .trim()
      .toLowerCase()
      .replace(/[^\w\u00C0-\u024F]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "campaign";
  const tid = threadId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 14);
  return `agentforge-${slug}-${tid || "run"}`;
}
