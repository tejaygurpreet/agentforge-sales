import "server-only";

import type { CampaignClientSnapshot } from "@/agents/types";
import type { PersonalizedDemoScriptDTO } from "@/types";
import { z } from "zod";
import { invokeWithGroqRateLimitResilience } from "@/lib/agent-model";

const DEMO_TEMPERATURE = 0.34;

export type { PersonalizedDemoScriptDTO } from "@/types";

const demoLlmSchema = z
  .object({
    title: z.string().optional(),
    opening: z.string().optional(),
    agenda: z.array(z.string()).optional(),
    discovery_questions: z.array(z.string()).optional(),
    proof_points: z.array(z.string()).optional(),
    closing: z.string().optional(),
    invite_email_paragraph: z.string().optional(),
    booking_cta: z.string().optional(),
  })
  .passthrough();

function safeLines(s: string, max = 8000): string {
  return s.slice(0, max);
}

export function formatDemoScriptForCalendarDescription(script: PersonalizedDemoScriptDTO): string {
  const lines = [
    "— Personalized demo (AgentForge) —",
    "",
    script.opening,
    "",
    "Agenda:",
    ...script.agenda.map((a, i) => `${i + 1}. ${a}`),
    "",
    "Discovery:",
    ...script.discovery_questions.map((q) => `• ${q}`),
    "",
    "Proof:",
    ...script.proof_points.map((p) => `• ${p}`),
    "",
    script.closing,
  ];
  return lines.join("\n").slice(0, 12000);
}

export function buildDemoEventTitle(
  script: PersonalizedDemoScriptDTO,
  company: string,
): string {
  const base = script.title?.trim() || `Product demo — ${company}`;
  return base.slice(0, 200);
}

/**
 * Prompt 100 — Groq structured JSON for a live, account-specific demo run-of-show.
 */
export async function generatePersonalizedDemoScriptWithAi(
  snapshot: CampaignClientSnapshot,
): Promise<PersonalizedDemoScriptDTO> {
  const company = snapshot.lead.company?.trim() || "the account";
  const contact = snapshot.lead.name?.trim() || "the champion";
  const research = snapshot.research_output;
  const qual = snapshot.qualification_detail;
  const summary =
    research?.executive_summary?.slice(0, 1200) ??
    "Use discovery to map pains, stakeholders, and success criteria.";
  const angles = (research?.messaging_angles ?? []).slice(0, 3).join(" | ");
  const nba = qual?.next_best_action?.slice(0, 400) ?? "";

  const system = `You are a senior solutions consultant. Output ONE JSON object only. No markdown fences.
Build a concise, respectful live demo script for a B2B SaaS sales motion — no fake metrics, no guaranteed ROI.`;

  const human = safeLines(`Account: ${company}
Contact: ${contact}
Qualification next step: ${nba}
Research summary: ${summary}
Messaging angles: ${angles || "n/a"}

Return JSON keys:
- title (≤90 chars, specific to this account)
- opening (2-4 sentences, live call opener)
- agenda (4-6 short strings, time-boxed sections)
- discovery_questions (4-6 strings)
- proof_points (3-5 strings — what to show, not claims)
- closing (2-3 sentences, mutual next step)
- invite_email_paragraph (1 short paragraph for calendar description / email)
- booking_cta (one line CTA for the prospect)`);

  const { value: raw } = await invokeWithGroqRateLimitResilience(
    "personalized_demo_script",
    DEMO_TEMPERATURE,
    (m) =>
      m.withStructuredOutput(demoLlmSchema, { name: "personalized_demo_script" }).invoke(
        `${system}\n\n---\n${human}`,
      ),
  );

  const lax = demoLlmSchema.safeParse(raw);
  if (!lax.success) {
    return fallbackDemoScript(company, contact);
  }
  const d = lax.data;
  return {
    title: (d.title ?? `Live demo — ${company}`).slice(0, 200),
    opening: (d.opening ?? "").slice(0, 2000),
    agenda: (d.agenda ?? []).map((x) => String(x).trim()).filter(Boolean).slice(0, 8),
    discovery_questions: (d.discovery_questions ?? [])
      .map((x) => String(x).trim())
      .filter(Boolean)
      .slice(0, 8),
    proof_points: (d.proof_points ?? []).map((x) => String(x).trim()).filter(Boolean).slice(0, 8),
    closing: (d.closing ?? "").slice(0, 1200),
    invite_email_paragraph: (d.invite_email_paragraph ?? "").slice(0, 1200),
    booking_cta: (d.booking_cta ?? "Pick a time that works — we’ll tailor the walkthrough to your workflow.").slice(
      0,
      400,
    ),
  };
}

/** Hydrate a stored row from `campaigns.demo_script` (best-effort). */
export function parseStoredDemoScript(raw: unknown): PersonalizedDemoScriptDTO | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const title = typeof o.title === "string" ? o.title.trim() : "";
  const opening = typeof o.opening === "string" ? o.opening.trim() : "";
  if (!title || !opening) return null;
  const agenda = Array.isArray(o.agenda)
    ? o.agenda.filter((x): x is string => typeof x === "string").map((s) => s.trim())
    : [];
  const dq = Array.isArray(o.discovery_questions)
    ? o.discovery_questions.filter((x): x is string => typeof x === "string").map((s) => s.trim())
    : [];
  const pp = Array.isArray(o.proof_points)
    ? o.proof_points.filter((x): x is string => typeof x === "string").map((s) => s.trim())
    : [];
  return {
    title: title.slice(0, 200),
    opening: opening.slice(0, 2000),
    agenda: agenda.length ? agenda : fallbackDemoScript("Account", "Contact").agenda,
    discovery_questions: dq.length ? dq : fallbackDemoScript("Account", "Contact").discovery_questions,
    proof_points: pp.length ? pp : fallbackDemoScript("Account", "Contact").proof_points,
    closing: typeof o.closing === "string" ? o.closing.slice(0, 1200) : "",
    invite_email_paragraph:
      typeof o.invite_email_paragraph === "string" ? o.invite_email_paragraph.slice(0, 1200) : "",
    booking_cta:
      typeof o.booking_cta === "string"
        ? o.booking_cta.slice(0, 400)
        : "Pick a time that works — we’ll tailor the walkthrough to your workflow.",
  };
}

function fallbackDemoScript(company: string, contact: string): PersonalizedDemoScriptDTO {
  return {
    title: `Product walkthrough — ${company}`,
    opening: `Thanks for making time, ${contact}. I’ll anchor the session on the outcomes you shared and keep room for questions.`,
    agenda: [
      "Context & success criteria (5m)",
      "Guided tour — core workflows (15m)",
      "Integration & security checkpoints (10m)",
      "Q&A and next steps (10m)",
    ],
    discovery_questions: [
      "What does “good” look like in the first 90 days?",
      "Who else needs to see value for this to move?",
      "What’s blocked similar initiatives in the past?",
    ],
    proof_points: [
      "Show live workflow aligned to your team’s motion",
      "Walk through admin + audit hooks your IT/security team cares about",
    ],
    closing: `We’ll align on owners, timeline, and any proof you need from our side. If it helps, we can schedule a follow-up with data in the room.`,
    invite_email_paragraph: `Working session to walk through a tailored demo for ${company} and confirm fit on workflow, integrations, and rollout.`,
    booking_cta: "Reply with a time or use the calendar invite to book.",
  };
}
