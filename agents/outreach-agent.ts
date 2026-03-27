import {
  buildOutreachSystemPrompt,
  OUTREACH_AGENT_TEMPERATURE,
} from "@/agents/graph-prompts";
import { buildFallbackOutreachDraft } from "@/agents/pipeline-fallbacks";
import type { CustomVoiceProfile, Lead } from "@/agents/types";
import {
  getSdrVoiceOutreachInstructions,
  getSdrVoiceOutreachPriorityNote,
  sdrVoiceLabel,
} from "@/lib/sdr-voice";
import { DEFAULT_BRAND_DISPLAY_NAME } from "@/lib/brand-prompt";
import { normalizeOutreachEmailHtml } from "@/lib/outreach-email-format";
import { resolveOutreachSignoffName } from "@/lib/outreach-signoff";
import { type OutreachDraft, outreachDraftSchema, type SdrVoiceTone } from "@/agents/types";
import { voicemailScriptForLead } from "@/lib/outreach-voicemail";
import {
  invokeWithGroqRateLimitResilience,
  type GroqInvokeMeta,
} from "@/lib/agent-model";

/**
 * Prompt 73 — this module only generates subject + HTML. The graph stores the draft and sets
 * `resend_status: "ready_to_send"`; the user sends via the dashboard (`sendOutreachEmailAction`).
 * `From` uses `buildDynamicFromEmail` at send time (same name as body sign-off).
 *
 * Prompt 76 — `linkedin_message` is always normalized to a non-empty, paste-ready DM (≤300 chars).
 */

export type OutreachAgentResult = {
  draft: OutreachDraft;
  groqInvokeMeta?: GroqInvokeMeta;
};

/** First name for "Hi Karim," — strips honorifics and junk. */
export function leadFirstNameForSalutation(lead: Lead): string {
  const raw = (lead.name ?? "").trim().split(/\s+/)[0] ?? "";
  let s = raw.replace(/^[^a-zA-ZÀ-ÿ]+/u, "");
  const cut = s.search(/[^a-zA-ZÀ-ÿ'-]/u);
  if (cut !== -1) s = s.slice(0, cut);
  return s.length > 0 ? s : "there";
}

/** Prompt 76 — guarantees a safe, human paste target for dashboard copy / compose link. */
function ensureLinkedInMessage(lead: Lead, raw: string): string {
  const t = raw.trim().replace(/\s+/g, " ");
  if (t.length > 0) return t.slice(0, 300);
  const first = leadFirstNameForSalutation(lead);
  const co = (lead.company || "your team").trim();
  const shortCo = co.split(/\s+/).slice(0, 4).join(" ").slice(0, 48);
  return `Hi ${first} — quick note on ${shortCo}: worth a two-line reply if still relevant?`.slice(
    0,
    300,
  );
}

export async function runOutreachAgent(
  lead: Lead,
  priorStageContext: string | undefined,
  sdrVoice: SdrVoiceTone,
  opts?: {
    senderSignoffName?: string;
    customVoice?: CustomVoiceProfile | null;
    brandDisplayName?: string;
  },
): Promise<OutreachAgentResult> {
  const voice = sdrVoice;
  const custom = opts?.customVoice ?? undefined;
  const brand = opts?.brandDisplayName?.trim() || DEFAULT_BRAND_DISPLAY_NAME;
  const voiceBlock = getSdrVoiceOutreachInstructions(voice, custom);
  const priority = getSdrVoiceOutreachPriorityNote(voice, custom);
  const firstName = leadFirstNameForSalutation(lead);
  const signName = resolveOutreachSignoffName(opts?.senderSignoffName);
  const signOffHtmlInstruction = signName
    ? `SIGN_OFF_NAME (exact — final <p> only): <p>Best regards,<br/>${signName}<br/>${brand}</p> — three visual lines: closing phrase, sender full name, company.`
    : `SIGN_OFF_NAME: (none from account or env) — final <p> must be <p>Best regards,<br/>${brand}</p> (two lines).`;

  const defaultWarmthBlock =
    voice === "default"
      ? `Prompt 39 + **48**: **Veteran SDR** — relaxed, conversational, **benefit-first** (what they get back: time, clarity, less thrash) without brochure tone. **Human-first opening** + soft landing; **one main idea per <p>**; read-aloud smooth. LinkedIn = **different** from email: shorter, more casual DM — never a trimmed email. No meta about "research" or sources.`
      : `Default baseline warmth applies **only where it does not contradict** SDR_VOICE. If tradeoff, **choose SDR_VOICE**.`;

  const voiceDisplay = custom?.name?.trim() ? `${sdrVoiceLabel(voice)} / ${custom.name}` : sdrVoiceLabel(voice);
  const human = `=== ACTIVE_CAMPAIGN_VOICE (graph → outreach_node) ===
sdrVoice: ${voice} (${voiceDisplay})
=== ${priority} ===
SDR_VOICE_PRESET: ${voice}${custom ? ` + CUSTOM:"${custom.name}"` : ""}
${voiceBlock || "SDR_VOICE: default — balanced human SDR bar."}

=== Prompt 66 + 68 — greeting + paragraphs + signature (non-negotiable) ===
LEAD_FIRST_NAME_FOR_SALUTATION: ${firstName}
**First <p> must contain ONLY the greeting** — exactly: Hi ${firstName}, — **no other words** in that paragraph.
**Body:** **2–4 separate <p> tags** between greeting and sign-off; each <p> is a short block (one idea); **never** one giant <p> for the whole letter.
${signOffHtmlInstruction}

LEAD: ${JSON.stringify(lead)}
PRIOR_RESEARCH_JSON: ${priorStageContext?.trim() ? priorStageContext : "(none — lead fields only)"}

Valid HTML email_body; linkedin_message ≤300 chars. ${defaultWarmthBlock} **0 ? in body default; max 1** (voice presets may tighten further per SDR_VOICE). **100–175 words** in the body **excluding** salutation and sign-off lines. **Prompt 68:** **≥4 <p> tags** total: (1) greeting only, (2–4) body, (last) Best regards + br + name + br + ${brand}. Ban stiff/generic phrases (checking in, following up on, per my last, as discussed, utilize, streamline, robust, paradigm, holistic, unpack, etc.). **Prompt 48 + 57 + 58:** every line = **homework-done human** — benefit-first, low-pressure, **high reply potential**; **subject** = **curiosity-native** peer text. **warm_relationship_builder:** email + LinkedIn must feel **genuinely warm and consultative** — **zero** corporate jargon; **tier-1 SDR** bar vs default. **Prompt 58:** **inbox read-aloud** clean; subject **anchors** on a real research detail when preset is warm. **Prompt 69:** When PRIOR_RESEARCH_JSON is present, **primary_angle**, hooks, and body must **follow** that dossier (pains, ICP tension, messaging_angles) — **not** interchangeable SaaS lines. Rewrite until subject + body + LinkedIn **prove** preset **${voice}** to a skeptical AE.`;

  const systemPrompt = buildOutreachSystemPrompt(sdrVoice, custom, brand);
  const prompt = `${systemPrompt}\n\n---\n${human}`;

  try {
    const { value: raw, meta } = await invokeWithGroqRateLimitResilience(
      "outreach_agent",
      OUTREACH_AGENT_TEMPERATURE,
      (m) =>
        m
          .withStructuredOutput(outreachDraftSchema, { name: "outreach_draft" })
          .invoke(prompt),
    );
    const parsed = outreachDraftSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn("[AgentForge] outreach_agent:parse_fallback", parsed.error.flatten());
      const fb = buildFallbackOutreachDraft(
        lead,
        "outreach_schema_parse_failed",
        opts?.senderSignoffName,
        brand,
      );
      return {
        draft: { ...fb, linkedin_message: ensureLinkedInMessage(lead, fb.linkedin_message) },
        groqInvokeMeta: meta,
      };
    }
    const draft = {
      ...parsed.data,
      email_body: normalizeOutreachEmailHtml(parsed.data.email_body, {
        firstName,
        signOffName: signName,
        brandDisplayName: brand,
      }),
      linkedin_message: ensureLinkedInMessage(lead, parsed.data.linkedin_message),
    };
    return { draft, groqInvokeMeta: meta };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[AgentForge] outreach_agent:invoke_fallback", message);
    const fb = buildFallbackOutreachDraft(lead, message, opts?.senderSignoffName, brand);
    return {
      draft: { ...fb, linkedin_message: ensureLinkedInMessage(lead, fb.linkedin_message) },
    };
  }
}
