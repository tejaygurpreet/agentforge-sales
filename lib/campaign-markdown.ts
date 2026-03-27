import type { CampaignClientSnapshot } from "@/agents/types";
import { DEFAULT_BRAND_DISPLAY_NAME } from "@/lib/brand-prompt";
import { computeCampaignStrength } from "@/lib/campaign-strength";
import { emailPlainTextFromHtml } from "@/lib/email-plain";

/** Optional branding block for Markdown exports (Prompt 45 — align with PDF). */
export type MarkdownExportBranding = {
  orgName?: string;
  logoPublicUrl?: string;
  /** Prompt 79 — product name in section titles (default AgentForge Sales). */
  productName?: string;
};

/** Human-readable markdown export for demos and handoff. */
export function campaignSnapshotToMarkdown(
  snapshot: CampaignClientSnapshot,
  branding?: MarkdownExportBranding | null,
): string {
  const { lead, thread_id, final_status, campaign_completed_at } = snapshot;
  const strength = computeCampaignStrength(snapshot);
  const product =
    branding?.productName?.trim() ||
    snapshot.brand_display_name?.trim() ||
    DEFAULT_BRAND_DISPLAY_NAME;
  const lines: string[] = [];
  if (branding?.orgName?.trim()) {
    lines.push(`# ${branding.orgName.trim()}`, "");
  }
  if (branding?.logoPublicUrl?.trim()) {
    lines.push(`![Brand](${branding.logoPublicUrl.trim()})`, "");
  }
  const headBlock = (
    [
      `# ${product} campaign — ${lead.company}`,
      "",
      `- **Thread:** \`${thread_id}\``,
      `- **Status:** ${final_status}`,
      `- **Completed:** ${campaign_completed_at ?? "—"}`,
      "",
      "## Overall campaign strength",
      "",
      `- **Composite:** ${strength.composite}/100 (${strength.label})`,
      `- **Stages with full output:** ${strength.stepsComplete}/4`,
      strength.icp != null ? `- **ICP:** ${strength.icp}/100` : null,
      strength.qual != null ? `- **Qualification:** ${strength.qual}/100` : null,
      `- **Core signal (pre-adjustment):** ~${strength.signalCore}`,
      "",
      strength.summary,
      "",
      "## Lead",
      "",
      `- **Name:** ${lead.name}`,
      `- **Email:** ${lead.email}`,
      `- **Company:** ${lead.company}`,
      lead.linkedin_url ? `- **LinkedIn:** ${lead.linkedin_url}` : null,
      lead.notes ? `- **Notes:** ${lead.notes}` : null,
      "",
    ].filter(Boolean) as string[]
  );
  lines.push(...headBlock);

  const r = snapshot.research_output;
  if (r) {
    lines.push(
      "## Research",
      "",
      r.icp_fit_score != null ? `- **ICP fit score:** ${r.icp_fit_score}/100` : "",
      `### Executive summary`,
      "",
      r.executive_summary,
      "",
      `### ICP narrative`,
      "",
      r.icp_fit_summary,
      "",
    );
    if (r.industry_inference) {
      lines.push(`### Industry`, "", r.industry_inference, "");
    }
    if (r.key_stakeholders?.length) {
      lines.push(`### Key stakeholders`, "", ...r.key_stakeholders.map((s) => `- ${s}`), "");
    }
    if (r.pain_points?.length) {
      lines.push(`### Pain points`, "", ...r.pain_points.map((p) => `- ${p}`), "");
    }
    if (r.messaging_angles?.length) {
      lines.push(
        `### Messaging angles`,
        "",
        ...r.messaging_angles.map((a, i) => `${i + 1}. ${a}`),
        "",
      );
    }
  }

  const o = snapshot.outreach_output;
  if (o) {
    lines.push(
      "## Outreach",
      "",
      `### Subject`,
      "",
      o.subject,
      "",
      `### Email body (plain text)`,
      "",
      emailPlainTextFromHtml(
        o.email_body || (o as { email_html?: string }).email_html || "",
      ),
      "",
      `### LinkedIn`,
      "",
      o.linkedin_message,
      "",
    );
  }

  const q = snapshot.qualification_detail;
  if (q) {
    lines.push("## Qualification", "", `- **Score:** ${q.score}/100`, "", "### BANT summary", "", q.bant_summary, "");
    const rawObj = q.top_objections as unknown[] | undefined;
    if (rawObj?.length) {
      lines.push("### Objections", "");
      for (const row of rawObj) {
        if (typeof row === "string") {
          lines.push(`- ${row}`);
        } else if (row && typeof row === "object" && "objection" in row) {
          const obj = row as { objection: string; reasoning?: string };
          lines.push(`- **${obj.objection}**${obj.reasoning ? ` — ${obj.reasoning}` : ""}`);
        }
      }
      lines.push("");
    }
    const nba =
      "next_best_action" in q && typeof q.next_best_action === "string"
        ? q.next_best_action
        : "recommended_action" in q && typeof (q as { recommended_action?: string }).recommended_action === "string"
          ? (q as { recommended_action: string }).recommended_action
          : "";
    if (nba) {
      lines.push("### Next best action", "", nba, "");
    }
  }

  const n = snapshot.nurture_output;
  if (n) {
    lines.push("## Nurture", "", n.sequence_summary, "");
    n.follow_up_sequences.forEach((step, i) => {
      lines.push(
        `### Step ${i + 1} (day +${step.day_offset}, ${step.channel})`,
        "",
        step.summary,
        "",
        `- **Value add:** ${step.value_add_idea}`,
        `- **Asset:** ${step.content_asset_suggestion}`,
        `- **Timing:** ${step.timing_rationale}`,
        "",
      );
    });
  }

  if (snapshot.pipeline_error) {
    lines.push("## Pipeline error", "", snapshot.pipeline_error, "");
  }

  return lines.join("\n");
}
