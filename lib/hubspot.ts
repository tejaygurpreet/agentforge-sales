import "server-only";

import type { CampaignClientSnapshot } from "@/agents/types";
import { DEFAULT_BRAND_DISPLAY_NAME } from "@/lib/brand-prompt";
import { buildCampaignSummaryExport } from "@/lib/campaign-summary-export";

const HUBSPOT_API = "https://api.hubapi.com";

/** HubSpot-defined association type IDs (deal↔contact, note↔deal). */
const ASSOC_DEAL_TO_CONTACT = 3;
const ASSOC_NOTE_TO_DEAL = 214;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function splitName(full: string): { first: string; last: string } {
  const t = full.trim();
  if (!t) return { first: "Unknown", last: "Lead" };
  const parts = t.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "." };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

async function hsJson<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  const res = await fetch(`${HUBSPOT_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" && data !== null && "message" in data
        ? String((data as { message: string }).message)
        : text || res.statusText;
    return { ok: false, status: res.status, message: msg };
  }
  return { ok: true, data: data as T };
}

async function searchContactByEmail(
  accessToken: string,
  email: string,
): Promise<string | null> {
  const body = {
    filterGroups: [
      {
        filters: [
          {
            propertyName: "email",
            operator: "EQ",
            value: email,
          },
        ],
      },
    ],
    limit: 1,
    properties: ["email", "firstname", "lastname"],
  };
  const r = await hsJson<{ results?: { id: string }[] }>(
    accessToken,
    "/crm/v3/objects/contacts/search",
    { method: "POST", body: JSON.stringify(body) },
  );
  if (!r.ok) return null;
  const id = r.data.results?.[0]?.id;
  return id ?? null;
}

async function createContact(
  accessToken: string,
  lead: CampaignClientSnapshot["lead"],
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const { first, last } = splitName(lead.name);
  const r = await hsJson<{ id: string }>(accessToken, "/crm/v3/objects/contacts", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        email: lead.email,
        firstname: first,
        lastname: last,
        company: lead.company,
      },
    }),
  });
  if (!r.ok) return { ok: false, message: r.message };
  return { ok: true, id: r.data.id };
}

async function getDefaultDealStage(accessToken: string): Promise<{
  pipelineId: string;
  stageId: string;
} | null> {
  const r = await hsJson<{ results?: { id: string; stages?: { id: string }[] }[] }>(
    accessToken,
    "/crm/v3/pipelines/deals",
    { method: "GET" },
  );
  if (!r.ok || !r.data.results?.length) return null;
  const pipe = r.data.results[0];
  const stage = pipe.stages?.[0];
  if (!pipe.id || !stage?.id) return null;
  return { pipelineId: pipe.id, stageId: stage.id };
}

function estimatedDealAmountUsd(composite: number): string {
  const n = Math.max(500, Math.round(composite * 420));
  return String(n);
}

function buildInsightsNoteHtml(
  snapshot: CampaignClientSnapshot,
  replySnippet: string | null,
  productDisplayName: string,
): string {
  const label = productDisplayName.trim() || DEFAULT_BRAND_DISPLAY_NAME;
  const d = buildCampaignSummaryExport(snapshot, { productLabel: label });
  const lines: string[] = [];
  lines.push(`<h3>${escapeHtml(label)} — campaign insights</h3>`);
  lines.push(`<p><strong>Thread</strong>: ${escapeHtml(d.run.thread_id)}</p>`);
  lines.push(
    `<p><strong>Composite strength</strong>: ${d.campaign_strength.composite}/100 (${escapeHtml(d.campaign_strength.label)})</p>`,
  );
  lines.push(`<p>${escapeHtml(d.campaign_strength.summary)}</p>`);
  if (d.research) {
    lines.push(`<h4>Executive summary</h4><p>${escapeHtml(d.research.executive_summary)}</p>`);
    if (d.research.pain_points?.length) {
      lines.push(`<h4>Pain points</h4><ul>`);
      for (const p of d.research.pain_points) {
        lines.push(`<li>${escapeHtml(p)}</li>`);
      }
      lines.push(`</ul>`);
    }
    if (d.research.bant_snapshot) {
      const b = d.research.bant_snapshot;
      lines.push(`<h4>BANT</h4>`);
      lines.push(
        `<p><strong>Budget</strong> (${escapeHtml(b.budget.confidence)}): ${escapeHtml(b.budget.evidence)}</p>`,
      );
      lines.push(
        `<p><strong>Authority</strong> (${escapeHtml(b.authority.confidence)}): ${escapeHtml(b.authority.evidence)}</p>`,
      );
      lines.push(
        `<p><strong>Need</strong> (${escapeHtml(b.need.confidence)}): ${escapeHtml(b.need.evidence)}</p>`,
      );
      lines.push(
        `<p><strong>Timeline</strong> (${escapeHtml(b.timeline.confidence)}): ${escapeHtml(b.timeline.evidence)}</p>`,
      );
    }
  }
  if (d.qualification) {
    lines.push(`<h4>Qualification</h4>`);
    lines.push(`<p>${escapeHtml(d.qualification.bant_summary)}</p>`);
    lines.push(`<p><strong>Next best action</strong>: ${escapeHtml(d.qualification.next_best_action)}</p>`);
  }
  if (d.outreach) {
    lines.push(`<h4>Email</h4>`);
    lines.push(`<p><strong>Subject</strong>: ${escapeHtml(d.outreach.subject)}</p>`);
    lines.push(
      `<p><strong>Sent via ${escapeHtml(label)}</strong>: ${d.outreach.email_sent ? "Yes" : "Not yet / manual"}</p>`,
    );
  }
  if (replySnippet) {
    lines.push(`<h4>Reply analysis (latest)</h4><pre style="white-space:pre-wrap;font-family:system-ui,sans-serif;font-size:12px">${escapeHtml(replySnippet)}</pre>`);
  }
  lines.push(
    `<p style="color:#64748b;font-size:11px">Exported from ${escapeHtml(label)}</p>`,
  );
  return lines.join("\n");
}

async function createDeal(
  accessToken: string,
  snapshot: CampaignClientSnapshot,
  composite: number,
  stage: { pipelineId: string; stageId: string } | null,
  productDisplayName: string,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const short = (productDisplayName.trim() || DEFAULT_BRAND_DISPLAY_NAME).slice(0, 48);
  const dealname = `${snapshot.lead.company} — ${short}`.slice(0, 255);
  const amount = estimatedDealAmountUsd(composite);
  const desc = [
    `${short} thread: ${snapshot.thread_id}`,
    `Composite score: ${composite}`,
    `Final status: ${snapshot.final_status}`,
  ].join("\n");

  const base: Record<string, string> = {
    dealname,
    amount,
    description: desc.slice(0, 65000),
  };

  if (stage) {
    const withStage = {
      ...base,
      pipeline: stage.pipelineId,
      dealstage: stage.stageId,
    };
    const r = await hsJson<{ id: string }>(accessToken, "/crm/v3/objects/deals", {
      method: "POST",
      body: JSON.stringify({ properties: withStage }),
    });
    if (r.ok) return { ok: true, id: r.data.id };
  }

  const r2 = await hsJson<{ id: string }>(accessToken, "/crm/v3/objects/deals", {
    method: "POST",
    body: JSON.stringify({ properties: base }),
  });
  if (!r2.ok) return { ok: false, message: r2.message };
  return { ok: true, id: r2.data.id };
}

async function associateDealContact(
  accessToken: string,
  dealId: string,
  contactId: string,
): Promise<{ ok: false; message: string } | { ok: true }> {
  const r = await hsJson<unknown>(accessToken, "/crm/v4/associations/deals/contacts/batch/create", {
    method: "POST",
    body: JSON.stringify({
      inputs: [
        {
          from: { id: dealId },
          to: { id: contactId },
          types: [
            {
              associationCategory: "HUBSPOT_DEFINED",
              associationTypeId: ASSOC_DEAL_TO_CONTACT,
            },
          ],
        },
      ],
    }),
  });
  if (!r.ok) return { ok: false, message: r.message };
  return { ok: true };
}

async function uploadPdfFile(
  accessToken: string,
  pdfBytes: ArrayBuffer,
  filename: string,
): Promise<{ ok: true; fileId: string } | { ok: false; message: string }> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([pdfBytes], { type: "application/pdf" }),
    filename.replace(/[^\w.\-]+/g, "_"),
  );
  form.append(
    "options",
    JSON.stringify({
      access: "PRIVATE",
      duplicateValidationStrategy: "NONE",
      duplicateValidationScope: "ENTIRE_PORTAL",
    }),
  );

  const res = await fetch(`${HUBSPOT_API}/files/v3/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" && data !== null && "message" in data
        ? String((data as { message: string }).message)
        : text || res.statusText;
    return { ok: false, message: msg };
  }
  const id = parseHubSpotFileId(data);
  if (!id) return { ok: false, message: "HubSpot file upload returned no id." };
  return { ok: true, fileId: id };
}

function parseHubSpotFileId(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (typeof o.id === "string") return o.id;
  const objects = o.objects;
  if (Array.isArray(objects) && objects[0] && typeof objects[0] === "object" && objects[0] !== null) {
    const first = objects[0] as Record<string, unknown>;
    if (typeof first.id === "string") return first.id;
  }
  return null;
}

async function createNoteOnDeal(
  accessToken: string,
  dealId: string,
  htmlBody: string,
  attachmentFileId?: string,
): Promise<{ ok: false; message: string } | { ok: true }> {
  const ts = String(Date.now());
  const props: Record<string, string> = {
    hs_timestamp: ts,
    hs_note_body: htmlBody,
  };
  if (attachmentFileId) {
    props.hs_attachment_ids = attachmentFileId;
  }

  const r = await hsJson<{ id: string }>(accessToken, "/crm/v3/objects/notes", {
    method: "POST",
    body: JSON.stringify({ properties: props }),
  });
  if (!r.ok) return { ok: false, message: r.message };
  const noteId = r.data.id;

  const a = await hsJson<unknown>(accessToken, "/crm/v4/associations/notes/deals/batch/create", {
    method: "POST",
    body: JSON.stringify({
      inputs: [
        {
          from: { id: noteId },
          to: { id: dealId },
          types: [
            {
              associationCategory: "HUBSPOT_DEFINED",
              associationTypeId: ASSOC_NOTE_TO_DEAL,
            },
          ],
        },
      ],
    }),
  });
  if (!a.ok) return { ok: false, message: a.message };
  return { ok: true };
}

export type HubSpotSyncResult =
  | { ok: true; dealId: string; contactId: string }
  | { ok: false; error: string };

/**
 * Creates/updates CRM records: Contact, Deal, associations, dossier note + PDF attachment, optional reply text.
 */
export async function syncCampaignToHubSpot(params: {
  accessToken: string;
  snapshot: CampaignClientSnapshot;
  pdfBytes: ArrayBuffer;
  pdfFilename: string;
  replyAnalysisText: string | null;
  /** Prompt 79 — CRM copy; defaults from snapshot or AgentForge Sales. */
  productDisplayName?: string;
}): Promise<HubSpotSyncResult> {
  const { accessToken, snapshot, pdfBytes, pdfFilename, replyAnalysisText } = params;
  const productDisplayName =
    params.productDisplayName?.trim() ||
    snapshot.brand_display_name?.trim() ||
    DEFAULT_BRAND_DISPLAY_NAME;
  const summary = buildCampaignSummaryExport(snapshot, { productLabel: productDisplayName });
  const composite = summary.campaign_strength.composite;

  const contactIdExisting = await searchContactByEmail(accessToken, snapshot.lead.email);
  let contactId: string;
  if (contactIdExisting) {
    contactId = contactIdExisting;
  } else {
    const c = await createContact(accessToken, snapshot.lead);
    if (!c.ok) return { ok: false, error: `HubSpot contact: ${c.message}` };
    contactId = c.id;
  }

  const stage = await getDefaultDealStage(accessToken);
  const deal = await createDeal(accessToken, snapshot, composite, stage, productDisplayName);
  if (!deal.ok) {
    return { ok: false, error: `HubSpot deal: ${deal.message}` };
  }
  const dealId = deal.id;

  const assoc = await associateDealContact(accessToken, dealId, contactId);
  if (!assoc.ok) {
    return { ok: false, error: `HubSpot deal↔contact link: ${assoc.message}` };
  }

  const insightsHtml = buildInsightsNoteHtml(snapshot, replyAnalysisText, productDisplayName);
  const note1 = await createNoteOnDeal(accessToken, dealId, insightsHtml);
  if (!note1.ok) {
    return { ok: false, error: `HubSpot insights note: ${note1.message}` };
  }

  const up = await uploadPdfFile(accessToken, pdfBytes, pdfFilename);
  if (!up.ok) {
    return { ok: false, error: `HubSpot PDF upload: ${up.message}` };
  }

  const pdfNoteHtml = `<h3>${escapeHtml(productDisplayName)} dossier (PDF)</h3><p>Full branded campaign export is attached.</p>`;
  const note2 = await createNoteOnDeal(accessToken, dealId, pdfNoteHtml, up.fileId);
  if (!note2.ok) {
    return { ok: false, error: `HubSpot PDF note: ${note2.message}` };
  }

  return { ok: true, dealId, contactId };
}
