import { z } from "zod";
import type { CompetitorLandscape, Lead } from "@/agents/types";
import { competitorLandscapeSchema } from "@/agents/types";

/**
 * Prompt 96 — competitive landscape merge + synthetic fallback.
 * Used from `normalizeResearchLlmToCanonical` so every research run can surface battle cards.
 */

function clampStr(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function genericCompetitor(
  lead: Lead,
  idx: number,
  industryHint: string,
): CompetitorLandscape["competitors"][number] {
  const company = (lead.company || "this account").trim();
  const archetypes = [
    {
      name: "Legacy enterprise incumbent",
      cat: "Typically broad suite, slower innovation cycles",
    },
    {
      name: "Mid-market specialist challenger",
      cat: "Vertical or workflow-native positioning",
    },
    {
      name: "DIY / best-of-breed stack",
      cat: "Point tools stitched with internal ops",
    },
  ];
  const a = archetypes[idx % archetypes.length]!;
  return {
    name: a.name,
    category: a.cat,
    strengths: clampStr(
      `Often wins on brand recognition, procurement comfort, and bundled contracts — especially where ${industryHint.slice(0, 80)} buyers default to safe choices.`,
      1200,
    ),
    weaknesses: clampStr(
      `Implementation drag, feature bloat for smaller teams, and renewal leverage when value proof is thin — openings for ${company} when speed and measurable ROI are the bar.`,
      1200,
    ),
    differentiation_vs_account: clampStr(
      `${company} can anchor on a sharper wedge: faster time-to-value, clearer ownership, and proof tied to one executive metric — not a kitchen-sink pitch.`,
      1400,
    ),
    suggested_win_message: clampStr(
      `Lead with one metric ${company} moves in 90 days, show how you de-risk rollout vs a ${idx === 0 ? "suite" : idx === 1 ? "point-tool sprawl" : "homegrown"} path, and name the internal owner who signs off on success.`,
      900,
    ),
  };
}

export function buildSyntheticCompetitorLandscape(
  lead: Lead,
  industryInference: string,
): CompetitorLandscape {
  const company = (lead.company || "this account").trim();
  const hint = industryInference.trim().slice(0, 240) || "the category";
  return {
    account_positioning: clampStr(
      `${company} should be positioned as the credible alternative for teams that need proof faster than a traditional bake-off — emphasize measurable outcomes, deployment clarity, and executive alignment before you expand scope.`,
      2000,
    ),
    competitors: [
      genericCompetitor(lead, 0, hint),
      genericCompetitor(lead, 1, hint),
      genericCompetitor(lead, 2, hint),
    ],
  };
}

function padCompetitors(
  comps: CompetitorLandscape["competitors"],
  lead: Lead,
  industryHint: string,
): CompetitorLandscape["competitors"] {
  const out = [...comps];
  let i = 0;
  while (out.length < 3) {
    out.push(genericCompetitor(lead, out.length + i, industryHint));
    i += 1;
  }
  return out.slice(0, 5);
}

/**
 * Normalizes LLM output or returns a professional synthetic landscape (3 competitors minimum).
 */
export function mergeCompetitorLandscape(
  raw: unknown,
  lead: Lead,
  industryInference: string,
): CompetitorLandscape {
  const parsed = competitorLandscapeSchema.safeParse(raw);
  if (parsed.success) {
    return {
      account_positioning: parsed.data.account_positioning.trim(),
      competitors: padCompetitors(parsed.data.competitors, lead, industryInference),
    };
  }
  const loose = z
    .object({
      account_positioning: z.string().optional(),
      competitors: z.array(z.unknown()).optional(),
    })
    .safeParse(raw);

  if (loose.success && Array.isArray(loose.data.competitors)) {
    const partial: CompetitorLandscape["competitors"] = [];
    for (const row of loose.data.competitors.slice(0, 8)) {
      const e = z
        .object({
          name: z.string(),
          category: z.string().optional(),
          strengths: z.string(),
          weaknesses: z.string(),
          differentiation_vs_account: z.string(),
          suggested_win_message: z.string(),
        })
        .safeParse(row);
      if (e.success) {
        partial.push({
          name: clampStr(e.data.name, 120),
          category: e.data.category ? clampStr(e.data.category, 160) : undefined,
          strengths: clampStr(e.data.strengths, 1400),
          weaknesses: clampStr(e.data.weaknesses, 1400),
          differentiation_vs_account: clampStr(e.data.differentiation_vs_account, 1400),
          suggested_win_message: clampStr(e.data.suggested_win_message, 900),
        });
      }
    }
    if (partial.length > 0) {
      const ap =
        typeof loose.data.account_positioning === "string" &&
        loose.data.account_positioning.trim().length >= 20
          ? clampStr(loose.data.account_positioning, 2000)
          : buildSyntheticCompetitorLandscape(lead, industryInference).account_positioning;
      return {
        account_positioning: ap,
        competitors: padCompetitors(partial, lead, industryInference),
      };
    }
  }

  return buildSyntheticCompetitorLandscape(lead, industryInference);
}
