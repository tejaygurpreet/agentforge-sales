import type { CampaignClientSnapshot } from "@/agents/types";
import { buildCampaignSummaryExport } from "@/lib/campaign-summary-export";
import { safeCampaignDownloadBasename } from "@/lib/campaign-strength";
import { userFacingLeadNotes } from "@/lib/user-facing-lead-notes";
import { sdrVoiceLabel } from "@/lib/sdr-voice";
import { textBodiesTooSimilar, textEchoesAnyCorpus } from "@/lib/text-similarity";
import { jsPDF } from "jspdf";

export type CampaignPdfRgb = { r: number; g: number; b: number };

export type CampaignPdfExportOptions = {
  /** Light = consulting paper; dark = executive night mode. */
  mode?: "light" | "dark";
  /** Inline image (data URL) for cover + one-pager. */
  logoDataUrl?: string | null;
  primaryRgb?: CampaignPdfRgb;
  secondaryRgb?: CampaignPdfRgb;
  /** Replaces default "AgentForge Sales" subtitle line when set. */
  reportTitle?: string | null;
};

const DEFAULT_PRIMARY: CampaignPdfRgb = { r: 59, g: 130, b: 246 };
const DEFAULT_SECONDARY: CampaignPdfRgb = { r: 15, g: 23, b: 42 };

function mixRgb(a: CampaignPdfRgb, b: CampaignPdfRgb, t: number): CampaignPdfRgb {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

/** ASCII-safe for default Helvetica (jsPDF). */
function forPdf(s: string): string {
  return s
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ");
}

function trunc(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function industryRedundantWithNarrative(
  industry: string,
  executiveSummary: string,
  icpSummary: string,
): boolean {
  const t = industry.trim().toLowerCase();
  if (t.length < 28) return false;
  const blob = `${executiveSummary}\n${icpSummary}`.toLowerCase();
  const probe = t.slice(0, Math.min(52, t.length));
  return blob.includes(probe);
}

function insightBodiesTooSimilar(a: string, b: string): boolean {
  return textBodiesTooSimilar(a, b);
}

function bantEvidenceForPdf(evidence: string, exec: string, icp: string, news: string): string {
  if (textEchoesAnyCorpus(evidence, [exec, icp, news])) {
    return "Overlaps account overview — confirm on discovery.";
  }
  return evidence;
}

function detectImageFormat(dataUrl: string): "PNG" | "JPEG" | "WEBP" {
  if (/^data:image\/jpeg/i.test(dataUrl)) return "JPEG";
  if (/^data:image\/webp/i.test(dataUrl)) return "WEBP";
  return "PNG";
}

/**
 * Multi-page branded PDF — premium executive one-pager, full dossier, optional logo & dark mode (Prompt 40 + 44 + 58).
 * Browser-only; async to allow logo fetch via data URL.
 */
export async function downloadCampaignPdfSummary(
  snapshot: CampaignClientSnapshot,
  options?: CampaignPdfExportOptions,
): Promise<void> {
  const data = buildCampaignSummaryExport(snapshot);
  const base = safeCampaignDownloadBasename(snapshot.lead.company, snapshot.thread_id);
  const dark = options?.mode === "dark";
  const primary = options?.primaryRgb ?? DEFAULT_PRIMARY;
  const secondary = options?.secondaryRgb ?? DEFAULT_SECONDARY;
  const logoDataUrl = options?.logoDataUrl?.trim() || undefined;
  const orgLine = options?.reportTitle?.trim() || "AgentForge Sales";
  const bandAccent = mixRgb(primary, secondary, 0.35);

  const pageBg: CampaignPdfRgb = dark
    ? { r: 18, g: 22, b: 30 }
    : { r: 252, g: 253, b: 255 };
  const ink: CampaignPdfRgb = dark
    ? { r: 241, g: 245, b: 249 }
    : { r: 30, g: 41, b: 59 };
  const muted: CampaignPdfRgb = dark
    ? { r: 148, g: 163, b: 184 }
    : { r: 100, g: 116, b: 139 };
  const cardBg: CampaignPdfRgb = dark
    ? { r: 28, g: 34, b: 44 }
    : { r: 248, g: 250, b: 252 };
  const rule: CampaignPdfRgb = dark
    ? { r: 51, g: 65, b: 85 }
    : { r: 226, g: 232, b: 240 };
  const subtleLine: CampaignPdfRgb = dark
    ? { r: 60, g: 74, b: 94 }
    : { r: 236, g: 240, b: 245 };

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  doc.setProperties({
    title: forPdf(`${orgLine} — ${data.lead.company}`),
    subject: forPdf("Consultant-grade campaign intelligence dossier"),
    author: forPdf(orgLine),
    keywords: "AgentForge, sales, campaign, intelligence, dossier",
  });

  const margin = 54;
  const pageH = doc.internal.pageSize.getHeight();
  const pageW = doc.internal.pageSize.getWidth();
  const maxW = pageW - margin * 2;
  const bodySize = dark ? 9.5 : 9.25;
  const bodyLead = dark ? 12.2 : 11.8;
  const footerH = 48;
  let y = margin;

  function newPage() {
    doc.addPage();
    doc.setFillColor(pageBg.r, pageBg.g, pageBg.b);
    doc.rect(0, 0, pageW, pageH, "F");
    y = margin;
    drawPageHeaderBand(false);
  }

  function drawPageHeaderBand(full: boolean) {
    if (full) {
      const bandBottom = 108;
      doc.setFillColor(secondary.r, secondary.g, secondary.b);
      doc.rect(0, 0, pageW, bandBottom, "F");
      doc.setFillColor(bandAccent.r, bandAccent.g, bandAccent.b);
      doc.rect(0, 0, pageW * 0.42, bandBottom, "F");
      doc.setDrawColor(primary.r, primary.g, primary.b);
      doc.setLineWidth(3);
      doc.line(0, bandBottom, pageW, bandBottom);

      if (logoDataUrl) {
        try {
          const fmt = detectImageFormat(logoDataUrl);
          const props = doc.getImageProperties(logoDataUrl);
          const targetH = 40;
          const scale = targetH / props.height;
          const targetW = props.width * scale;
          doc.addImage(logoDataUrl, fmt, margin, 32, targetW, targetH);
        } catch {
          /* skip broken logo */
        }
      }

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(24);
      const titleX = logoDataUrl ? margin + 156 : margin;
      doc.text(forPdf(orgLine), titleX, 56);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(230, 235, 245);
      doc.text(forPdf("Consultant-grade intelligence dossier"), titleX, 76);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      const conf = forPdf("CONFIDENTIAL — INTERNAL STRATEGY USE");
      doc.text(conf, pageW - margin - doc.getTextWidth(conf), 38);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(ink.r, ink.g, ink.b);
      y = bandBottom + 32;
    } else {
      doc.setDrawColor(primary.r, primary.g, primary.b);
      doc.setLineWidth(2);
      doc.line(margin, 42, pageW - margin, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(primary.r, primary.g, primary.b);
      doc.text(forPdf(orgLine.toUpperCase()), margin, 32);
      doc.setDrawColor(subtleLine.r, subtleLine.g, subtleLine.b);
      doc.setLineWidth(0.35);
      doc.line(margin, 46, pageW - margin, 46);
      doc.setTextColor(ink.r, ink.g, ink.b);
      y = 58;
    }
  }

  function ensureSpace(need: number) {
    if (y + need > pageH - margin - footerH) newPage();
  }

  function writeLines(text: string, indent = 0) {
    const x = margin + indent;
    const lines = doc.splitTextToSize(forPdf(text), maxW - indent);
    for (const line of lines) {
      ensureSpace(bodyLead);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(bodySize);
      doc.setTextColor(ink.r, ink.g, ink.b);
      doc.text(line, x, y);
      y += bodyLead;
    }
  }

  function heading(text: string, size = 13) {
    ensureSpace(size + 22);
    doc.setFillColor(primary.r, primary.g, primary.b);
    doc.rect(margin, y - 2, 5, size + 8, "F");
    doc.setDrawColor(rule.r, rule.g, rule.b);
    doc.setLineWidth(0.35);
    doc.line(margin + 14, y + 5, pageW - margin, y + 5);
    y += 18;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    if (!dark) doc.setTextColor(secondary.r, secondary.g, secondary.b);
    else doc.setTextColor(ink.r, ink.g, ink.b);
    const lines = doc.splitTextToSize(forPdf(text), maxW - 18);
    doc.text(lines, margin + 16, y);
    y += lines.length * (size * 0.82) + 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(bodySize);
    doc.setTextColor(ink.r, ink.g, ink.b);
  }

  function subheading(text: string) {
    ensureSpace(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(primary.r, primary.g, primary.b);
    doc.text(forPdf(text.toUpperCase()), margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(bodySize);
    doc.setTextColor(ink.r, ink.g, ink.b);
  }

  function labeledBlock(label: string, body: string) {
    subheading(label);
    writeLines(body);
    y += 10;
  }

  function drawCardShadow(top: number, height: number) {
    const s = dark ? 36 : 228;
    doc.setFillColor(s, s, s + (dark ? 3 : 4));
    doc.roundedRect(margin + 3, top + 3, maxW, height, 5, 5, "F");
  }

  function drawStatTile(
    left: number,
    top: number,
    w: number,
    h: number,
    label: string,
    value: string,
  ) {
    doc.setFillColor(cardBg.r, cardBg.g, cardBg.b);
    doc.setDrawColor(primary.r, primary.g, primary.b);
    doc.setLineWidth(0.75);
    doc.roundedRect(left, top, w, h, 5, 5, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(muted.r, muted.g, muted.b);
    doc.text(forPdf(label), left + 12, top + 22);
    doc.setFontSize(17);
    doc.setTextColor(primary.r, primary.g, primary.b);
    const vlines = doc.splitTextToSize(forPdf(value), w - 24);
    let vy = top + 44;
    for (const vl of vlines) {
      doc.text(vl, left + 12, vy);
      vy += 18;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(bodySize);
    doc.setTextColor(ink.r, ink.g, ink.b);
  }

  // --- Page 1: Executive one-pager (Prompt 44) ---
  doc.setFillColor(pageBg.r, pageBg.g, pageBg.b);
  doc.rect(0, 0, pageW, pageH, "F");
  drawPageHeaderBand(true);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(muted.r, muted.g, muted.b);
  doc.text(forPdf("EXECUTIVE ONE-PAGER"), margin, y);
  y += 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(secondary.r, secondary.g, secondary.b);
  if (dark) doc.setTextColor(ink.r, ink.g, ink.b);
  doc.text(forPdf("Snapshot & recommended motion"), margin, y);
  y += 26;

  const voiceLabel = sdrVoiceLabel(snapshot.lead.sdr_voice_tone);
  const metaBlock = [
    `Account: ${data.lead.company}`,
    `Contact: ${data.lead.name} <${data.lead.email}>`,
    `Engagement ID: ${data.run.thread_id}`,
    `Exported: ${data.meta.exportedAt}  |  Run status: ${data.run.final_status}`,
    `Campaign voice: ${voiceLabel}`,
  ].join("\n");
  writeLines(metaBlock);
  y += 12;

  const cs = data.campaign_strength;
  const qualSnap = data.qualification?.bant_summary
    ? trunc(data.qualification.bant_summary, 620)
    : null;
  const execSnap = data.research?.executive_summary
    ? trunc(data.research.executive_summary, 620)
    : null;
  const newsSnap = data.research?.recent_news_or_funding_summary?.trim()
    ? trunc(data.research.recent_news_or_funding_summary, 400)
    : null;
  const nurtureSnap = data.nurture?.sequence_summary
    ? trunc(data.nurture.sequence_summary, 420)
    : null;
  const nbaSnap = data.qualification?.next_best_action
    ? trunc(data.qualification.next_best_action, 480)
    : null;
  let firstObjection =
    data.qualification?.top_objections?.[0]?.objection != null
      ? trunc(data.qualification.top_objections[0].objection, 320)
      : null;
  if (firstObjection && execSnap && insightBodiesTooSimilar(execSnap, firstObjection)) {
    firstObjection = null;
  }
  if (firstObjection && qualSnap && insightBodiesTooSimilar(qualSnap, firstObjection)) {
    firstObjection = null;
  }
  if (firstObjection && newsSnap && insightBodiesTooSimilar(newsSnap, firstObjection)) {
    firstObjection = null;
  }

  const gap = 10;
  const tileW = (maxW - gap * 2) / 3;
  const tileH = 72;
  const tileTop = y;
  drawStatTile(margin, tileTop, tileW, tileH, "ICP fit", `${cs.icp ?? "—"}/100`);
  drawStatTile(margin + tileW + gap, tileTop, tileW, tileH, "Qualification", `${cs.qual ?? "—"}/100`);
  drawStatTile(
    margin + (tileW + gap) * 2,
    tileTop,
    tileW,
    tileH,
    "Composite",
    `${cs.composite}/100`,
  );
  y = tileTop + tileH + 22;

  const insights: string[] = [];
  if (execSnap) insights.push(`Market / account read: ${execSnap}`);
  if (
    newsSnap &&
    (!execSnap || !insightBodiesTooSimilar(execSnap, newsSnap)) &&
    (!qualSnap || !insightBodiesTooSimilar(qualSnap, newsSnap))
  ) {
    insights.push(`Timing / external context: ${newsSnap}`);
  }
  if (qualSnap && (!execSnap || !insightBodiesTooSimilar(execSnap, qualSnap))) {
    insights.push(`Deal narrative: ${qualSnap}`);
  }
  if (
    nurtureSnap &&
    (!execSnap || !insightBodiesTooSimilar(execSnap, nurtureSnap)) &&
    (!qualSnap || !insightBodiesTooSimilar(qualSnap, nurtureSnap)) &&
    (!newsSnap || !insightBodiesTooSimilar(newsSnap, nurtureSnap))
  ) {
    insights.push(`Follow-up architecture: ${nurtureSnap}`);
  }
  if (insights.length < 2 && data.outreach?.subject) {
    insights.push(`First-touch subject line: ${trunc(data.outreach.subject, 110)}`);
  }
  if (insights.length < 2) {
    insights.push(`Signal summary: ${trunc(cs.summary, 220)}`);
  }

  const insightsBody = insights
    .slice(0, 3)
    .map((t, i) => `${i + 1}. ${t}`)
    .join("\n\n");
  const defaultMotion =
    "Validate BANT on the next touch; align nurture cadence to the primary buyer objection; confirm champion vs. blocker map.";
  const motionAlt =
    "Map economic buyer vs champion, attach one crisp proof artifact, and propose two concrete times — if neither lands, park with permission.";
  let motionText = defaultMotion;
  if (nbaSnap) {
    const echoesExec = Boolean(execSnap && insightBodiesTooSimilar(execSnap, nbaSnap));
    const echoesQual = Boolean(qualSnap && insightBodiesTooSimilar(qualSnap, nbaSnap));
    motionText = echoesExec || echoesQual ? motionAlt : nbaSnap;
  }

  const cardTop = y;
  const innerPad = 20;
  const insightsH =
    doc.splitTextToSize(forPdf(insightsBody), maxW - innerPad * 2).length * (bodyLead * 0.92) + 36;
  const riskH = firstObjection
    ? 38 +
      doc.splitTextToSize(forPdf(firstObjection), maxW - innerPad * 2 - 8).length * bodyLead * 0.9
    : 0;
  const motionBoxH =
    doc.splitTextToSize(forPdf(motionText), maxW - innerPad * 2 - 20).length * (bodyLead * 0.9) + 44;
  const cardH = insightsH + riskH + motionBoxH + 28;

  drawCardShadow(cardTop, cardH);
  doc.setFillColor(cardBg.r, cardBg.g, cardBg.b);
  doc.setDrawColor(rule.r, rule.g, rule.b);
  doc.setLineWidth(0.55);
  doc.roundedRect(margin, cardTop, maxW, cardH, 6, 6, "FD");

  y = cardTop + innerPad;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(primary.r, primary.g, primary.b);
  doc.text(forPdf("Strategic intelligence snapshot"), margin + innerPad, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(bodySize);
  doc.setTextColor(ink.r, ink.g, ink.b);
  for (const line of doc.splitTextToSize(forPdf(insightsBody), maxW - innerPad * 2)) {
    doc.text(line, margin + innerPad, y);
    y += bodyLead * 0.92;
  }
  y += 8;

  if (firstObjection) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(muted.r, muted.g, muted.b);
    doc.text(forPdf("Watch / buyer tension"), margin + innerPad, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(bodySize - 0.5);
    doc.setTextColor(ink.r, ink.g, ink.b);
    for (const line of doc.splitTextToSize(forPdf(firstObjection), maxW - innerPad * 2 - 6)) {
      doc.text(line, margin + innerPad + 6, y);
      y += bodyLead * 0.88;
    }
    y += 10;
  }

  const motionBg = mixRgb(primary, pageBg, dark ? 0.14 : 0.86);
  doc.setFillColor(motionBg.r, motionBg.g, motionBg.b);
  doc.setDrawColor(primary.r, primary.g, primary.b);
  doc.setLineWidth(1.2);
  const motionBoxTop = y;
  doc.roundedRect(margin + innerPad - 4, motionBoxTop, maxW - (innerPad - 4) * 2, motionBoxH, 4, 4, "FD");
  doc.setFillColor(primary.r, primary.g, primary.b);
  doc.rect(margin + innerPad - 4, motionBoxTop, 5, motionBoxH, "F");
  y = motionBoxTop + 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(dark ? ink.r : secondary.r, dark ? ink.g : secondary.g, dark ? ink.b : secondary.b);
  doc.text(forPdf("Recommended motion"), margin + innerPad + 10, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(bodySize);
  doc.setTextColor(ink.r, ink.g, ink.b);
  for (const line of doc.splitTextToSize(forPdf(motionText), maxW - innerPad * 2 - 20)) {
    doc.text(line, margin + innerPad + 10, y);
    y += bodyLead * 0.9;
  }

  y = cardTop + cardH + 20;

  subheading("Delivery & governance");
  writeLines(
    data.outreach
      ? `First-touch e-mail: ${data.outreach.email_sent ? "Delivered via workspace ESP" : "Not sent — review workspace configuration and RESEND_API_KEY."}.`
      : "Outreach: not present in this export snapshot.",
  );
  writeLines(`Stages complete: ${cs.stepsComplete}/4  |  Blended signal index ~${cs.signalCore}.`);
  y += 8;

  // --- Full dossier from page 2 ---
  newPage();

  heading("Campaign scores & lead record", 13);
  writeLines(
    [
      `Overall composite: ${cs.composite}/100 (${cs.label})`,
      `ICP fit: ${cs.icp ?? "n/a"}/100 | Qualification: ${cs.qual ?? "n/a"}/100`,
      `Blended signal index: ~${cs.signalCore} | Stages complete: ${cs.stepsComplete}/4`,
      `Executive read: ${cs.summary}`,
    ].join("\n"),
  );
  y += 8;

  const notesPdf = userFacingLeadNotes(data.lead.notes ?? undefined);
  labeledBlock(
    "Lead record",
    [
      `${data.lead.name} <${data.lead.email}>`,
      `Company: ${data.lead.company}`,
      data.lead.linkedin_url ? `LinkedIn: ${data.lead.linkedin_url}` : "",
      data.lead.status ? `Pipeline status: ${data.lead.status}` : "",
      `SDR voice: ${voiceLabel}`,
      notesPdf ? `Notes:\n${notesPdf}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  y += 6;

  if (data.research) {
    heading("Research intelligence dossier", 13);
    labeledBlock("ICP fit score", `${data.research.icp_fit_score}/100`);
    labeledBlock("Executive summary", data.research.executive_summary);
    labeledBlock("ICP fit narrative", data.research.icp_fit_summary);
    if (
      data.research.industry_inference &&
      !industryRedundantWithNarrative(
        data.research.industry_inference,
        data.research.executive_summary,
        data.research.icp_fit_summary,
      )
    ) {
      labeledBlock("Industry", data.research.industry_inference);
    }
    if (data.research.recent_news_or_funding_summary?.trim()) {
      labeledBlock("News / funding note", data.research.recent_news_or_funding_summary);
    }
    subheading("Reasoning trace");
    data.research.reasoning_steps.forEach((step, i) => {
      writeLines(`${i + 1}. ${step}`);
    });
    y += 6;
    if (data.research.bant_snapshot) {
      subheading("BANT hypothesis (research phase)");
      const b = data.research.bant_snapshot;
      const execN = data.research.executive_summary ?? "";
      const icpN = data.research.icp_fit_summary ?? "";
      const newsN = data.research.recent_news_or_funding_summary ?? "";
      for (const key of ["budget", "authority", "need", "timeline"] as const) {
        const leg = b[key];
        const ev = bantEvidenceForPdf(leg.evidence, execN, icpN, newsN);
        writeLines(`${key.toUpperCase()} [${leg.confidence}]: ${ev}`);
      }
      y += 6;
    }
    if (data.research.tech_stack_hints?.length) {
      subheading("Tech stack hints");
      data.research.tech_stack_hints.forEach((t) => writeLines(`- ${t}`));
      y += 6;
    }
    if (data.research.key_stakeholders?.length) {
      subheading("Key stakeholders");
      data.research.key_stakeholders.forEach((s) => writeLines(`- ${s}`));
      y += 6;
    }
    if (data.research.pain_points?.length) {
      subheading("Pain points");
      data.research.pain_points.forEach((p) => writeLines(`- ${p}`));
      y += 6;
    }
    if (data.research.messaging_angles?.length) {
      subheading("Messaging angles");
      data.research.messaging_angles.forEach((a, i) => writeLines(`${i + 1}. ${a}`));
      y += 6;
    }
  }

  if (data.live_signals?.length) {
    heading("Live signals", 13);
    writeLines(
      "Post-research signal pass (funding, hiring, company motion). Use as directional context alongside the dossier above.",
    );
    y += 4;
    for (const s of data.live_signals) {
      subheading(`${s.signal_type.replace(/_/g, " ")}`);
      writeLines(s.signal_text);
      y += 4;
    }
  }

  if (data.outreach) {
    heading("Outreach", 13);
    labeledBlock("Subject line", data.outreach.subject);
    labeledBlock("Email body (plain text)", data.outreach.email_plain);
    labeledBlock("LinkedIn message", data.outreach.linkedin_message);
    labeledBlock("First touch delivered", data.outreach.email_sent ? "Yes" : "No");
    if (data.outreach.primary_angle) labeledBlock("Primary angle", data.outreach.primary_angle);
    if (data.outreach.cta_strategy) labeledBlock("CTA strategy", data.outreach.cta_strategy);
    if (data.outreach.linkedin_rationale) {
      labeledBlock("LinkedIn rationale", data.outreach.linkedin_rationale);
    }
    if (data.outreach.personalization_hooks?.length) {
      subheading("Personalization hooks");
      data.outreach.personalization_hooks.forEach((h) => writeLines(`- ${h}`));
      y += 6;
    }
  }

  if (data.qualification) {
    heading("Qualification & playbook", 13);
    labeledBlock("Qualification score", `${data.qualification.score}/100`);
    labeledBlock("BANT summary", data.qualification.bant_summary);
    subheading("Buyer objections");
    data.qualification.top_objections.forEach((o, i) => {
      writeLines(`${i + 1}. ${o.objection}`);
      if (o.reasoning) writeLines(`   Impact / move: ${o.reasoning}`, 8);
    });
    y += 6;
    labeledBlock("Next best action", data.qualification.next_best_action);
  }

  if (data.nurture) {
    heading("Nurture sequence", 13);
    labeledBlock("Sequence overview", data.nurture.sequence_summary);
    data.nurture.follow_up_sequences.forEach((step, i) => {
      subheading(`Step ${i + 1} — day +${step.day_offset} | ${step.channel}`);
      writeLines(step.summary);
      writeLines(`Value add: ${step.value_add_idea}`);
      writeLines(`Recommended asset: ${step.content_asset_suggestion}`);
      writeLines(`Timing rationale: ${step.timing_rationale}`);
      y += 8;
    });
  }

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(primary.r, primary.g, primary.b);
    doc.rect(0, pageH - 5, pageW, 5, "F");
    doc.setDrawColor(rule.r, rule.g, rule.b);
    doc.setLineWidth(0.4);
    doc.line(margin, pageH - footerH + 8, pageW - margin, pageH - footerH + 8);
    doc.setFontSize(7.5);
    doc.setTextColor(muted.r, muted.g, muted.b);
    doc.setFont("helvetica", "normal");
    const footLeft = forPdf(
      `${orgLine}  |  Confidential campaign dossier  |  ${data.meta.exportedAt}`,
    );
    doc.text(footLeft, margin, pageH - 26);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(primary.r, primary.g, primary.b);
    const pg = forPdf(`Page ${i} / ${totalPages}`);
    doc.text(pg, pageW - margin - doc.getTextWidth(pg), pageH - 26);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6.8);
    doc.setTextColor(muted.r, muted.g, muted.b);
    doc.text(
      forPdf("Powered by AgentForge Sales"),
      pageW / 2,
      pageH - 15,
      { align: "center" },
    );
    doc.setFont("helvetica", "normal");
    doc.setTextColor(ink.r, ink.g, ink.b);
  }

  doc.save(`${base}-full-report.pdf`);
}
