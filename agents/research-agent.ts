import {
  buildResearchSystemPrompt,
  SALES_AGENT_TEMPERATURE,
} from "@/agents/graph-prompts";
import { DEFAULT_BRAND_DISPLAY_NAME } from "@/lib/brand-prompt";
import { normalizeResearchLlmToCanonical } from "@/agents/research-normalize";
import { buildFallbackResearchOutput } from "@/agents/pipeline-fallbacks";
import {
  type CustomVoiceProfile,
  type Lead,
  type ResearchOutput,
  type SdrVoiceTone,
  researchOutputLlmSchema,
} from "@/agents/types";
import {
  invokeWithGroqRateLimitResilience,
  type GroqInvokeMeta,
} from "@/lib/agent-model";
import {
  getSdrVoiceResearchInstructions,
  sdrVoiceLabel,
} from "@/lib/sdr-voice";
import {
  gatherWebResearchDigest,
  type WebResearchDigest,
} from "@/lib/web-research";

export interface ResearchPhaseResult {
  lead: Lead;
  research_output: ResearchOutput;
  /** Set when LLM/tool output failed and a schema-safe template was used. */
  degraded?: boolean;
  /** Present when Groq completed (success or parse fallback after a successful invoke). */
  groqInvokeMeta?: GroqInvokeMeta;
}

export async function runResearchAgent(
  lead: Lead,
  sdrVoice: SdrVoiceTone,
  opts?: {
    customVoice?: CustomVoiceProfile | null;
    brandDisplayName?: string;
    /** Prompt 82 — skip duplicate Tavily/Browserless fetch when lead_enrichment_node already ran. */
    webDigest?: WebResearchDigest;
  },
): Promise<ResearchPhaseResult> {
  const voice = sdrVoice;
  const custom = opts?.customVoice ?? undefined;
  const brand = opts?.brandDisplayName?.trim() || DEFAULT_BRAND_DISPLAY_NAME;
  const voiceLabel = custom?.name?.trim() || sdrVoiceLabel(voice);
  const researchVoice = getSdrVoiceResearchInstructions(voice, custom);

  const web =
    opts?.webDigest ?? (await gatherWebResearchDigest(lead));
  if (web.provider !== "none") {
    console.log(
      "[AgentForge] research web_intel",
      web.provider,
      "sources:",
      web.sources.length,
    );
  }
  const webBlock =
    web.digest.trim().length > 0
      ? `\n\n=== WEB_RESEARCH_DIGEST (live context for this account) ===\n` +
        `${web.sources.slice(0, 12).join(" | ") ? `Reference URLs: ${web.sources.slice(0, 12).join(" | ")}\n\n` : ""}` +
        `${web.digest}\n=== END WEB_RESEARCH_DIGEST ===\n`
      : "";

  const human = `=== ACTIVE_CAMPAIGN_VOICE (graph → research_node) ===
sdrVoice: ${voice} (${voiceLabel})${custom ? ` — **CUSTOM VOICE: ${custom.name}**` : ""}
${researchVoice}

Full research JSON for this lead.

LEAD:
${JSON.stringify(lead)}${webBlock}

Prompt 38 + **48** + **50** + **57** + **58** + **69** + **96**: **Insightful + stable** — zero generic filler; **zero** leakage (no API/LLM/schema/meta in strings). **icp_fit_score**: strong named B2B + work email + buyer title → **80–93** when fit holds; never absurd lows on real leads. Exec + ICP + news + pains + angles + BANT evidence: **sharp, distinct, zero repeated phrasing** across fields. **reasoning_steps** = **exactly 6–8** strings — **human SDR prep** + **consultant depth** (mixed cadence, validate-on-call notes) — **not** parallel corporate bullets. **Hard-ban** wallpaper phrases ("scaling aggressively", "finance enablement", "hypergrowth", "moving fast" as filler, etc.) unless **verbatim** from a cited fact — replace with **this** company's specifics. **Swap-test** exec + ICP: must break if company name is swapped for a sector peer. **Prompt 58:** **Product-surface terms** from web/notes when real; **no circular** exec↔ICP; pains/angles = **operational hooks**. **Prompt 69:** **Elite intelligence** — every field **earns** its place in a **full dossier export**; **no** enrichment-table shallowness. **Prompt 96:** Include **competitor_landscape** — **3–5** competitive alternatives with battle-card fields (strengths/weaknesses/differentiation/win message); name real vendors only when the digest or lead context supports it. **Apply CAMPAIGN SDR VOICE + RESEARCH_VOICE**. When WEB_RESEARCH_DIGEST is present, **weave** concrete items into narrative fields — **plain sentences**; **no** "(inferred)", **no** "unknown" placeholders, **no** digest meta, **no** pasting section headers into JSON. JSON only.`;

  const systemPrompt = buildResearchSystemPrompt(sdrVoice, custom, brand);
  const prompt = `${systemPrompt}\n\n---\n${human}`;

  try {
    const { value: raw, meta } = await invokeWithGroqRateLimitResilience(
      "research_agent",
      SALES_AGENT_TEMPERATURE,
      (m) =>
        m
          .withStructuredOutput(researchOutputLlmSchema, { name: "research_output" })
          .invoke(prompt),
    );
    const lax = researchOutputLlmSchema.safeParse(raw);
    if (!lax.success) {
      console.warn("[AgentForge] research_agent:llm_shape_parse", lax.error.flatten());
      const fb = buildFallbackResearchOutput(lead, "research_llm_shape_parse_failed");
      return {
        lead: {
          ...lead,
          notes: [lead.notes, "Research: recovered default (LLM shape)."].filter(Boolean).join("\n"),
        },
        research_output: fb,
        degraded: true,
        groqInvokeMeta: meta,
      };
    }

    const { output: out, patched } = normalizeResearchLlmToCanonical(lax.data, lead);
    if (patched) {
      console.warn(
        "[AgentForge] research_agent:normalized_missing_fields",
        lead.company,
      );
    }

    const notes = [
      lead.notes,
      out.executive_summary,
      `ICP score: ${out.icp_fit_score}/100 — ${out.icp_fit_summary}`,
      `Industry: ${out.industry_inference}`,
      `News/funding note: ${out.recent_news_or_funding_summary}`,
      `BANT (confidence): Budget ${out.bant_assessment.budget.confidence}, Authority ${out.bant_assessment.authority.confidence}, Need ${out.bant_assessment.need.confidence}, Timeline ${out.bant_assessment.timeline.confidence}`,
      `Tech hints: ${out.tech_stack_hints.slice(0, 5).join(" | ")}`,
      `Angles: ${out.messaging_angles.join(" | ")}`,
    ]
      .filter(Boolean)
      .join("\n---\n");

    return {
      research_output: out,
      lead: {
        ...lead,
        notes: notes || lead.notes,
      },
      groqInvokeMeta: meta,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[AgentForge] research_agent:invoke_fallback", message);
    const fb = buildFallbackResearchOutput(lead, message);
    return {
      lead: {
        ...lead,
        notes: [lead.notes, `Research recovery: ${message.slice(0, 240)}`]
          .filter(Boolean)
          .join("\n"),
      },
      research_output: fb,
      degraded: true,
    };
  }
}
