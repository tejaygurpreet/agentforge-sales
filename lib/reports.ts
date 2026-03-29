import "server-only";

import type { CampaignClientSnapshot } from "@/agents/types";
import { SDR_VOICE_TONE_VALUES, type SdrVoiceTone } from "@/agents/types";
import { computeCampaignStrength } from "@/lib/campaign-strength";
import { voiceLabelForLead } from "@/lib/sdr-voice";
import type { ReportFiltersPayload } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";

export type ReportCampaignRow = {
  id: string;
  user_id: string;
  thread_id: string;
  lead_name: string;
  company: string;
  email: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  voice_label: string;
  sdr_voice_tone: string;
  composite: number | null;
  final_status: string | null;
};

export type ReportReplyRow = {
  id: string;
  user_id: string;
  thread_id: string | null;
  company: string | null;
  lead_name: string | null;
  reply_preview: string;
  created_at: string;
  sentiment: string | null;
  interest: number | null;
};

export type ReportBundle = {
  campaigns: ReportCampaignRow[];
  replies: ReportReplyRow[];
  filters: ReportFiltersPayload;
};

export type ReportMetricsSummary = {
  campaignCount: number;
  avgComposite: number | null;
  replyCount: number;
  avgReplyInterest: number | null;
  filterSummary: string;
};

const MAX_CAMPAIGN_ROWS = 500;
const MAX_REPLY_ROWS = 500;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function snapshotFromPersistedResults(results: unknown): CampaignClientSnapshot | null {
  if (!isRecord(results)) return null;
  if (typeof results.thread_id !== "string") return null;
  if (!isRecord(results.lead)) return null;
  if (typeof results.final_status !== "string") return null;
  return results as unknown as CampaignClientSnapshot;
}

function leadVoiceKeyFromResults(results: unknown): string {
  const snap = snapshotFromPersistedResults(results);
  if (!snap?.lead) return "default";
  const l = snap.lead as { sdr_voice_tone?: string; custom_voice_id?: string };
  if (typeof l.custom_voice_id === "string" && l.custom_voice_id.trim()) {
    return `custom:${l.custom_voice_id.trim()}`;
  }
  const t = l.sdr_voice_tone;
  if (typeof t === "string" && SDR_VOICE_TONE_VALUES.includes(t as SdrVoiceTone)) {
    return t;
  }
  return "default";
}

function voiceLabelFromResults(results: unknown): string {
  const snap = snapshotFromPersistedResults(results);
  if (!snap?.lead) return "—";
  return voiceLabelForLead(snap.lead);
}

export function defaultReportFilters(): ReportFiltersPayload {
  return {
    dateFrom: null,
    dateTo: null,
    voice: "all",
    memberUserId: "all",
  };
}

export function parseReportFilters(raw: unknown): ReportFiltersPayload {
  const d = defaultReportFilters();
  if (!isRecord(raw)) return d;
  const dateFrom = raw.dateFrom;
  const dateTo = raw.dateTo;
  const voice = raw.voice;
  const memberUserId = raw.memberUserId;
  return {
    dateFrom: typeof dateFrom === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ? dateFrom : null,
    dateTo: typeof dateTo === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? dateTo : null,
    voice: typeof voice === "string" && voice.length > 0 ? voice : "all",
    memberUserId: typeof memberUserId === "string" && memberUserId.length > 0 ? memberUserId : "all",
  };
}

/**
 * Next UTC run aligned to `hour_utc` (and `weekday_utc` for weekly) strictly after `now`.
 */
export function computeNextRunUtc(
  cadence: "daily" | "weekly",
  hourUtc: number,
  weekdayUtc: number | null,
  now: Date = new Date(),
): Date {
  const h = Math.min(23, Math.max(0, Math.floor(hourUtc)));
  const t = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, 0, 0, 0),
  );
  if (cadence === "weekly") {
    const want = weekdayUtc != null ? Math.min(6, Math.max(0, weekdayUtc)) : 1;
    const diff = (want - t.getUTCDay() + 7) % 7;
    t.setUTCDate(t.getUTCDate() + diff);
  }
  while (t <= now) {
    t.setUTCDate(t.getUTCDate() + (cadence === "daily" ? 1 : 7));
  }
  return t;
}

/** After a successful send, advance from the previous scheduled instant. */
export function advanceScheduledNextRun(
  previousNextRunIso: string,
  cadence: "daily" | "weekly",
): string {
  const anchor = new Date(previousNextRunIso);
  if (Number.isNaN(anchor.getTime())) {
    return new Date(Date.now() + (cadence === "daily" ? 86_400_000 : 604_800_000)).toISOString();
  }
  anchor.setUTCDate(anchor.getUTCDate() + (cadence === "daily" ? 1 : 7));
  return anchor.toISOString();
}

function passesVoiceFilter(results: unknown, voice: string): boolean {
  if (voice === "all") return true;
  const key = leadVoiceKeyFromResults(results);
  if (voice === "custom:any") return key.startsWith("custom:");
  return key === voice;
}

export async function fetchReportBundle(
  sb: SupabaseClient,
  memberIds: string[],
  filters: ReportFiltersPayload,
): Promise<ReportBundle> {
  const d = filters;
  const userIds =
    d.memberUserId !== "all" && memberIds.includes(d.memberUserId) ? [d.memberUserId] : [...memberIds];
  if (userIds.length === 0) {
    return { campaigns: [], replies: [], filters: d };
  }

  let campQuery = sb
    .from("campaigns")
    .select(
      "id, user_id, thread_id, lead_name, company, email, status, created_at, completed_at, results",
    )
    .in("user_id", userIds)
    .order("created_at", { ascending: false })
    .limit(MAX_CAMPAIGN_ROWS);

  if (d.dateFrom) {
    campQuery = campQuery.gte("created_at", `${d.dateFrom}T00:00:00.000Z`);
  }
  if (d.dateTo) {
    campQuery = campQuery.lte("created_at", `${d.dateTo}T23:59:59.999Z`);
  }

  const { data: campRaw, error: campErr } = await campQuery;
  if (campErr) {
    console.warn("[AgentForge] fetchReportBundle campaigns", campErr.message);
  }

  const campaignsOut: ReportCampaignRow[] = [];
  for (const row of campRaw ?? []) {
    const r = row as Record<string, unknown>;
    const results = r.results;
    if (!passesVoiceFilter(results, d.voice)) continue;
    const snap = snapshotFromPersistedResults(results);
    const strength = snap ? computeCampaignStrength(snap) : null;
    campaignsOut.push({
      id: String(r.id ?? ""),
      user_id: String(r.user_id ?? ""),
      thread_id: String(r.thread_id ?? ""),
      lead_name: String(r.lead_name ?? ""),
      company: String(r.company ?? ""),
      email: String(r.email ?? ""),
      status: String(r.status ?? ""),
      created_at: String(r.created_at ?? ""),
      completed_at: r.completed_at != null ? String(r.completed_at) : null,
      voice_label: voiceLabelFromResults(results),
      sdr_voice_tone: leadVoiceKeyFromResults(results),
      composite: strength?.composite ?? null,
      final_status: snap?.final_status ?? null,
    });
  }

  let replyQuery = sb
    .from("reply_analyses")
    .select("id, user_id, thread_id, company, lead_name, reply_preview, created_at, sentiment, interest_score, analysis")
    .in("user_id", userIds)
    .order("created_at", { ascending: false })
    .limit(MAX_REPLY_ROWS);

  if (d.dateFrom) {
    replyQuery = replyQuery.gte("created_at", `${d.dateFrom}T00:00:00.000Z`);
  }
  if (d.dateTo) {
    replyQuery = replyQuery.lte("created_at", `${d.dateTo}T23:59:59.999Z`);
  }

  const { data: replyRaw, error: replyErr } = await replyQuery;
  if (replyErr) {
    console.warn("[AgentForge] fetchReportBundle replies", replyErr.message);
  }

  const repliesOut: ReportReplyRow[] = [];
  for (const row of replyRaw ?? []) {
    const r = row as Record<string, unknown>;
    const analysis = r.analysis;
    let interest: number | null = null;
    if (typeof r.interest_score === "number" && Number.isFinite(r.interest_score)) {
      interest = Math.min(10, Math.max(0, Math.round(r.interest_score)));
    } else if (isRecord(analysis) && typeof analysis.interest_level_0_to_10 === "number") {
      interest = Math.min(
        10,
        Math.max(0, Math.round(analysis.interest_level_0_to_10 as number)),
      );
    }
    repliesOut.push({
      id: String(r.id ?? ""),
      user_id: String(r.user_id ?? ""),
      thread_id: r.thread_id != null ? String(r.thread_id) : null,
      company: r.company != null ? String(r.company) : null,
      lead_name: r.lead_name != null ? String(r.lead_name) : null,
      reply_preview: String(r.reply_preview ?? ""),
      created_at: String(r.created_at ?? ""),
      sentiment: r.sentiment != null ? String(r.sentiment) : null,
      interest,
    });
  }

  return { campaigns: campaignsOut, replies: repliesOut, filters: d };
}

export function buildReportMetrics(bundle: ReportBundle): ReportMetricsSummary {
  const { campaigns, replies, filters: f } = bundle;
  const comps = campaigns.map((c) => c.composite).filter((x): x is number => typeof x === "number");
  const avgComposite =
    comps.length > 0 ? Math.round(comps.reduce((a, b) => a + b, 0) / comps.length) : null;
  const interests = replies.map((r) => r.interest).filter((x): x is number => typeof x === "number");
  const avgReplyInterest =
    interests.length > 0
      ? Math.round((interests.reduce((a, b) => a + b, 0) / interests.length) * 10) / 10
      : null;

  const parts: string[] = [];
  if (f.dateFrom || f.dateTo) {
    parts.push(`Dates: ${f.dateFrom ?? "…"} → ${f.dateTo ?? "…"}`);
  } else {
    parts.push("Dates: all time");
  }
  parts.push(`Voice: ${f.voice === "all" ? "all" : f.voice}`);
  parts.push(`Member: ${f.memberUserId === "all" ? "all" : f.memberUserId}`);

  return {
    campaignCount: campaigns.length,
    avgComposite,
    replyCount: replies.length,
    avgReplyInterest,
    filterSummary: parts.join(" · "),
  };
}

function csvEscape(s: string): string {
  const t = s.replace(/\r\n/g, "\n");
  if (/[",\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

export function buildCsvReport(bundle: ReportBundle): string {
  const lines: string[] = [];
  lines.push(
    [
      "section",
      "id",
      "created_at",
      "thread_id",
      "lead_or_company",
      "detail",
      "metric_1",
      "metric_2",
    ].join(","),
  );
  for (const c of bundle.campaigns) {
    lines.push(
      [
        "campaign",
        csvEscape(c.id),
        csvEscape(c.created_at),
        csvEscape(c.thread_id),
        csvEscape(`${c.lead_name} @ ${c.company}`),
        csvEscape(c.voice_label),
        csvEscape(c.composite != null ? String(c.composite) : ""),
        csvEscape(c.final_status ?? ""),
      ].join(","),
    );
  }
  for (const r of bundle.replies) {
    lines.push(
      [
        "reply",
        csvEscape(r.id),
        csvEscape(r.created_at),
        csvEscape(r.thread_id ?? ""),
        csvEscape(`${r.lead_name ?? ""} / ${r.company ?? ""}`),
        csvEscape(r.reply_preview.slice(0, 500)),
        csvEscape(r.interest != null ? String(r.interest) : ""),
        csvEscape(r.sentiment ?? ""),
      ].join(","),
    );
  }
  return lines.join("\n") + "\n";
}

function forPdf(s: string): string {
  return s
    .replace(/\u2013|\u2014/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ");
}

export function buildScheduledReportEmailHtml(
  metrics: ReportMetricsSummary,
  reportTitle: string,
): string {
  return `
  <div style="font-family:system-ui,Segoe UI,sans-serif;line-height:1.5;color:#0f172a">
    <h2 style="margin:0 0 12px">${forPdf(reportTitle)}</h2>
    <p style="margin:0 0 8px;color:#475569">${forPdf(metrics.filterSummary)}</p>
    <table style="border-collapse:collapse;margin-top:16px;font-size:14px">
      <tr><td style="padding:6px 12px;border:1px solid #e2e8f0">Campaigns</td><td style="padding:6px 12px;border:1px solid #e2e8f0">${metrics.campaignCount}</td></tr>
      <tr><td style="padding:6px 12px;border:1px solid #e2e8f0">Avg composite</td><td style="padding:6px 12px;border:1px solid #e2e8f0">${metrics.avgComposite != null ? metrics.avgComposite : "—"}</td></tr>
      <tr><td style="padding:6px 12px;border:1px solid #e2e8f0">Replies in range</td><td style="padding:6px 12px;border:1px solid #e2e8f0">${metrics.replyCount}</td></tr>
      <tr><td style="padding:6px 12px;border:1px solid #e2e8f0">Avg reply interest</td><td style="padding:6px 12px;border:1px solid #e2e8f0">${metrics.avgReplyInterest != null ? metrics.avgReplyInterest : "—"}</td></tr>
    </table>
    <p style="margin-top:20px;font-size:13px;color:#64748b">PDF summary attached. Generated by AgentForge scheduled reports.</p>
  </div>`;
}

/**
 * Compact multi-section PDF for aggregate reporting (not per-campaign dossier).
 */
export function buildAggregatePdfBuffer(
  bundle: ReportBundle,
  metrics: ReportMetricsSummary,
  reportTitle: string,
): ArrayBuffer {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  doc.setProperties({ title: forPdf(reportTitle) });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = margin;
  const line = (text: string, size = 10) => {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(forPdf(text), pageW - margin * 2);
    for (const ln of lines) {
      if (y > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(ln as string, margin, y);
      y += size + 4;
    }
  };

  line(reportTitle, 16);
  y += 6;
  line(metrics.filterSummary, 9);
  y += 8;
  line(
    `Campaigns: ${metrics.campaignCount} · Avg composite: ${metrics.avgComposite ?? "—"} · Replies: ${metrics.replyCount} · Avg interest: ${metrics.avgReplyInterest ?? "—"}`,
    10,
  );
  y += 12;
  line("Campaign rows", 12);
  for (const c of bundle.campaigns.slice(0, 80)) {
    line(
      `${c.created_at.slice(0, 10)} · ${c.lead_name} · ${c.company} · ${c.voice_label} · comp ${c.composite ?? "—"} · ${c.final_status ?? ""}`,
      8,
    );
  }
  if (bundle.campaigns.length > 80) {
    line(`… ${bundle.campaigns.length - 80} more campaigns not shown (see CSV export).`, 8);
  }
  y += 10;
  line("Reply analyses", 12);
  for (const r of bundle.replies.slice(0, 40)) {
    line(
      `${r.created_at.slice(0, 10)} · ${r.company ?? ""} · interest ${r.interest ?? "—"} · ${r.reply_preview.slice(0, 120)}`,
      8,
    );
  }
  if (bundle.replies.length > 40) {
    line(`… ${bundle.replies.length - 40} more replies not shown (see CSV export).`, 8);
  }

  return doc.output("arraybuffer") as ArrayBuffer;
}
