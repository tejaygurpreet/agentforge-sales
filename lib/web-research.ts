import "server-only";

import type { Lead } from "@/agents/types";
import { getServerEnv } from "@/lib/env";

export type WebResearchDigest = {
  /** Markdown-style block for the research LLM (may be empty). */
  digest: string;
  /** Human-readable source labels (URLs or provider names). */
  sources: string[];
  /** Which live path supplied data (for logs). */
  provider: "tavily" | "serper" | "browserless_fetch" | "direct_fetch" | "none";
};

const FETCH_TIMEOUT_MS = 14_000;
const MAX_DIGEST_CHARS = 9_500;
const MAX_PAGE_CHARS = 8_500;
const BROWSERLESS_MAX_URLS = 4;

function emailDomain(email: string): string | null {
  const m = /^[^\s@]+@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/.exec(email.trim());
  return m ? m[1].toLowerCase() : null;
}

const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "pm.me",
]);

/**
 * Prompt 157 — Prefer corporate email domain; otherwise guess a domain from company name so Browserless
 * and direct fetch can still run when the lead uses Gmail etc.
 */
export function resolveResearchDomain(lead: Lead): string | null {
  const fromEmail = emailDomain(lead.email);
  if (fromEmail && !PERSONAL_EMAIL_DOMAINS.has(fromEmail)) {
    return fromEmail;
  }
  const company = lead.company.trim();
  if (company.length < 2) return null;
  const slug = company
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^(the|inc|llc|ltd|corp|corporation|company|co)$/g, "");
  if (slug.length < 2) return null;
  return `${slug}.com`;
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchTextWithTimeout(
  url: string,
  maxBytes: number,
): Promise<{ text: string; ok: boolean }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (compatible; AgentForgeResearch/1.0) AppleWebKit/537.36 Chrome/120.0.0.0",
      },
      redirect: "follow",
      cache: "no-store",
    });
    if (!res.ok) return { text: "", ok: false };
    const buf = await res.arrayBuffer();
    const slice = buf.byteLength > maxBytes ? buf.slice(0, maxBytes) : buf;
    const text = new TextDecoder("utf-8", { fatal: false }).decode(slice);
    return { text, ok: true };
  } catch {
    return { text: "", ok: false };
  } finally {
    clearTimeout(t);
  }
}

async function tryDirectPageSnippets(domain: string): Promise<{ text: string; urls: string[] }> {
  const urls = [
    `https://${domain}/careers`,
    `https://${domain}/jobs`,
    `https://${domain}/about`,
    `https://${domain}/company`,
    `https://www.${domain}/careers`,
    `https://www.${domain}/about`,
  ];
  const chunks: string[] = [];
  const used: string[] = [];
  for (const url of urls) {
    const { text, ok } = await fetchTextWithTimeout(url, 400_000);
    if (!ok || !text) continue;
    const plain = stripHtmlToText(text).slice(0, MAX_PAGE_CHARS);
    if (plain.length < 80) continue;
    chunks.push(`[${url}]\n${plain}`);
    used.push(url);
    if (chunks.length >= 2) break;
  }
  return { text: chunks.join("\n\n---\n\n"), urls: used };
}

/** Prompt 70 — exported for live-signals module (Tavily-backed post-research pack). */
export async function tavilySearch(
  query: string,
  apiKey: string,
  depth: "basic" | "advanced" = "basic",
): Promise<{ lines: string[]; urls: string[] }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: depth,
        max_results: depth === "advanced" ? 8 : 6,
        include_answer: true,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { lines: [], urls: [] };
    const data = (await res.json()) as {
      answer?: string;
      results?: { title?: string; url?: string; content?: string }[];
    };
    const urls: string[] = [];
    const lines: string[] = [];
    if (data.answer?.trim()) lines.push(`Summary: ${data.answer.trim()}`);
    for (const r of data.results ?? []) {
      if (!r.content?.trim()) continue;
      const title = r.title?.trim() || "Result";
      const u = r.url?.trim() || "";
      if (u) urls.push(u);
      lines.push(`- **${title}**${u ? ` (${u})` : ""}: ${r.content.trim().slice(0, 560)}`);
    }
    return { lines, urls };
  } catch {
    return { lines: [], urls: [] };
  } finally {
    clearTimeout(t);
  }
}

async function serperSearch(query: string, apiKey: string): Promise<{ lines: string[]; urls: string[] }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify({ q: query, num: 10 }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { lines: [], urls: [] };
    const data = (await res.json()) as {
      organic?: { title?: string; link?: string; snippet?: string }[];
      news?: { title?: string; link?: string; snippet?: string }[];
    };
    const lines: string[] = [];
    const urls: string[] = [];
    const rows = [...(data.news ?? []).slice(0, 5), ...(data.organic ?? []).slice(0, 7)];
    for (const r of rows) {
      if (!r.snippet?.trim()) continue;
      const title = r.title?.trim() || "Hit";
      const link = r.link?.trim() || "";
      if (link) urls.push(link);
      lines.push(`- **${title}**${link ? ` (${link})` : ""}: ${r.snippet.trim()}`);
    }
    return { lines, urls };
  } catch {
    return { lines: [], urls: [] };
  } finally {
    clearTimeout(t);
  }
}

/** Browserless /content — rendered HTML for a single URL (optional). */
async function browserlessRenderedText(
  pageUrl: string,
  token: string,
  baseUrl: string,
): Promise<{ text: string; label: string } | null> {
  const endpoint = `${baseUrl.replace(/\/$/, "")}/content?token=${encodeURIComponent(token)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: pageUrl }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const html = await res.text();
    const plain = stripHtmlToText(html).slice(0, MAX_PAGE_CHARS);
    if (plain.length < 60) return null;
    return { text: plain, label: pageUrl };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function uniqueUrlsForDomain(domain: string): string[] {
  const d = domain.replace(/^www\./, "");
  const candidates = [
    `https://${d}`,
    `https://www.${d}`,
    `https://www.${d}/careers`,
    `https://${d}/careers`,
    `https://www.${d}/jobs`,
    `https://${d}/jobs`,
    `https://www.${d}/about`,
    `https://${d}/about`,
    `https://www.${d}/blog`,
    `https://${d}/blog`,
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of candidates) {
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out.slice(0, BROWSERLESS_MAX_URLS + 2);
}

async function browserlessDeepFetch(
  domain: string,
  token: string,
  baseUrl: string,
): Promise<{ sections: string[]; sources: string[] }> {
  const urls = uniqueUrlsForDomain(domain);
  const sections: string[] = [];
  const sources: string[] = [];
  let count = 0;
  for (const url of urls) {
    if (count >= BROWSERLESS_MAX_URLS) break;
    const r = await browserlessRenderedText(url, token, baseUrl);
    if (!r) continue;
    sections.push(`**${r.label}**\n${r.text}`);
    sources.push(r.label);
    count += 1;
  }
  return { sections, sources };
}

/**
 * Gathers live web context before research LLM (Prompt 45 + 50).
 * Layers: Tavily/Serper (news, funding, jobs, stack signals) + Browserless (rendered pages) + direct fetch.
 */
export async function gatherWebResearchDigest(lead: Lead): Promise<WebResearchDigest> {
  const env = getServerEnv();
  const company = lead.company.trim();
  const first = lead.name.split(/\s+/)[0] ?? "";
  const domain = resolveResearchDomain(lead);

  const sources: string[] = [];
  const sections: { title: string; body: string }[] = [];
  let provider: WebResearchDigest["provider"] = "none";

  const pushSection = (title: string, body: string, src: string[]) => {
    const t = body.trim();
    /** Prompt 157 — allow shorter Tavily snippets so preview still populates when answers are brief. */
    if (t.length < 20) return;
    sections.push({ title, body: t });
    sources.push(...src);
  };

  if (env.TAVILY_API_KEY?.trim()) {
    const key = env.TAVILY_API_KEY.trim();
    const qNews = `${company} news funding Series investment round 2024 2025`;
    const qHire = `${company} careers jobs hiring engineering sales`;
    const qTech = `${company} technology stack engineering blog product launch`;
    const qLinked = `${company} LinkedIn company hiring leadership post update`;
    const broad = `${company} company ${first}`.trim();

    const [deep, news, hire, tech, linked] = await Promise.all([
      tavilySearch(broad, key, "advanced"),
      tavilySearch(qNews, key, "basic"),
      tavilySearch(qHire, key, "basic"),
      tavilySearch(qTech, key, "basic"),
      tavilySearch(qLinked, key, "basic"),
    ]);

    if (deep.lines.length) {
      pushSection("Account & market context (live search)", deep.lines.join("\n"), deep.urls);
      provider = "tavily";
    }
    if (news.lines.length) {
      pushSection("News, funding, and timing signals", news.lines.join("\n"), news.urls);
      if (provider === "none") provider = "tavily";
    }
    if (hire.lines.length) {
      pushSection("Hiring and growth signals", hire.lines.join("\n"), hire.urls);
      if (provider === "none") provider = "tavily";
    }
    if (tech.lines.length) {
      pushSection("Product, engineering, and positioning", tech.lines.join("\n"), tech.urls);
      if (provider === "none") provider = "tavily";
    }
    if (linked.lines.length) {
      pushSection(
        "LinkedIn and public leadership signals",
        linked.lines.join("\n"),
        linked.urls,
      );
      if (provider === "none") provider = "tavily";
    }
  }

  if (env.SERPER_API_KEY?.trim() && sections.length === 0) {
    const key = env.SERPER_API_KEY.trim();
    const q1 = `${company} news OR funding OR raised`;
    const q2 = `${company} jobs OR careers site:linkedin.com OR site:greenhouse.io OR site:lever.co`;
    const [a, b] = await Promise.all([serperSearch(q1, key), serperSearch(q2, key)]);
    if (a.lines.length) {
      pushSection("News and funding (live search)", a.lines.join("\n"), a.urls);
      provider = "serper";
    }
    if (b.lines.length) {
      pushSection("Hiring and open roles (live search)", b.lines.join("\n"), b.urls);
      if (provider === "none") provider = "serper";
    }
  }

  if (domain) {
    if (env.BROWSERLESS_TOKEN?.trim() && env.BROWSERLESS_BASE_URL?.trim()) {
      const { sections: bs, sources: bl } = await browserlessDeepFetch(
        domain,
        env.BROWSERLESS_TOKEN.trim(),
        env.BROWSERLESS_BASE_URL.trim(),
      );
      if (bs.length) {
        pushSection(
          "Rendered site pages (Browserless — homepage, careers, about, blog when available)",
          bs.join("\n\n---\n\n"),
          bl,
        );
        if (provider === "none") provider = "browserless_fetch";
      }
    }

    const direct = await tryDirectPageSnippets(domain);
    if (direct.text.length > 100) {
      pushSection("Public HTML pages (direct fetch)", direct.text, direct.urls);
      if (provider === "none") provider = "direct_fetch";
    }
  }

  if (!sections.length) {
    return { digest: "", sources: [], provider: "none" };
  }

  const intro = [
    "Use the material below as **live, time-stamped context** only where it clearly applies to **this** company.",
    "Fold specific facts into executive summary, recent_news_or_funding_summary, pain_points, messaging_angles, and (downstream) nurture — in **plain sentences**, never as raw bullet dumps or section labels.",
    "If a line does not apply, ignore it. Never claim you had no web access when this block is present.",
  ].join(" ");

  const body = sections
    .map((s) => `## ${s.title}\n\n${s.body}`)
    .join("\n\n---\n\n");

  let digest = `${intro}\n\n---\n\n${body}`.slice(0, MAX_DIGEST_CHARS);
  if (digest.length >= MAX_DIGEST_CHARS) {
    digest = `${digest.slice(0, MAX_DIGEST_CHARS - 24)}… [digest truncated]`;
  }

  return {
    digest,
    sources: [...new Set(sources)].slice(0, 24),
    provider,
  };
}
