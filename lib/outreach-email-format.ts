/**
 * Prompt 68 — deterministic HTML email structure for outreach: greeting on its own line,
 * short body paragraphs, canonical Best regards + name + brand line (Prompt 79).
 */

import { DEFAULT_BRAND_DISPLAY_NAME } from "@/lib/brand-prompt";

export function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripInnerToPlain(inner: string): string {
  return inner
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractParagraphInners(html: string): string[] {
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  return [...html.matchAll(re)].map((m) => m[1]!.trim());
}

function looksLikeSignoffParagraph(inner: string, brandLower: string): boolean {
  const t = stripInnerToPlain(inner).toLowerCase();
  if (/(best|warm)\s+regards/.test(t)) return true;
  const b = brandLower.trim().toLowerCase();
  if (b.length >= 2 && t.includes(b)) return true;
  return t.includes("agentforge") && t.includes("sales");
}

/** Split plain body into 2–3 readable paragraphs (2 sentences each when possible). */
function splitBodyIntoParagraphs(plain: string): string[] {
  const t = plain.trim();
  if (!t) return [];
  const sentences = t.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [t];
  const out: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    const chunk = sentences.slice(i, i + 2).join(" ").trim();
    if (chunk) out.push(chunk);
  }
  return out;
}

export type NormalizeOutreachEmailOptions = {
  firstName: string;
  /** Full name from signup / profile; may be empty (company-only sign-off). */
  signOffName: string;
  /** Prompt 79 — company line under the sender name. */
  brandDisplayName?: string;
};

/**
 * Rebuilds outreach HTML so inbox clients show clear spacing: greeting alone, body `<p>`s,
 * then Best regards + optional signer name + AgentForge Sales.
 */
export function normalizeOutreachEmailHtml(
  html: string,
  opts: NormalizeOutreachEmailOptions,
): string {
  const first = (opts.firstName.trim() || "there").replace(/\s+/g, " ");
  const sign = opts.signOffName.trim();
  const brand = (opts.brandDisplayName?.trim() || DEFAULT_BRAND_DISPLAY_NAME).replace(
    /\s+/g,
    " ",
  );
  const brandLower = brand.toLowerCase();

  let parts = extractParagraphInners(html);
  if (parts.length === 0 && html.trim().length > 0) {
    parts = [stripInnerToPlain(html)];
  }

  while (parts.length > 0 && looksLikeSignoffParagraph(parts[parts.length - 1]!, brandLower)) {
    parts.pop();
  }

  const bodyPlainPieces: string[] = [];

  if (parts.length > 0) {
    const firstP = parts[0]!;
    const m = /^((?:Hi|Hey)\s+[^,]+,\s*)([\s\S]*)$/i.exec(firstP);
    if (m) {
      const after = (m[2] ?? "").trim();
      if (after) bodyPlainPieces.push(stripInnerToPlain(after));
      for (const p of parts.slice(1)) {
        bodyPlainPieces.push(stripInnerToPlain(p));
      }
    } else {
      for (const p of parts) {
        bodyPlainPieces.push(stripInnerToPlain(p));
      }
    }
  }

  const mergedBody = bodyPlainPieces.filter(Boolean).join(" ");
  let paras = splitBodyIntoParagraphs(mergedBody);
  if (paras.length === 0) {
    paras = [
      "I had a short note for you — reply whenever works, even if it's just to point me to the right person.",
    ];
  }

  const signBlock = sign
    ? `<p>Best regards,<br/>${escapeHtmlText(sign)}<br/>${escapeHtmlText(brand)}</p>`
    : `<p>Best regards,<br/>${escapeHtmlText(brand)}</p>`;

  const out: string[] = [`<p>Hi ${escapeHtmlText(first)},</p>`];
  for (const chunk of paras) {
    out.push(`<p>${escapeHtmlText(chunk)}</p>`);
  }
  out.push(signBlock);
  return out.join("\n");
}
