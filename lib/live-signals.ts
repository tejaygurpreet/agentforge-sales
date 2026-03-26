import "server-only";

import type { CampaignLiveSignal, CampaignLiveSignalType, Lead, ResearchOutput } from "@/agents/types";
import { defaultRecentNewsInsight } from "@/agents/pipeline-fallbacks";
import { getServerEnv } from "@/lib/env";
import { tavilySearch } from "@/lib/web-research";

function classifySignal(text: string): CampaignLiveSignalType {
  const t = text.toLowerCase();
  if (/(\$|€|£|million|billion|funding|series [a-z]|seed|raised|valuation|round)/i.test(t)) {
    return "funding";
  }
  if (/(hiring|careers|open role|job opening|we're hiring|linkedin.com\/jobs)/i.test(t)) {
    return "hiring";
  }
  if (/(launch|product update|release|announc|introduces|unveil)/i.test(t)) {
    return "company_update";
  }
  if (/(news|report|press|article|according to|said in)/i.test(t)) {
    return "news";
  }
  return "other";
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Prompt 70 — lightweight pass after research: one focused Tavily query when API key exists,
 * else a single discovery-oriented line (no new network when Tavily absent).
 */
export async function fetchLiveSignalsAfterResearch(
  lead: Lead,
  research: ResearchOutput | undefined,
): Promise<CampaignLiveSignal[]> {
  const company = lead.company.trim();
  const env = getServerEnv();
  const key = env.TAVILY_API_KEY?.trim();
  const out: CampaignLiveSignal[] = [];
  const cap = nowIso();

  if (key) {
    const hint =
      research?.industry_inference?.slice(0, 120)?.trim() ??
      research?.executive_summary?.slice(0, 160)?.trim() ??
      "";
    const q = hint
      ? `${company} ${hint} funding hiring news OR product update 2024 2025`
      : `${company} funding OR hiring OR news OR product launch recent`;

    const { lines } = await tavilySearch(q, key, "basic");
    const slice = lines.slice(0, 8);
    for (const raw of slice) {
      const line = raw.replace(/^-\s*\*\*[^*]+\*\*:\s*/, "").trim().slice(0, 520);
      if (line.length < 24) continue;
      const sig: CampaignLiveSignal = {
        signal_type: classifySignal(line),
        signal_text: line,
        captured_at: cap,
      };
      out.push(sig);
      if (out.length >= 6) break;
    }
  }

  if (out.length === 0) {
    const fallback = defaultRecentNewsInsight(lead);
    out.push({
      signal_type: "other",
      signal_text: fallback.slice(0, 520),
      captured_at: cap,
    });
  }

  return out;
}
