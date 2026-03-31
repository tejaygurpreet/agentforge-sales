import type { CampaignClientSnapshot } from "@/agents/types";
import { buildCampaignSummaryExport } from "@/lib/campaign-summary-export";
import { DEFAULT_BRAND_DISPLAY_NAME } from "@/lib/brand-prompt";
import { safeCampaignDownloadBasename } from "@/lib/campaign-strength";
import { userFacingLeadNotes } from "@/lib/user-facing-lead-notes";
import { voiceLabelForLead } from "@/lib/sdr-voice";
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

/** Prompt 125 — Sage + warm charcoal (matches app light palette; no blue). */
const DEFAULT_PRIMARY: CampaignPdfRgb = { r: 156, g: 168, b: 139 };
const DEFAULT_SECONDARY: CampaignPdfRgb = { r: 63, g: 63, b: 63 };

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
 * Async to allow logo fetch via data URL (browser); also used server-side for HubSpot file upload.
 */
async function renderCampaignPdfDocument(
  snapshot: CampaignClientSnapshot,
  options?: CampaignPdfExportOptions,
): Promise<{ doc: InstanceType<typeof jsPDF>; base: string }> {
  const orgLine = options?.reportTitle?.trim() || DEFAULT_BRAND_DISPLAY_NAME;
  const data = buildCampaignSummaryExport(snapshot, {
    productLabel: orgLine,
  });
  const base = safeCampaignDownloadBasename(snapshot.lead.company, snapshot.thread_id);
  const dark = options?.mode === "dark";
  const primary = options?.primaryRgb ?? DEFAULT_PRIMARY;
  const secondary = options?.secondaryRgb ?? DEFAULT_SECONDARY;
  const logoDataUrl = options?.logoDataUrl?.trim() || undefined;
  const bandAccent = mixRgb(primary, secondary, 0.35);

  /** Light mode: warm cream + charcoal (Prompt 125). */
  const pageBg: CampaignPdfRgb = dark
    ? { r: 18, g: 22, b: 30 }
    : { r: 248, g: 245, b: 240 };
  const ink: CampaignPdfRgb = dark
    ? { r: 241, g: 245, b: 249 }
    : { r: 63, g: 63, b: 63 };
  const muted: CampaignPdfRgb = dark
    ? { r: 148, g: 163, b: 184 }
    : { r: 107, g: 107, b: 107 };
  const cardBg: CampaignPdfRgb = dark
    ? { r: 28, g: 34, b: 44 }
    : { r: 250, g: 247, b: 242 };
  const rule: CampaignPdfRgb = dark
    ? { r: 51, g: 65, b: 85 }
    : { r: 230, g: 224, b: 216 };
  const subtleLine: CampaignPdfRgb = dark
    ? { r: 60, g: 74, b: 94 }
    : { r: 242, g: 238, b: 232 };

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  doc.setProperties({
    title: forPdf(`${orgLine} — ${data.lead.company}`),
    subject: forPdf("Consultant-grade campaign intelligence dossier"),
    author: forPdf(orgLine),
    keywords: forPdf(`${orgLine}, sales, campaign, intelligence, dossier`),
  });

  const margin = 56;
  const pageH = doc.internal.pageSize.getHeight();
  const pageW = doc.internal.pageSize.getWidth();
  const maxW = pageW - margin * 2;
  const bodySize = dark ? 9.5 : 9.45;
  const bodyLead = dark ? 12.2 : 12.1;
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
      const bandBottom = 114;
      if (dark) {
        doc.setFillColor(secondary.r, secondary.g, secondary.b);
        doc.rect(0, 0, pageW, bandBottom, "F");
        doc.setFillColor(bandAccent.r, bandAccent.g, bandAccent.b);
        doc.rect(0, 0, pageW * 0.42, bandBottom, "F");
      } else {
        const warmDeep: CampaignPdfRgb = { r: 92, g: 88, b: 82 };
        const base = mixRgb(secondary, warmDeep, 0.88);
        doc.setFillColor(base.r, base.g, base.b);
        doc.rect(0, 0, pageW, bandBottom, "F");
        const terracotta: CampaignPdfRgb = { r: 200, g: 164, b: 138 };
        const sweep = mixRgb(primary, terracotta, 0.45);
        doc.setFillColor(sweep.r, sweep.g, sweep.b);
        doc.rect(0, 0, pageW * 0.5, bandBottom, "F");
        doc.setFillColor(bandAccent.r, bandAccent.g, bandAccent.b);
        doc.rect(0, 0, pageW * 0.4, bandBottom, "F");
      }
      doc.setDrawColor(primary.r, primary.g, primary.b);
      doc.setLineWidth(dark ? 3 : 2.5);
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
      doc.setTextColor(245, 242, 236);
      doc.text(forPdf("Consultant-grade intelligence dossier"), titleX, 78);
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
    const barRgb = dark ? primary : mixRgb(primary, pageBg, 0.82);
    doc.setFillColor(barRgb.r, barRgb.g, barRgb.b);
    doc.roundedRect(margin, y - 2, 5, size + 8, 1.5, 1.5, "F");
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

  /** Prompt 96 — battle card narrative + five-column comparison matrix. */
  function renderCompetitorBattleCard() {
    const cl = data.research?.competitor_landscape;
    if (!cl?.competitors?.length) return;
    const colFrac = [0.17, 0.2, 0.2, 0.2, 0.23] as const;
    const lineH = 9.0;
    const pad = 3.5;
    const headerFs = 7.1;
    const cellFs = 6.7;
    const widths = colFrac.map((f) => f * maxW);

    function colXs(): number[] {
      const xs: number[] = [];
      let x = margin;
      for (const w of widths) {
        xs.push(x);
        x += w;
      }
      return xs;
    }

    function drawMatrixRow(cells: string[], header: boolean) {
      const xs = colXs();
      const cellLines = cells.map((c, i) =>
        doc.splitTextToSize(
          forPdf(header ? trunc(c, 72) : trunc(c, 520)),
          widths[i] - pad * 2,
        ),
      );
      const linesPerCell = cellLines.map((l) => Math.max(1, l.length));
      const rowH = Math.max(...linesPerCell) * lineH + pad * 2 + (header ? 4 : 2);
      ensureSpace(rowH + 8);
      const rowTop = y;
      doc.setDrawColor(rule.r, rule.g, rule.b);
      doc.setLineWidth(0.35);
      const hdrBg = mixRgb(primary, pageBg, dark ? 0.18 : 0.9);
      for (let i = 0; i < widths.length; i++) {
        if (header) {
          doc.setFillColor(hdrBg.r, hdrBg.g, hdrBg.b);
        } else {
          doc.setFillColor(cardBg.r, cardBg.g, cardBg.b);
        }
        doc.rect(xs[i], rowTop, widths[i], rowH, "FD");
      }
      doc.setDrawColor(rule.r, rule.g, rule.b);
      for (let i = 0; i < widths.length; i++) {
        doc.rect(xs[i], rowTop, widths[i], rowH, "S");
      }
      doc.setFont("helvetica", header ? "bold" : "normal");
      doc.setFontSize(header ? headerFs : cellFs);
      doc.setTextColor(ink.r, ink.g, ink.b);
      for (let i = 0; i < cells.length; i++) {
        let ly = rowTop + pad + (header ? headerFs * 0.75 : cellFs * 0.72);
        for (const line of cellLines[i]) {
          doc.text(line, xs[i] + pad, ly);
          ly += lineH;
        }
      }
      y = rowTop + rowH + 2;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(bodySize);
    }

    heading("Competitor battle card", 13);
    labeledBlock("Account positioning vs alternatives", cl.account_positioning);

    subheading("Competitive comparison matrix");
    y += 2;

    drawMatrixRow(
      ["Competitor", "Strengths", "Weaknesses", "Vs our account", "Win message"],
      true,
    );
    for (const c of cl.competitors) {
      const nameLine = c.category?.trim()
        ? `${c.name} (${c.category})`
        : c.name;
      drawMatrixRow(
        [
          nameLine,
          c.strengths,
          c.weaknesses,
          c.differentiation_vs_account,
          c.suggested_win_message,
        ],
        false,
      );
    }
    y += 10;
  }

  function drawCardShadow(top: number, height: number) {
    if (dark) {
      doc.setFillColor(36, 36, 42);
      doc.roundedRect(margin + 3, top + 3, maxW, height, 5, 5, "F");
    } else {
      doc.setFillColor(230, 228, 224);
      doc.roundedRect(margin + 4, top + 4, maxW, height, 7, 7, "F");
    }
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

  const voiceLabel = voiceLabelForLead(snapshot.lead);
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
  doc.setLineWidth(dark ? 0.55 : 0.45);
  doc.roundedRect(margin, cardTop, maxW, cardH, dark ? 6 : 8, dark ? 6 : 8, "FD");

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
    renderCompetitorBattleCard();
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
  const footerAccent = dark ? primary : mixRgb(primary, pageBg, 0.55);
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(footerAccent.r, footerAccent.g, footerAccent.b);
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
    doc.text(forPdf(`Powered by ${orgLine}`), pageW / 2, pageH - 15, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(ink.r, ink.g, ink.b);
  }

  return { doc, base };
}

export async function downloadCampaignPdfSummary(
  snapshot: CampaignClientSnapshot,
  options?: CampaignPdfExportOptions,
): Promise<void> {
  const { doc, base } = await renderCampaignPdfDocument(snapshot, options);
  doc.save(`${base}-full-report.pdf`);
}

/**
 * Browser preview + manual download — same render as `downloadCampaignPdfSummary` (Prompt 109).
 */
export async function getCampaignPdfBlob(
  snapshot: CampaignClientSnapshot,
  options?: CampaignPdfExportOptions,
): Promise<{ blob: Blob; filename: string }> {
  const { doc, base } = await renderCampaignPdfDocument(snapshot, options);
  const blob = doc.output("blob") as Blob;
  return { blob, filename: `${base}-full-report.pdf` };
}

/**
 * Same dossier as the download — returns bytes for CRM uploads (server actions).
 */
export async function generateCampaignPdfArrayBuffer(
  snapshot: CampaignClientSnapshot,
  options?: CampaignPdfExportOptions,
): Promise<{ data: ArrayBuffer; filename: string }> {
  const { doc, base } = await renderCampaignPdfDocument(snapshot, options);
  const data = doc.output("arraybuffer") as ArrayBuffer;
  return { data, filename: `${base}-full-report.pdf` };
}

/** Prompt 98 — structured proposal / quote for `renderProposalQuotePdfBytes`. */
export type ProposalQuotePdfInput = {
  org_line: string;
  title: string;
  cover_subtitle: string;
  company: string;
  contact_name: string;
  value_proposition: string;
  pricing_summary: string;
  line_items: { label: string; amount_usd: number; detail: string }[];
  roi_section: string;
  roi_highlight: string;
  assumptions: string[];
  next_steps: string[];
  payment_terms: string;
  valid_until: string;
  disclaimer: string;
  thread_id: string;
  exported_at: string;
};

export type ProposalQuotePdfOptions = {
  primaryRgb?: CampaignPdfRgb;
  secondaryRgb?: CampaignPdfRgb;
};

/**
 * Prompt 98 — branded proposal & quote PDF (distinct from the campaign intelligence dossier).
 */
export function renderProposalQuotePdfBytes(
  input: ProposalQuotePdfInput,
  options?: ProposalQuotePdfOptions,
): Uint8Array {
  const primary = options?.primaryRgb ?? DEFAULT_PRIMARY;
  const secondary = options?.secondaryRgb ?? DEFAULT_SECONDARY;
  const pageBg: CampaignPdfRgb = { r: 252, g: 253, b: 255 };
  const ink: CampaignPdfRgb = { r: 30, g: 41, b: 59 };
  const muted: CampaignPdfRgb = { r: 100, g: 116, b: 139 };
  const rule: CampaignPdfRgb = { r: 226, g: 232, b: 240 };

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 54;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const maxW = pageW - margin * 2;
  const footerH = 44;
  let y = margin;
  const bodyLead = 11.5;
  const bodySize = 9.25;

  doc.setProperties({
    title: forPdf(`${input.title} — ${input.company}`),
    subject: forPdf("Commercial proposal"),
    author: forPdf(input.org_line),
  });

  function ensureSpace(need: number) {
    if (y + need > pageH - margin - footerH) {
      doc.addPage();
      doc.setFillColor(pageBg.r, pageBg.g, pageBg.b);
      doc.rect(0, 0, pageW, pageH, "F");
      y = margin;
    }
  }

  function writeBlock(title: string, body: string, titleSize = 11) {
    ensureSpace(28);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(titleSize);
    doc.setTextColor(primary.r, primary.g, primary.b);
    doc.text(forPdf(title), margin, y);
    y += titleSize + 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(bodySize);
    doc.setTextColor(ink.r, ink.g, ink.b);
    for (const line of doc.splitTextToSize(forPdf(body), maxW)) {
      ensureSpace(bodyLead);
      doc.text(line, margin, y);
      y += bodyLead;
    }
    y += 10;
  }

  doc.setFillColor(secondary.r, secondary.g, secondary.b);
  doc.rect(0, 0, pageW, 112, "F");
  doc.setFillColor(primary.r, primary.g, primary.b);
  doc.rect(0, 0, pageW * 0.38, 112, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(forPdf(input.org_line), margin, 48);
  doc.setFontSize(10);
  doc.setTextColor(244, 240, 234);
  doc.text(forPdf("Proposal & commercial quote"), margin, 72);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  const titleLines = doc.splitTextToSize(forPdf(input.title), maxW - 20);
  let ty = 92;
  for (const tl of titleLines.slice(0, 3)) {
    doc.text(tl, margin + 8, ty);
    ty += 16;
  }
  y = 120;

  doc.setFillColor(pageBg.r, pageBg.g, pageBg.b);
  doc.rect(0, 112, pageW, pageH - 112, "F");
  doc.setTextColor(ink.r, ink.g, ink.b);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(forPdf(input.cover_subtitle), margin, y);
  y += 26;
  doc.setFontSize(8.5);
  doc.setTextColor(muted.r, muted.g, muted.b);
  doc.text(
    forPdf(`Prepared for: ${input.contact_name} · ${input.company}`),
    margin,
    y,
  );
  y += 14;
  doc.text(forPdf(`Reference: ${input.thread_id}`), margin, y);
  y += 14;
  doc.text(forPdf(`Generated: ${input.exported_at}`), margin, y);
  y += 28;

  writeBlock("Value proposition", input.value_proposition);
  writeBlock("Investment summary", input.pricing_summary);

  ensureSpace(36);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(primary.r, primary.g, primary.b);
  doc.text(forPdf("Pricing detail"), margin, y);
  y += 16;
  doc.setDrawColor(rule.r, rule.g, rule.b);
  doc.setLineWidth(0.45);
  doc.line(margin, y, pageW - margin, y);
  y += 12;

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  for (const row of input.line_items) {
    ensureSpace(42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(ink.r, ink.g, ink.b);
    doc.text(forPdf(row.label), margin, y);
    doc.text(forPdf(fmt(row.amount_usd)), pageW - margin - 120, y);
    y += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(muted.r, muted.g, muted.b);
    for (const line of doc.splitTextToSize(forPdf(row.detail), maxW - 40)) {
      doc.text(line, margin + 8, y);
      y += 10;
    }
    y += 10;
  }

  writeBlock(
    "ROI outlook",
    `${input.roi_highlight}\n\n${input.roi_section}\n\nAssumptions:\n${input.assumptions.map((a, i) => `${i + 1}. ${a}`).join("\n")}`,
  );

  writeBlock("Next steps", input.next_steps.map((s, i) => `${i + 1}. ${s}`).join("\n"));
  writeBlock("Payment terms", input.payment_terms);
  writeBlock("Validity", `This proposal is presented for discussion and remains valid until ${input.valid_until} unless withdrawn in writing.`);
  writeBlock("Disclaimer", input.disclaimer, 9);

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(muted.r, muted.g, muted.b);
    doc.setFont("helvetica", "normal");
    doc.text(
      forPdf(`${input.org_line} · Proposal · ${input.exported_at}`),
      margin,
      pageH - 28,
    );
    doc.text(forPdf(`Page ${i} / ${totalPages}`), pageW - margin - 72, pageH - 28);
  }

  const buf = doc.output("arraybuffer");
  return new Uint8Array(buf as ArrayBuffer);
}
