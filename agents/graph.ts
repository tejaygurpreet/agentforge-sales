import { END, START, Annotation, StateGraph } from "@langchain/langgraph";
import type {
  AgentMessage,
  CampaignClientSnapshot,
  CampaignFinalStatus,
  Lead,
  NurtureOutput,
  OutreachDraft,
  OutreachOutput,
  QualificationAgentResult,
  ResearchOutput,
  SdrVoiceTone,
} from "@/agents/types";
import {
  getSdrVoiceQualificationScoringSupplement,
  resolveSdrVoiceTone,
} from "@/lib/sdr-voice";
import { runNurtureAgent } from "@/agents/nurture-agent";
import { runOutreachAgent } from "@/agents/outreach-agent";
import { buildFallbackQualification } from "@/agents/qualification-normalize";
import { runQualificationAgent } from "@/agents/qualification-agent";
import { runResearchAgent, type ResearchPhaseResult } from "@/agents/research-agent";
import {
  mergeDashboardState,
  SupabaseCheckpointSaver,
} from "@/agents/supabase-checkpointer";
import {
  buildFallbackNurtureOutput,
  buildFallbackOutreachDraft,
  buildFallbackResearchOutput,
} from "@/agents/pipeline-fallbacks";
import { withTimeout } from "@/lib/async-timeout";
import { hasLlmProviderConfigured } from "@/lib/env";
import type { GroqInvokeMeta } from "@/lib/agent-model";
import { saveCampaign } from "@/lib/save-campaign";
import { sendTransactionalEmail } from "@/lib/resend";

/** Just under `START_CAMPAIGN_MAX_MS` (90s) in actions.ts. */
const GRAPH_INVOKE_MAX_MS = 89_000;
/** Per-node ceilings; sums must stay within GRAPH_INVOKE for sequential runs (Prompt 18 + 90s UI cap). */
const RESEARCH_AGENT_MAX_MS = 42_000;
const OUTREACH_AGENT_MAX_MS = 14_000;
const QUALIFICATION_AGENT_MAX_MS = 14_000;
const NURTURE_AGENT_MAX_MS = 14_000;

/**
 * Prompt 17–18: stability, rate limits, compact pipeline memory.
 * Prompts in `./graph-prompts.ts`; research/qual/nurture @0.22, outreach @0.49 (warm, smooth polish).
 * Prompt 43 + **57** + **58**: `resolveSdrVoiceTone(lead)` drives presets — system layers in `sdr-voice-system-layers.ts` + human blocks in `lib/sdr-voice.ts` — research (lead-unique, product-surface anchoring, SDR-brain reasoning), outreach (curiosity subjects, warm premium tier), qualification (realistic deal-room voice), nurture (named tangible assets).
 * Qualification anchor + research normalization; user-facing exports strip appended digests (see `userFacingLeadNotes`).
 */
export {
  buildNurtureSystemPrompt,
  buildOutreachSystemPrompt,
  buildQualificationSystemPrompt,
  buildResearchSystemPrompt,
  NURTURE_NODE_SYSTEM_PROMPT,
  OUTREACH_AGENT_TEMPERATURE,
  OUTREACH_NODE_SYSTEM_PROMPT,
  QUALIFICATION_NODE_SYSTEM_PROMPT,
  RESEARCH_NODE_SYSTEM_PROMPT,
  SALES_AGENT_TEMPERATURE,
} from "./graph-prompts";

/** Prompt 18 — re-export for dashboards/tests; implementation in `@/lib/agent-model`. */
export {
  GROQ_DEFAULT_PRIMARY_MODEL,
  GROQ_LIGHT_FALLBACK_MODEL_IDS,
  GROQ_RATE_LIMIT_RETRY_DELAY_MS,
  invokeWithGroqRateLimitResilience,
  isGroqRateLimitError,
} from "@/lib/agent-model";
export type { GroqInvokeMeta } from "@/lib/agent-model";

const LLM_CONFIG_ERROR =
  "Missing GROQ_API_KEY – please add it to .env.local";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function priorNodesReportedError(results: Record<string, unknown>): boolean {
  for (const key of ["research_node", "outreach_node", "qualification_node"]) {
    const v = results[key];
    if (isRecord(v) && typeof v.error === "string") return true;
  }
  return false;
}

/**
 * Qualification prior from research ICP + **SDR voice** (Prompt 41): scoring rubric follows selected preset.
 */
function buildQualificationScoringAnchor(
  research: ResearchOutput | undefined,
  voice: SdrVoiceTone,
): string {
  const voiceMod = getSdrVoiceQualificationScoringSupplement(voice);
  if (!research) {
    return `No research JSON — score from lead + outreach only. Spread 38–89. **Upward** for copy that **reads smooth aloud** — **warmer** open, short-to-medium <p>, **statement-led**, **0 ? ideal / max 1** in body, tiny reply path, **curiosity-native subject**. **Downward** for **any awkward line**, brochure rhythm, survey tone, swap-test generic, corporate soup, metronome sentences. Objections: three distinct **buyer mechanisms** (beliefs/politics). next_best_action: named artifacts + **sequenced** triggers. **Prompt 57 + 58 + 67** apply (listing dossier premium; warm preset must **outshine** default on consultative ease + relationship depth).

**SDR_VOICE (${voice}):** ${voiceMod}`;
  }
  const icp = research.icp_fit_score;
  return `ICP anchor: icp_fit_score=${icp} (stabilized upstream — directional). Prompt 39 + **57** + **58** + **67**: **Nuanced strategic** qual — **belief gaps**, silent blockers, budget theater, competing priorities, **internal-political** risk. **bant_summary** must sound **human** (AE Slack) — penalize memo boilerplate. **Prompt 67:** objections + bant_summary must **not** read like **templated BANT** — reward **specific**, **deal-real** language. **Reward** outreach that is **warm, smooth, high-reply** when voice is **default**; for **warm_relationship_builder**, reward **consultative homework + low-pressure + relationship-aware** copy that is **clearly premium** vs generic warm; for other voices, reward **faithful preset execution** per SDR_VOICE modifier below. **Penalize** stiff/awkward sentences, template feel, interrogation, brochure transitions, or hook that fits any logo — **and penalize preset mismatch** (e.g. vague fluff when voice demands data). If generic, **cap** qual **44–66** and name the tell. Strong fit + correct voice execution → **72–93** when BANT allows. Odd scores when split. If |qual - icp| > 14, one sentence in bant_summary explains. top_objections: three **different** mechanisms (buyer psychology / politics). next_best_action: two+ deliverables + **sequenced** logic. **Never** API/schema/timeout/model leakage in output fields.

**SDR_VOICE (${voice}):** ${voiceMod}`;
}

let loggedCompactPipelineMemory = false;

function truncPipelineStr(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function compactResearchForPipeline(research: ResearchOutput): Record<string, unknown> {
  return {
    icp_fit_score: research.icp_fit_score,
    reasoning_steps: research.reasoning_steps.slice(0, 6),
    industry_inference: truncPipelineStr(research.industry_inference, 320),
    recent_news_or_funding_summary: truncPipelineStr(
      research.recent_news_or_funding_summary,
      160,
    ),
    bant_assessment: research.bant_assessment,
    company_size_inference: research.company_size_inference,
    tech_stack_hints: research.tech_stack_hints
      .slice(0, 4)
      .map((x) => truncPipelineStr(x, 100)),
    icp_fit_summary: truncPipelineStr(research.icp_fit_summary, 450),
    key_stakeholders: research.key_stakeholders
      .slice(0, 5)
      .map((x) => truncPipelineStr(x, 120)),
    pain_points: research.pain_points
      .slice(0, 4)
      .map((x) => truncPipelineStr(x, 120)),
    messaging_angles: research.messaging_angles.map((x) =>
      truncPipelineStr(x, 100),
    ),
    executive_summary: truncPipelineStr(research.executive_summary, 480),
    _note: "excerpt only — not shown to prospects",
  };
}

/**
 * Compact JSON for outreach/qualification prompts (Prompt 18). Full `research_output` remains on graph state.
 */
export function serializeResearchForPipelineMemory(
  research: ResearchOutput | undefined,
): string {
  if (!research) {
    return JSON.stringify({
      note: "no_research_output — prior node failed or skipped",
    });
  }
  if (!loggedCompactPipelineMemory) {
    loggedCompactPipelineMemory = true;
    console.log(
      "[AgentForge] graph: using compact research JSON for downstream prompts (Prompt 18 token budget)",
    );
  }
  return JSON.stringify(compactResearchForPipeline(research));
}

const GraphState = Annotation.Root({
  lead: Annotation<Lead>({
    reducer: (_c, n) => n,
  }),
  messages: Annotation<AgentMessage[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  current_agent: Annotation<string>({
    reducer: (_c, n) => n,
    default: () => "",
  }),
  thread_id: Annotation<string>(),
  user_id: Annotation<string>(),
  research_output: Annotation<ResearchOutput | undefined>({
    reducer: (_c, n) => n,
    default: () => undefined,
  }),
  outreach_output: Annotation<OutreachOutput | undefined>({
    reducer: (_c, n) => n,
    default: () => undefined,
  }),
  qualification_score: Annotation<number | undefined>({
    reducer: (_c, n) => n,
    default: () => undefined,
  }),
  qualification_detail: Annotation<QualificationAgentResult | undefined>({
    reducer: (_c, n) => n,
    default: () => undefined,
  }),
  nurture_output: Annotation<NurtureOutput | undefined>({
    reducer: (_c, n) => n,
    default: () => undefined,
  }),
  final_status: Annotation<CampaignFinalStatus>({
    reducer: (_c, n) => n,
    default: () => "running",
  }),
  pipeline_error: Annotation<string | undefined>({
    reducer: (_c, n) => n,
    default: () => undefined,
  }),
  results: Annotation<Record<string, unknown>>({
    reducer: (prev, next) => {
      if (!next || typeof next !== "object") return prev;
      return { ...prev, ...(next as Record<string, unknown>) };
    },
    default: () => ({}),
  }),
  campaign_completed_at: Annotation<string | undefined>({
    reducer: (_c, n) => n,
    default: () => undefined,
  }),
  /** Prompt 68 — sender full name from signup/profile for email sign-off. */
  sender_signoff_name: Annotation<string | undefined>({
    reducer: (_c, n) => n,
    default: () => undefined,
  }),
});

export type SalesGraphState = typeof GraphState.State;

export function serializeCampaignStateForClient(
  state: SalesGraphState,
): CampaignClientSnapshot {
  return {
    lead: state.lead,
    messages: state.messages,
    current_agent: state.current_agent,
    thread_id: state.thread_id,
    user_id: state.user_id,
    research_output: state.research_output ?? null,
    outreach_output: state.outreach_output ?? null,
    qualification_score: state.qualification_score ?? null,
    qualification_detail: state.qualification_detail ?? null,
    nurture_output: state.nurture_output ?? null,
    final_status: state.final_status,
    pipeline_error: state.pipeline_error ?? null,
    results: state.results ?? {},
    campaign_completed_at: state.campaign_completed_at ?? null,
  };
}

function buildSalesGraph() {
  return new StateGraph(GraphState)
    .addNode("research_node", researchNode)
    .addNode("outreach_node", outreachNode)
    .addNode("qualification_node", qualificationNode)
    .addNode("nurture_node", nurtureNode)
    .addEdge(START, "research_node")
    .addEdge("research_node", "outreach_node")
    .addEdge("outreach_node", "qualification_node")
    .addEdge("qualification_node", "nurture_node")
    .addEdge("nurture_node", END);
}

async function researchNode(
  state: SalesGraphState,
): Promise<Partial<SalesGraphState>> {
  const sdrVoice = resolveSdrVoiceTone(state.lead);
  console.log(
    "[AgentForge] research_node:start",
    state.thread_id,
    state.lead.email,
    "sdr_voice:",
    sdrVoice,
  );
  try {
    let phase: ResearchPhaseResult;
    try {
      phase = await withTimeout(
        runResearchAgent(state.lead, sdrVoice),
        RESEARCH_AGENT_MAX_MS,
        "research_agent",
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[AgentForge] research_node:timeout_or_error", state.thread_id, message);
      phase = {
        lead: {
          ...state.lead,
          notes: [state.lead.notes, `Research timed out or failed: ${message.slice(0, 200)}`]
            .filter(Boolean)
            .join("\n"),
        },
        research_output: buildFallbackResearchOutput(state.lead, message),
        degraded: true,
      };
    }
    const { lead, research_output, degraded, groqInvokeMeta } = phase;
    if (degraded) {
      console.warn(
        "[AgentForge] research_node: degraded output (schema recovery or LLM error)",
        state.thread_id,
      );
    }
    if (groqInvokeMeta?.usedLighterModelAfterRateLimit) {
      console.warn(
        "[AgentForge] research_node: RATE_LIMIT → lighter model",
        state.thread_id,
        groqInvokeMeta.modelUsed,
      );
    }
    const nodeResult = {
      icp_fit_score: research_output.icp_fit_score,
      reasoning_steps: research_output.reasoning_steps,
      industry_inference: research_output.industry_inference,
      recent_news_or_funding_summary: research_output.recent_news_or_funding_summary,
      bant_assessment: research_output.bant_assessment,
      company_size_inference: research_output.company_size_inference,
      tech_stack_hints: research_output.tech_stack_hints,
      icp_fit_summary: research_output.icp_fit_summary,
      key_stakeholders: research_output.key_stakeholders,
      pain_points: research_output.pain_points,
      messaging_angles: research_output.messaging_angles,
      executive_summary: research_output.executive_summary,
      ...(degraded ? { degraded: true as const } : {}),
      ...(groqInvokeMeta?.usedLighterModelAfterRateLimit
        ? { rate_limit_lighter_model: true as const }
        : {}),
    };
    await mergeDashboardState(state.thread_id, state.user_id, {
      lead,
      current_agent: "research_node",
      research_output,
      results: { research_node: nodeResult },
    });
    console.log("[AgentForge] research_node:ok", state.thread_id);
    return {
      lead,
      research_output,
      current_agent: "research_node",
      final_status: "running",
      results: { research_node: nodeResult },
      messages: [
        {
          role: "ai",
          content: `research_node: ${research_output.executive_summary.slice(0, 400)}`,
        },
      ],
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Research failed";
    console.error("[AgentForge] research_node:unexpected", state.thread_id, message);
    const research_output = buildFallbackResearchOutput(state.lead, message);
    const lead = {
      ...state.lead,
      notes: [state.lead.notes, `Research node recovery: ${message.slice(0, 200)}`]
        .filter(Boolean)
        .join("\n"),
    };
    const nodeResult = {
      icp_fit_score: research_output.icp_fit_score,
      reasoning_steps: research_output.reasoning_steps,
      industry_inference: research_output.industry_inference,
      recent_news_or_funding_summary: research_output.recent_news_or_funding_summary,
      bant_assessment: research_output.bant_assessment,
      company_size_inference: research_output.company_size_inference,
      tech_stack_hints: research_output.tech_stack_hints,
      icp_fit_summary: research_output.icp_fit_summary,
      key_stakeholders: research_output.key_stakeholders,
      pain_points: research_output.pain_points,
      messaging_angles: research_output.messaging_angles,
      executive_summary: research_output.executive_summary,
      degraded: true as const,
      error_note: message.slice(0, 400),
    };
    await mergeDashboardState(state.thread_id, state.user_id, {
      lead,
      current_agent: "research_node",
      research_output,
      results: { research_node: nodeResult },
    });
    return {
      lead,
      research_output,
      current_agent: "research_node",
      final_status: "running",
      results: { research_node: nodeResult },
      messages: [
        {
          role: "ai",
          content: `research_node: recovered default after unexpected error. ${research_output.executive_summary.slice(0, 200)}`,
        },
      ],
    };
  }
}

async function outreachNode(
  state: SalesGraphState,
): Promise<Partial<SalesGraphState>> {
  const sdrVoice = resolveSdrVoiceTone(state.lead);
  console.log("[AgentForge] outreach_node:start", state.thread_id, "sdr_voice:", sdrVoice);
  try {
    const priorContext = serializeResearchForPipelineMemory(
      state.research_output,
    );
    let draft: OutreachDraft;
    let outreachDegraded = false;
    let outreachErrorNote: string | undefined;
    let outreachGroqMeta: GroqInvokeMeta | undefined;
    try {
      const out = await withTimeout(
        runOutreachAgent(state.lead, priorContext, sdrVoice, {
        senderSignoffName: state.sender_signoff_name,
      }),
        OUTREACH_AGENT_MAX_MS,
        "outreach_agent",
      );
      draft = out.draft;
      outreachGroqMeta = out.groqInvokeMeta;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      outreachDegraded = true;
      outreachErrorNote = message.slice(0, 500);
      console.error("[AgentForge] outreach_node:fallback", state.thread_id, message);
      draft = buildFallbackOutreachDraft(state.lead, message, state.sender_signoff_name);
    }
    const send = await sendTransactionalEmail({
      to: state.lead.email,
      subject: draft.subject,
      html: draft.email_body,
    });
    const outreach_output: OutreachOutput = {
      ...draft,
      email_sent: send.ok,
      send_error: send.ok ? undefined : send.error,
    };

    const nextLead: Lead = send.ok
      ? { ...state.lead, status: "contacted" }
      : state.lead;

    const nodeResult = {
      ...draft,
      email_sent: outreach_output.email_sent,
      send_error: outreach_output.send_error,
      resend_status: send.ok
        ? "delivered"
        : outreach_output.send_error ?? "not_sent",
      ...(outreachDegraded
        ? { degraded: true as const, error_note: outreachErrorNote }
        : {}),
      ...(outreachGroqMeta?.usedLighterModelAfterRateLimit
        ? { rate_limit_lighter_model: true as const }
        : {}),
    };
    if (outreachGroqMeta?.usedLighterModelAfterRateLimit) {
      console.warn(
        "[AgentForge] outreach_node: RATE_LIMIT → lighter model",
        state.thread_id,
        outreachGroqMeta.modelUsed,
      );
    }
    if (outreachDegraded) {
      console.warn(
        "[AgentForge] outreach_node: degraded draft (timeout or LLM path)",
        state.thread_id,
        outreachErrorNote?.slice(0, 120),
      );
    }

    await mergeDashboardState(state.thread_id, state.user_id, {
      lead: nextLead,
      current_agent: "outreach_node",
      outreach_output,
      outreach_sent: send.ok,
      results: { outreach_node: nodeResult },
    });

    console.log(
      "[AgentForge] outreach_node:send",
      state.thread_id,
      send.ok ? "sent" : "not_sent",
    );

    return {
      lead: nextLead,
      outreach_output,
      current_agent: "outreach_node",
      final_status: "running",
      results: { outreach_node: nodeResult },
      messages: [
        {
          role: "ai",
          content: send.ok
            ? `outreach_node: email dispatched to ${state.lead.email}.`
            : `outreach_node: ${outreach_output.send_error ?? "email not sent"}`,
        },
      ],
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Outreach failed";
    console.error("[AgentForge] outreach_node:error", state.thread_id, message);
    const fbDraft = buildFallbackOutreachDraft(state.lead, message, state.sender_signoff_name);
    const fallback: OutreachOutput = {
      ...fbDraft,
      email_sent: false,
      send_error: message,
    };
    const nodeResult = {
      ...fallback,
      error: message,
      degraded: true as const,
      error_note: message.slice(0, 500),
    };
    await mergeDashboardState(state.thread_id, state.user_id, {
      current_agent: "outreach_node",
      outreach_output: fallback,
      results: { outreach_node: nodeResult },
    });
    return {
      outreach_output: fallback,
      current_agent: "outreach_node",
      final_status: "running",
      results: { outreach_node: nodeResult },
      messages: [{ role: "ai", content: `outreach_node error: ${message}` }],
    };
  }
}

function draftFromOutreachOutput(o: OutreachOutput): OutreachDraft {
  return {
    subject: o.subject,
    email_body: o.email_body,
    linkedin_message: o.linkedin_message,
    personalization_hooks: o.personalization_hooks,
    primary_angle: o.primary_angle,
    cta_strategy: o.cta_strategy,
    linkedin_rationale: o.linkedin_rationale,
  };
}

const emptyOutreachDraft: OutreachDraft = {
  subject: "(no outreach draft)",
  email_body:
    "<p>Earlier pipeline step did not produce outreach; scoring from lead + research context only.</p>",
  linkedin_message: "",
  personalization_hooks: [
    "Outreach step missing — qualification uses lead + pipeline memory only",
  ],
  primary_angle: "N/A",
  cta_strategy: "N/A",
  linkedin_rationale: "N/A",
};

async function qualificationNode(
  state: SalesGraphState,
): Promise<Partial<SalesGraphState>> {
  const sdrVoice = resolveSdrVoiceTone(state.lead);
  console.log(
    "[AgentForge] qualification_node:start",
    state.thread_id,
    "sdr_voice:",
    sdrVoice,
  );
  try {
    const outreach = state.outreach_output;
    const draft: OutreachDraft = outreach
      ? draftFromOutreachOutput(outreach)
      : emptyOutreachDraft;
    const emailWasSent = outreach?.email_sent ?? false;

    const pipelineContext = serializeResearchForPipelineMemory(
      state.research_output,
    );
    const scoringAnchor = buildQualificationScoringAnchor(
      state.research_output,
      sdrVoice,
    );

    let pack: {
      result: QualificationAgentResult;
      degraded: boolean;
      groqInvokeMeta?: GroqInvokeMeta;
    };
    try {
      pack = await withTimeout(
        runQualificationAgent(state.lead, draft, emailWasSent, {
          pipelineContext,
          scoringAnchor,
          icpFromResearch: state.research_output?.icp_fit_score,
          sdrVoice,
        }),
        QUALIFICATION_AGENT_MAX_MS,
        "qualification_agent",
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(
        "[AgentForge] qualification_node:timeout_or_error",
        state.thread_id,
        message,
      );
      pack = {
        result: buildFallbackQualification(state.lead, message, {
          icpHint: state.research_output?.icp_fit_score,
        }),
        degraded: true,
      };
    }
    const { result, degraded, groqInvokeMeta: qualGroqMeta } = pack;
    if (degraded) {
      console.warn(
        "[AgentForge] qualification_node: degraded scoring (timeout, normalization, or LLM recovery)",
        state.thread_id,
      );
    }
    if (qualGroqMeta?.usedLighterModelAfterRateLimit) {
      console.warn(
        "[AgentForge] qualification_node: RATE_LIMIT → lighter model",
        state.thread_id,
        qualGroqMeta.modelUsed,
      );
    }
    const qualified = result.score >= 60;
    const nextLead: Lead = qualified
      ? { ...state.lead, status: "qualified" }
      : state.lead;

    const nodeResult = {
      ...result,
      ...(degraded ? { degraded: true as const } : {}),
      ...(qualGroqMeta?.usedLighterModelAfterRateLimit
        ? { rate_limit_lighter_model: true as const }
        : {}),
    } as Record<string, unknown>;

    await mergeDashboardState(state.thread_id, state.user_id, {
      lead: nextLead,
      current_agent: "qualification_node",
      qualification_score: result.score,
      qualification_detail: result,
      results: { qualification_node: nodeResult },
    });

    console.log("[AgentForge] qualification_node:score", state.thread_id, result.score);

    return {
      lead: nextLead,
      qualification_score: result.score,
      qualification_detail: result,
      current_agent: "qualification_node",
      final_status: "running",
      results: { qualification_node: nodeResult },
      messages: [
        {
          role: "ai",
          content: `qualification_node: score ${result.score}. ${result.bant_summary.slice(0, 260)}`,
        },
      ],
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Qualification failed";
    console.error("[AgentForge] qualification_node:error", state.thread_id, message);
    const result = buildFallbackQualification(state.lead, message, {
      icpHint: state.research_output?.icp_fit_score,
    });
    const qualified = result.score >= 60;
    const nextLead: Lead = qualified
      ? { ...state.lead, status: "qualified" }
      : state.lead;
    const nodeResult = {
      ...result,
      degraded: true as const,
      error_note: message.slice(0, 500),
    } as Record<string, unknown>;
    await mergeDashboardState(state.thread_id, state.user_id, {
      lead: nextLead,
      current_agent: "qualification_node",
      qualification_score: result.score,
      qualification_detail: result,
      results: { qualification_node: nodeResult },
    });
    return {
      lead: nextLead,
      qualification_score: result.score,
      qualification_detail: result,
      current_agent: "qualification_node",
      final_status: "running",
      results: { qualification_node: nodeResult },
      messages: [
        {
          role: "ai",
          content: `qualification_node: recovered default (score ${result.score}). ${result.bant_summary.slice(0, 200)}`,
        },
      ],
    };
  }
}

async function nurtureNode(
  state: SalesGraphState,
): Promise<Partial<SalesGraphState>> {
  const sdrVoice = resolveSdrVoiceTone(state.lead);
  console.log("[AgentForge] nurture_node:start", state.thread_id, "sdr_voice:", sdrVoice);
  const score = state.qualification_score ?? 50;
  const hadPriorErrors = priorNodesReportedError(state.results ?? {});

  let nurture_output: NurtureOutput;
  let nurtureDegraded = false;
  let nurtureNote: string | undefined;
  let nurtureGroqMeta: GroqInvokeMeta | undefined;

  try {
    const n = await withTimeout(
      runNurtureAgent(
        state.lead,
        {
          qualification_score: score,
          qualification_detail: state.qualification_detail,
          research_output: state.research_output,
          outreach_output: state.outreach_output,
        },
        sdrVoice,
      ),
      NURTURE_AGENT_MAX_MS,
      "nurture_agent",
    );
    nurture_output = n.output;
    nurtureGroqMeta = n.groqInvokeMeta;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    nurtureDegraded = true;
    nurtureNote = message.slice(0, 500);
    console.error("[AgentForge] nurture_node:fallback", state.thread_id, message);
    nurture_output = buildFallbackNurtureOutput(state.lead, message);
  }

  try {
    const nextLead: Lead = { ...state.lead, status: "nurtured" };

    const nodeResult = {
      sequence_summary: nurture_output.sequence_summary,
      follow_up_sequences: nurture_output.follow_up_sequences,
      ...(nurtureDegraded
        ? { degraded: true as const, error_note: nurtureNote }
        : {}),
      ...(nurtureGroqMeta?.usedLighterModelAfterRateLimit
        ? { rate_limit_lighter_model: true as const }
        : {}),
    };

    if (nurtureGroqMeta?.usedLighterModelAfterRateLimit) {
      console.warn(
        "[AgentForge] nurture_node: RATE_LIMIT → lighter model",
        state.thread_id,
        nurtureGroqMeta.modelUsed,
      );
    }

    const final_status: CampaignFinalStatus = hadPriorErrors
      ? "completed_with_errors"
      : "completed";

    await mergeDashboardState(state.thread_id, state.user_id, {
      lead: nextLead,
      current_agent: "nurture_node",
      nurture_output,
      final_status,
      results: { nurture_node: nodeResult },
    });

    console.log(
      "[AgentForge] nurture_node:ok",
      state.thread_id,
      nurtureDegraded ? "(fallback)" : "",
    );

    return {
      nurture_output,
      lead: nextLead,
      current_agent: "nurture_node",
      final_status,
      results: { nurture_node: nodeResult },
      messages: [
        {
          role: "ai",
          content: `nurture_node: ${nurture_output.sequence_summary.slice(0, 400)}`,
        },
      ],
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Nurture failed";
    console.error("[AgentForge] nurture_node:unexpected", state.thread_id, message);
    const fb = buildFallbackNurtureOutput(state.lead, message);
    const nextLead: Lead = { ...state.lead, status: "nurtured" };
    const nodeResult = {
      sequence_summary: fb.sequence_summary,
      follow_up_sequences: fb.follow_up_sequences,
      degraded: true as const,
      error_note: message.slice(0, 500),
    };
    const fatalStatus: CampaignFinalStatus = hadPriorErrors
      ? "completed_with_errors"
      : "completed";
    await mergeDashboardState(state.thread_id, state.user_id, {
      lead: nextLead,
      current_agent: "nurture_node",
      nurture_output: fb,
      final_status: fatalStatus,
      results: { nurture_node: nodeResult },
    });
    return {
      nurture_output: fb,
      lead: nextLead,
      current_agent: "nurture_node",
      final_status: fatalStatus,
      results: { nurture_node: nodeResult },
      messages: [{ role: "ai", content: `nurture_node: recovered playbook after error.` }],
    };
  }
}

export interface RunCampaignInput {
  lead: Lead;
  thread_id: string;
  user_id: string;
  /** Prompt 68 — profile / signup full name for outreach sign-off (optional). */
  sender_signoff_name?: string;
}

function initialCampaignGraphState(input: RunCampaignInput): SalesGraphState {
  return {
    lead: input.lead,
    messages: [],
    current_agent: "research_node",
    thread_id: input.thread_id,
    user_id: input.user_id,
    research_output: undefined,
    outreach_output: undefined,
    qualification_score: undefined,
    qualification_detail: undefined,
    nurture_output: undefined,
    final_status: "running",
    pipeline_error: undefined,
    results: {},
    campaign_completed_at: undefined,
    sender_signoff_name: input.sender_signoff_name,
  };
}

/**
 * Runs the LangGraph pipeline with cross-node context (research JSON → outreach →
 * qualification → nurture + qualification_detail). Persists via `saveCampaign`.
 */
export async function runCampaignGraph(
  input: RunCampaignInput,
): Promise<SalesGraphState> {
  const completedAt = () => new Date().toISOString();

  if (!hasLlmProviderConfigured()) {
    const failed: SalesGraphState = {
      lead: input.lead,
      messages: [],
      current_agent: "research_node",
      thread_id: input.thread_id,
      user_id: input.user_id,
      research_output: undefined,
      outreach_output: undefined,
      qualification_score: undefined,
      qualification_detail: undefined,
      nurture_output: undefined,
      final_status: "failed",
      pipeline_error: LLM_CONFIG_ERROR,
      sender_signoff_name: input.sender_signoff_name,
      results: {
        llm_config: {
          error: LLM_CONFIG_ERROR,
          groq_required:
            "Set GROQ_API_KEY in .env.local (preferred). ANTHROPIC_API_KEY is optional fallback.",
        },
      },
      campaign_completed_at: completedAt(),
    };
    await mergeDashboardState(input.thread_id, input.user_id, {
      current_agent: "research_node",
      final_status: "failed",
      pipeline_error: LLM_CONFIG_ERROR,
      lead: input.lead,
      results: failed.results,
    });
    await saveCampaign({
      userId: input.user_id,
      threadId: input.thread_id,
      lead: input.lead,
      snapshot: serializeCampaignStateForClient(failed),
    });
    return failed;
  }

  try {
    const checkpointer = new SupabaseCheckpointSaver();
    await checkpointer.hydrate(input.thread_id);
    const graph = buildSalesGraph().compile({ checkpointer });

    const initial = initialCampaignGraphState(input);

    console.log("[AgentForge] runCampaignGraph:invoke", input.thread_id);

    let out: SalesGraphState;
    try {
      out = await withTimeout(
        graph.invoke(initial, {
          configurable: {
            thread_id: input.thread_id,
            user_id: input.user_id,
          },
        }),
        GRAPH_INVOKE_MAX_MS,
        "runCampaignGraph.invoke",
      );
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Campaign graph invocation failed";
      console.error(
        "[AgentForge] runCampaignGraph:invoke_error",
        input.thread_id,
        message,
      );
      const failedRun: SalesGraphState = {
        ...initial,
        final_status: "completed_with_errors",
        pipeline_error: message,
        campaign_completed_at: completedAt(),
      };
      try {
        await mergeDashboardState(input.thread_id, input.user_id, {
          final_status: "completed_with_errors",
          pipeline_error: message,
        });
      } catch (mergeErr) {
        console.error(
          "[AgentForge] runCampaignGraph:invoke_merge_failed",
          input.thread_id,
          mergeErr,
        );
      }
      try {
        await saveCampaign({
          userId: input.user_id,
          threadId: input.thread_id,
          lead: input.lead,
          snapshot: serializeCampaignStateForClient(failedRun),
        });
      } catch (saveErr) {
        console.error(
          "[AgentForge] runCampaignGraph:invoke_save_failed",
          input.thread_id,
          saveErr,
        );
      }
      return failedRun;
    }

    const finished: SalesGraphState = {
      ...out,
      campaign_completed_at: completedAt(),
    };
    try {
      await saveCampaign({
        userId: input.user_id,
        threadId: input.thread_id,
        lead: input.lead,
        snapshot: serializeCampaignStateForClient(finished),
      });
    } catch (saveErr) {
      const msg =
        saveErr instanceof Error ? saveErr.message : String(saveErr);
      console.error(
        "[AgentForge] runCampaignGraph:save_error",
        input.thread_id,
        msg,
      );
      const withPersistNote: SalesGraphState = {
        ...finished,
        final_status: "completed_with_errors",
        pipeline_error: `Persist failed: ${msg}`,
      };
      try {
        await mergeDashboardState(input.thread_id, input.user_id, {
          final_status: "completed_with_errors",
          pipeline_error: withPersistNote.pipeline_error,
        });
      } catch (mergeErr) {
        console.error(
          "[AgentForge] runCampaignGraph:save_merge_failed",
          input.thread_id,
          mergeErr,
        );
      }
      return withPersistNote;
    }
    return finished;
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Campaign pipeline failed unexpectedly";
    console.error("[AgentForge] runCampaignGraph:fatal", input.thread_id, e);
    const fatal: SalesGraphState = {
      ...initialCampaignGraphState(input),
      final_status: "completed_with_errors",
      pipeline_error: message,
      campaign_completed_at: completedAt(),
    };
    try {
      await mergeDashboardState(input.thread_id, input.user_id, {
        final_status: "completed_with_errors",
        pipeline_error: message,
      });
    } catch (mergeErr) {
      console.error(
        "[AgentForge] runCampaignGraph:fatal_merge_failed",
        input.thread_id,
        mergeErr,
      );
    }
    try {
      await saveCampaign({
        userId: input.user_id,
        threadId: input.thread_id,
        lead: input.lead,
        snapshot: serializeCampaignStateForClient(fatal),
      });
    } catch (saveErr) {
      console.error(
        "[AgentForge] runCampaignGraph:fatal_save_failed",
        input.thread_id,
        saveErr,
      );
    }
    return fatal;
  }
}

export const runSalesGraph = async (input: {
  threadId: string;
  userId: string;
  lead: Lead;
  senderSignoffName?: string;
}) =>
  runCampaignGraph({
    lead: input.lead,
    thread_id: input.threadId,
    user_id: input.userId,
    sender_signoff_name: input.senderSignoffName,
  });
