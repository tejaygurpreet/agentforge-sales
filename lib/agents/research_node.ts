import "server-only";

import type { Lead, LeadEnrichmentPayload } from "@/agents/types";
import type { WebResearchDigest } from "@/lib/web-research";
import { gatherWebResearchDigest } from "@/lib/web-research";

/**
 * Prompt 82 — Built-in lead enrichment + intelligent sourcing (Tavily / Browserless / Serper).
 * Runs once per lead; structured payload is shown in the dashboard before Start Campaign and
 * fed into the graph via `prefetched_web_digest` so `research_node` does not duplicate the fetch.
 */

function parseMarkdownSections(body: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = body.split("\n");
  let currentTitle = "";
  const buf: string[] = [];
  const flush = () => {
    const t = currentTitle.trim();
    if (t && buf.length) {
      map.set(t, buf.join("\n").trim());
    }
    buf.length = 0;
  };
  for (const line of lines) {
    const m = /^##\s+(.+)$/.exec(line);
    if (m) {
      flush();
      currentTitle = m[1].trim();
      continue;
    }
    if (currentTitle) buf.push(line);
  }
  flush();
  return map;
}

function takeSection(
  sections: Map<string, string>,
  ...titles: string[]
): string {
  for (const t of titles) {
    const v = sections.get(t);
    if (v && v.length > 40) return v.slice(0, 12_000);
  }
  return "";
}

/**
 * Maps live web digest sections into a stable JSON shape for UI + `enriched_data` storage.
 */
export function structureEnrichmentFromWebDigest(
  web: WebResearchDigest,
  lead: Lead,
): LeadEnrichmentPayload {
  const enriched_at = new Date().toISOString();
  if (!web.digest.trim()) {
    return {
      enriched_at,
      provider: web.provider,
      source_urls: web.sources.slice(0, 24),
      company_snapshot: `No third-party intel returned for ${lead.company.trim()}. Add TAVILY_API_KEY (and optionally Browserless) for live company, funding, and hiring signals — the campaign will still run using the research agent.`,
      funding_news: "",
      hiring_signals: "",
      tech_stack: "",
      intent_signals: "",
    };
  }

  const introEnd = web.digest.indexOf("---");
  const body =
    introEnd > 0 ? web.digest.slice(introEnd + 3).trim() : web.digest.trim();
  const sections = parseMarkdownSections(body);

  const company_snapshot =
    takeSection(sections, "Account & market context (live search)") ||
    takeSection(sections, "News and funding (live search)") ||
    body.slice(0, 2_400);

  const funding_news =
    takeSection(
      sections,
      "News, funding, and timing signals",
      "News and funding (live search)",
    ) || "";

  const hiring_signals =
    takeSection(
      sections,
      "Hiring and growth signals",
      "Hiring and open roles (live search)",
    ) || "";

  const tech_stack =
    takeSection(
      sections,
      "Product, engineering, and positioning",
      "Rendered site pages (Browserless — homepage, careers, about, blog when available)",
      "Public HTML pages (direct fetch)",
    ) || "";

  const intent_signals =
    takeSection(
      sections,
      "LinkedIn and public leadership signals",
    ) ||
    [
      funding_news && `Timing / capital: ${funding_news.slice(0, 400)}`,
      hiring_signals && `Hiring: ${hiring_signals.slice(0, 400)}`,
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 4_000);

  return {
    enriched_at,
    provider: web.provider,
    source_urls: web.sources.slice(0, 24),
    company_snapshot: company_snapshot.slice(0, 12_000),
    funding_news: funding_news.slice(0, 12_000),
    hiring_signals: hiring_signals.slice(0, 12_000),
    tech_stack: tech_stack.slice(0, 12_000),
    intent_signals: intent_signals.slice(0, 12_000),
  };
}

export interface LeadEnrichmentStepResult {
  enrichment: LeadEnrichmentPayload;
  web: WebResearchDigest;
}

/**
 * Dedicated enrichment step (Prompt 82): Tavily / Browserless / Serper via `gatherWebResearchDigest`,
 * then structured fields for dashboard + persistence.
 */
export async function runLeadEnrichmentStep(
  lead: Lead,
): Promise<LeadEnrichmentStepResult> {
  const web = await gatherWebResearchDigest(lead);
  const enrichment = structureEnrichmentFromWebDigest(web, lead);
  return { enrichment, web };
}
