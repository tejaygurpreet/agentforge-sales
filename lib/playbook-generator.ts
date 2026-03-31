import "server-only";

import { z } from "zod";
import type { CampaignClientSnapshot } from "@/agents/types";
import {
  extractPlaybookNurtureSignals,
  type PlaybookNurtureSignals,
} from "@/lib/agents/nurture_node";
import {
  extractPlaybookQualificationSignals,
  suggestResponsesForPatterns,
  type PlaybookQualificationSignals,
} from "@/lib/agents/qualification_node";
import { invokeWithGroqRateLimitResilience } from "@/lib/agent-model";
import { getServiceRoleSupabaseOrNull } from "@/lib/supabase-server";
import { jsPDF } from "jspdf";

const PLAYBOOK_TEMPERATURE = 0.28;

export const salesPlaybookSchema = z.object({
  title: z.string().min(8).max(200),
  executive_summary: z.string().min(40).max(3500),
  account_context: z.string().min(20).max(4000),
  discovery_playbook: z.array(z.string().min(8)).min(3).max(14),
  objection_handling: z
    .array(
      z.object({
        objection_theme: z.string().min(4).max(220),
        recommended_response: z.string().min(12).max(1600),
      }),
    )
    .min(1)
    .max(12),
  nurture_cadence: z.string().min(20).max(3500),
  competitor_notes: z.string().max(3000).optional(),
  win_criteria: z.array(z.string().min(8)).min(2).max(10),
  internal_reference: z.string().min(12).max(2500),
});

export type SalesPlaybookDocument = z.infer<typeof salesPlaybookSchema>;

const salesPlaybookLlmSchema = z
  .object({
    title: z.string().optional(),
    executive_summary: z.string().optional(),
    account_context: z.string().optional(),
    discovery_playbook: z.array(z.string()).optional(),
    objection_handling: z
      .array(
        z.object({
          objection_theme: z.string().optional(),
          recommended_response: z.string().optional(),
        }),
      )
      .optional(),
    nurture_cadence: z.string().optional(),
    competitor_notes: z.string().optional(),
    win_criteria: z.array(z.string()).optional(),
    internal_reference: z.string().optional(),
  })
  .passthrough();

export type PlaybookGeneratorContext = {
  qual: PlaybookQualificationSignals;
  nurture: PlaybookNurtureSignals;
  research_excerpt: string | null;
  outreach_angle: string | null;
  competitor_excerpt: string | null;
  final_status: string;
  lead_company: string;
  lead_name: string;
};

export function buildPlaybookGeneratorContext(
  snapshot: CampaignClientSnapshot,
): PlaybookGeneratorContext {
  const r = snapshot.research_output;
  const o = snapshot.outreach_output;
  const research_excerpt = r
    ? [
        r.executive_summary?.slice(0, 1200),
        r.icp_fit_summary?.slice(0, 800),
      ]
        .filter(Boolean)
        .join("\n\n")
    : null;
  const outreach_angle = o?.primary_angle?.trim()
    ? o.primary_angle.trim().slice(0, 800)
    : o?.subject?.trim()
      ? `Subject: ${o.subject.slice(0, 200)}`
      : null;
  const cl = r?.competitor_landscape;
  const competitor_excerpt = cl?.account_positioning?.trim()
    ? `${cl.account_positioning.slice(0, 1200)}\n${cl.competitors
        .slice(0, 4)
        .map((c) => `${c.name}: ${c.suggested_win_message.slice(0, 200)}`)
        .join("\n")}`.slice(0, 2500)
    : null;

  return {
    qual: extractPlaybookQualificationSignals(snapshot),
    nurture: extractPlaybookNurtureSignals(snapshot),
    research_excerpt,
    outreach_angle,
    competitor_excerpt,
    final_status: snapshot.final_status,
    lead_company: snapshot.lead.company?.trim() || "Account",
    lead_name: snapshot.lead.name?.trim() || "Contact",
  };
}

function forPdf(s: string): string {
  return s
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ");
}

/** Deterministic playbook when LLM is unavailable or fails validation. */
export function buildDeterministicSalesPlaybook(
  snapshot: CampaignClientSnapshot,
): SalesPlaybookDocument {
  const ctx = buildPlaybookGeneratorContext(snapshot);
  const company = ctx.lead_company;
  const discovery = [
    `Confirm the economic buyer and champion map for ${company} before expanding scope.`,
    `Anchor discovery on one operational metric ${ctx.lead_name.split(/\s+/)[0] ?? "they"} already reports.`,
    `Surface procurement path, security review needs, and competing initiatives this quarter.`,
    `Ask what proof bar clears a pilot — and what would park the thread past this half.`,
  ];
  const objections: SalesPlaybookDocument["objection_handling"] = [];
  for (const o of ctx.qual.top_objections.slice(0, 6)) {
    objections.push({
      objection_theme: o.objection.slice(0, 200),
      recommended_response: (o.reasoning?.trim() || ctx.qual.next_best_action || "")
        .slice(0, 800) || "Acknowledge, clarify constraint, propose a smaller proof step.",
    });
  }
  const coach = suggestResponsesForPatterns(ctx.qual.detected_pattern_ids);
  for (const c of coach.slice(0, 3)) {
    if (objections.length >= 10) break;
    objections.push({
      objection_theme: c.pattern.replace(/_/g, " "),
      recommended_response: c.body.slice(0, 1200),
    });
  }
  if (objections.length === 0) {
    objections.push({
      objection_theme: "Timing / priority",
      recommended_response:
        "Respect the pause; offer a crisp leave-behind and one concrete time to revisit.",
    });
  }

  const nurtureCadence =
    ctx.nurture.sequence_summary ||
    ctx.nurture.smart_follow_rationale ||
    ctx.nurture.follow_up_steps
      .map(
        (s) =>
          `Day ${s.day_offset} · ${s.channel}: ${s.summary.slice(0, 220)} — value add: ${s.value_add_idea.slice(0, 140)}`,
      )
      .join("\n") ||
    "Default: space touches by buyer responsiveness; alternate channels when email fatigues.";

  return salesPlaybookSchema.parse({
    title: `Sales playbook — ${company}`,
    executive_summary: [
      `Account: ${company} (${ctx.final_status}).`,
      ctx.research_excerpt?.slice(0, 900) ||
        "Research block thin — lead with falsifiable hypotheses on the next live call.",
      ctx.qual.bant_summary ? `BANT read: ${ctx.qual.bant_summary.slice(0, 600)}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    account_context: [
      ctx.research_excerpt?.slice(0, 1800) || `Position ${company} with one wedge metric and a clear rollout owner.`,
      ctx.outreach_angle ? `First-touch angle: ${ctx.outreach_angle}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    discovery_playbook: discovery,
    objection_handling: objections,
    nurture_cadence: nurtureCadence.slice(0, 3200),
    competitor_notes: ctx.competitor_excerpt?.slice(0, 2800) || undefined,
    win_criteria: [
      "Named executive sponsor plus a dated pilot success metric.",
      "Clear procurement path and security review owner identified.",
      ctx.qual.next_best_action?.slice(0, 400) || "Next step: book a working session with data access.",
    ].filter(Boolean),
    internal_reference: [
      `Qualification score (pipeline): ${ctx.qual.qualification_score ?? "n/a"}.`,
      ctx.nurture.reply_interest_0_to_10 != null
        ? `Reply-interest signal (follow-up engine): ${ctx.nurture.reply_interest_0_to_10}/10.`
        : "",
    ]
      .filter(Boolean)
      .join(" "),
  });
}

export async function generateSalesPlaybookWithAi(
  snapshot: CampaignClientSnapshot,
): Promise<SalesPlaybookDocument> {
  const ctx = buildPlaybookGeneratorContext(snapshot);
  const system = `You are AgentForge Sales — principal GTM strategist. Output ONE JSON object only. No markdown.
Synthesize a practical internal sales playbook: discovery moves, objection talk-tracks, nurture cadence notes, and win criteria.
Ground every line in the INPUT JSON — do not invent customers, logos, or confidential facts. Use professional tone.`;

  const human = `INPUT (campaign snapshot context):
${JSON.stringify(ctx, null, 2).slice(0, 28_000)}

Return JSON keys: title, executive_summary, account_context, discovery_playbook (string array 3-10), objection_handling (array of { objection_theme, recommended_response }), nurture_cadence (string), competitor_notes (optional string), win_criteria (string array 2-8), internal_reference (string — sync notes for reps).`;

  try {
    const { value: raw } = await invokeWithGroqRateLimitResilience(
      "playbook_generator",
      PLAYBOOK_TEMPERATURE,
      (m) =>
        m
          .withStructuredOutput(salesPlaybookLlmSchema, { name: "sales_playbook" })
          .invoke(`${system}\n\n---\n${human}`),
    );
    const lax = salesPlaybookLlmSchema.safeParse(raw);
    if (!lax.success) {
      return buildDeterministicSalesPlaybook(snapshot);
    }
    const merged = buildDeterministicSalesPlaybook(snapshot);
    const o = lax.data;
    const patched: Partial<SalesPlaybookDocument> = {
      title: o.title?.trim() || merged.title,
      executive_summary: o.executive_summary?.trim() || merged.executive_summary,
      account_context: o.account_context?.trim() || merged.account_context,
      discovery_playbook:
        o.discovery_playbook?.filter((s) => s.trim().length > 6).slice(0, 14) ||
        merged.discovery_playbook,
      objection_handling:
        o.objection_handling
          ?.map((row) => ({
            objection_theme: `${row.objection_theme ?? ""}`.slice(0, 220) || "General objection",
            recommended_response: `${row.recommended_response ?? ""}`.slice(0, 1600) || merged.objection_handling[0]!.recommended_response,
          }))
          .filter((r) => r.objection_theme.length > 2) || merged.objection_handling,
      nurture_cadence: o.nurture_cadence?.trim() || merged.nurture_cadence,
      competitor_notes: o.competitor_notes?.trim() || merged.competitor_notes,
      win_criteria: o.win_criteria?.filter((s) => s.trim().length > 4).slice(0, 10) || merged.win_criteria,
      internal_reference: o.internal_reference?.trim() || merged.internal_reference,
    };
    const parsed = salesPlaybookSchema.safeParse({ ...merged, ...patched });
    return parsed.success ? parsed.data : merged;
  } catch {
    return buildDeterministicSalesPlaybook(snapshot);
  }
}

export type KnowledgeEntryDraft = {
  entry_type: "objection" | "nurture" | "research" | "win" | "account";
  title: string;
  body: string;
  tags: string[];
};

/** Derives KB rows from campaign outputs (no LLM). */
export function deriveKnowledgeBaseEntriesFromSnapshot(
  snapshot: CampaignClientSnapshot,
  threadId: string,
): KnowledgeEntryDraft[] {
  const ctx = buildPlaybookGeneratorContext(snapshot);
  const out: KnowledgeEntryDraft[] = [];
  const company = ctx.lead_company.slice(0, 120);

  if (ctx.research_excerpt?.trim()) {
    out.push({
      entry_type: "research",
      title: `Research snapshot — ${company}`,
      body: ctx.research_excerpt.slice(0, 4000),
      tags: ["research", threadId.slice(0, 12)],
    });
  }
  for (const o of ctx.qual.top_objections.slice(0, 5)) {
    out.push({
      entry_type: "objection",
      title: `Objection — ${o.objection.slice(0, 80)}`,
      body: [o.objection, o.reasoning].filter(Boolean).join("\n\n").slice(0, 2000),
      tags: ctx.qual.detected_pattern_ids.map((id) => String(id)).slice(0, 4),
    });
  }
  if (ctx.nurture.sequence_summary?.trim()) {
    out.push({
      entry_type: "nurture",
      title: `Nurture plan — ${company}`,
      body: ctx.nurture.sequence_summary.slice(0, 3500),
      tags: ["nurture", "cadence"],
    });
  }
  if (ctx.qual.next_best_action?.trim()) {
    out.push({
      entry_type: "win",
      title: `Next best action — ${company}`,
      body: ctx.qual.next_best_action.slice(0, 1500),
      tags: ["nba", "qualification"],
    });
  }
  return out.slice(0, 24);
}

export async function appendKnowledgeEntriesFromCampaignSave(params: {
  userId: string;
  workspaceId: string;
  threadId: string;
  snapshot: CampaignClientSnapshot;
}): Promise<void> {
  const sb = getServiceRoleSupabaseOrNull();
  if (!sb) return;
  const fin = params.snapshot.final_status;
  if (fin !== "completed" && fin !== "completed_with_errors") return;

  const drafts = deriveKnowledgeBaseEntriesFromSnapshot(params.snapshot, params.threadId);
  if (drafts.length === 0) return;

  const meta = { source: "campaign_sync", thread_id: params.threadId };

  const del = await sb
    .from("knowledge_base_entries")
    .delete()
    .eq("workspace_id", params.workspaceId)
    .eq("source_thread_id", params.threadId)
    .contains("metadata", { source: "campaign_sync" });

  if (del.error && !/relation|does not exist|column|schema/i.test(`${del.error.message}`)) {
    console.warn("[AgentForge] knowledge_base_entries delete", del.error.message);
  }

  const rows = drafts.map((d) => ({
    workspace_id: params.workspaceId,
    user_id: params.userId,
    source_thread_id: params.threadId,
    entry_type: d.entry_type,
    title: d.title.slice(0, 300),
    body: d.body,
    tags: d.tags.map((t) => t.slice(0, 64)).slice(0, 12),
    metadata: meta,
  }));

  const { error } = await sb.from("knowledge_base_entries").insert(rows);
  if (error && /relation|does not exist|column|schema/i.test(`${error.message}`)) {
    return;
  }
  if (error) {
    console.warn("[AgentForge] knowledge_base_entries insert", error.message);
  }
}

function drawPdfSection(
  doc: InstanceType<typeof jsPDF>,
  margin: number,
  maxW: number,
  yRef: { y: number },
  title: string,
  body: string,
  pageH: number,
  footer: number,
) {
  const bodySize = 9;
  const lead = 11.5;
  const newPage = () => {
    doc.addPage();
    yRef.y = margin;
  };
  const ensure = (need: number) => {
    if (yRef.y + need > pageH - footer) newPage();
  };
  ensure(24);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(forPdf(title), margin, yRef.y);
  yRef.y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(bodySize);
  for (const line of doc.splitTextToSize(forPdf(body), maxW)) {
    ensure(lead);
    doc.text(line, margin, yRef.y);
    yRef.y += lead;
  }
  yRef.y += 8;
}

/** Client + server: PDF bytes for a saved playbook document. */
export function renderSalesPlaybookPdfBytes(
  playbook: SalesPlaybookDocument,
  meta: { company: string; threadId: string; exportedAt: string },
): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 54;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const maxW = pageW - margin * 2;
  const footer = 48;
  const yRef = { y: margin };

  doc.setProperties({
    title: forPdf(`Playbook — ${meta.company}`),
    subject: forPdf("Internal sales playbook"),
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(forPdf(playbook.title), margin, yRef.y);
  yRef.y += 28;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    forPdf(`${meta.company}  |  ${meta.threadId}  |  ${meta.exportedAt}`),
    margin,
    yRef.y,
  );
  yRef.y += 22;

  drawPdfSection(doc, margin, maxW, yRef, "Executive summary", playbook.executive_summary, pageH, footer);
  drawPdfSection(doc, margin, maxW, yRef, "Account context", playbook.account_context, pageH, footer);
  drawPdfSection(
    doc,
    margin,
    maxW,
    yRef,
    "Discovery playbook",
    playbook.discovery_playbook.map((s, i) => `${i + 1}. ${s}`).join("\n"),
    pageH,
    footer,
  );
  drawPdfSection(
    doc,
    margin,
    maxW,
    yRef,
    "Objection handling",
    playbook.objection_handling
      .map((o) => `• ${o.objection_theme}\n  ${o.recommended_response}`)
      .join("\n\n"),
    pageH,
    footer,
  );
  drawPdfSection(doc, margin, maxW, yRef, "Nurture cadence", playbook.nurture_cadence, pageH, footer);
  if (playbook.competitor_notes?.trim()) {
    drawPdfSection(doc, margin, maxW, yRef, "Competitive notes", playbook.competitor_notes, pageH, footer);
  }
  drawPdfSection(
    doc,
    margin,
    maxW,
    yRef,
    "Win criteria",
    playbook.win_criteria.map((s, i) => `${i + 1}. ${s}`).join("\n"),
    pageH,
    footer,
  );
  drawPdfSection(doc, margin, maxW, yRef, "Internal reference", playbook.internal_reference, pageH, footer);

  const buf = doc.output("arraybuffer");
  return new Uint8Array(buf as ArrayBuffer);
}
