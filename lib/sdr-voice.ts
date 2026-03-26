import type { Lead, SdrVoiceTone } from "@/agents/types";

export const SDR_VOICE_OPTIONS: {
  value: SdrVoiceTone;
  label: string;
  short: string;
}[] = [
  {
    value: "consultative_enterprise",
    label: "Consultative Enterprise",
    short: "Strategic, long-horizon partner tone — thoughtful, no hype.",
  },
  {
    value: "warm_relationship_builder",
    label: "Warm Relationship Builder",
    short:
      "Premium consultative warmth — homework-heavy, curiosity subjects, generous easy-outs (tier above default).",
  },
  {
    value: "bold_challenger",
    label: "Bold Challenger",
    short: "Direct, status-quo probing — provocative within professional bounds.",
  },
  {
    value: "data_driven_analyst",
    label: "Data-Driven Analyst",
    short: "Metrics, benchmarks, ROI framing — numbers where honest.",
  },
  {
    value: "default",
    label: "Default (current)",
    short: "Balanced human SDR — warm, smooth, high-reply.",
  },
];

export function resolveSdrVoiceTone(lead: Lead): SdrVoiceTone {
  return lead.sdr_voice_tone ?? "default";
}

/** Research phase: shape intel so downstream copy can execute the voice. */
export function getSdrVoiceResearchInstructions(tone: SdrVoiceTone): string {
  switch (tone) {
    case "data_driven_analyst":
      return `RESEARCH_VOICE (Data-Driven Analyst) — MUST influence all narrative fields (Prompt 43):
- executive_summary + icp_fit_summary: **dense** quant + benchmark framing; end executive_summary with a **lift / ROI path** line (e.g. **building toward 15–25%** …) when honest; hedge extrapolation in **plain prose** — **never** the substring **(inferred)** in customer-facing strings.
- pain_points: **measurable leakage** only (cycle time, conversion pts, CAC, cost of delay $/wk, yield) — no vague "challenges".
- messaging_angles: each **metric-anchored**; **≥1** references **funnel stage yield**, **cohort**, or **payback**.
- key_stakeholders: **who owns the numbers** (RevOps, CFO, data lead) when plausible.
- recent_news_or_funding_summary: **quantified business impact** when reasonable.`;
    case "consultative_enterprise":
      return `RESEARCH_VOICE (Consultative Enterprise) — MUST influence all narrative fields:
- executive_summary + icp_fit_summary: **strategic partnership** lens — multi-year motion, governance, risk, capability building — not transactional SaaS pitch.
- pain_points: **enterprise mechanics** — silos, steering cadence, procurement, security posture, change management.
- messaging_angles: **board- and exec-credible** — initiative-based, roadmap-aligned, no slang.
- key_stakeholders: emphasize **economic buyer + operational sponsor** patterns.`;
    case "warm_relationship_builder":
      return `RESEARCH_VOICE (Warm Relationship Builder) — MUST influence all narrative fields (Prompt 43 + **57** + **58** + **67** + **69**):
- executive_summary + icp_fit_summary: **100% unique to this lead** — **swap-test** both; **ban** SaaS wallpaper ("scaling aggressively", "finance enablement", "hypergrowth", "moving fast" as empty filler, etc.) unless quoting a **named** source. **≤2** peer phrases total across both fields ("peers in your seat", etc.) — each **tied to a concrete** company/role/notes/web detail.
- **Prompt 58:** Weave **real product/motion terms** from site or digest when they exist — **no** exec↔ICP circular repeat.
- **Prompt 67:** Dossier fields must read **consultative and human** — **top-decile SDR** quality; **PDF-safe** (no template rhythm across exec, ICP, BANT evidence).
- **Prompt 69:** **Elite** bar — **reasoning_steps** (6–8) **consultant-sharp**; **executive + ICP** **insight-dense**; zero **enrichment-table** blandness.
- Lead with **human operating reality** before metrics; sound like you're **briefing a friend rep**, not a benchmark PDF.
- **Spend/fintech / expense / corporate-card** accounts **only when sourced:** use clear language (cards, reimbursements, bill pay, close, accounting sync). **Ramp** only if lead is Ramp: align with **their** motion from digest/site — spend management, corporate cards, accounting automation — **business scale** (e.g. **50k+**) **only** if **stated** in sources.
- pain_points: **people + workflow first** (trust, handoffs, clarity, bandwidth) **with** one **specific** business consequence per line — no generic "challenges".
- messaging_angles: **relationship hooks** — collaborative tests, low-pressure experiments; **no** challenger aggression.
- reasoning_steps (via system prompt): must feel like **your own call prep** — fragmented, human, **not** six parallel "We should…" lines.
- stakeholders: **who lives the pain daily** vs **who signs** — use **name patterns** when plausible.`;
    case "bold_challenger":
      return `RESEARCH_VOICE (Bold Challenger) — MUST influence all narrative fields (Prompt 43 — **obvious** vs default):
- executive_summary + icp_fit_summary: name **status-quo tax**, **blind spot**, or **faulty assumption** — with **≥1 numeric or time band** (e.g. **15–25%**, **6–10 weeks**, **$ band**); use **"often / typically"** when extrapolating — **never** **(inferred)** in output strings.
- pain_points: **mechanism + implied cost** each line; challenge complacency — **not** insults.
- messaging_angles: **contrarian-but-professional** — pattern interrupts, **"Most teams assume…"** style where it fits.
- Avoid empty bravado; every challenge ties to **evidence or a tight plain-language range**.`;
    default:
      return `RESEARCH_VOICE (Default): Balanced, insight-dense research — sharp distinct lists, no generic filler, stable icp_fit_score per Prompt 38 + **57** + **58** (swap-test exec/ICP; product-surface anchoring when sourced; ban SaaS wallpaper).`;
  }
}

/**
 * Outreach: dominant block. When not default, explicitly overrides generic "warmth first" copy rules.
 */
export function getSdrVoiceOutreachInstructions(tone: SdrVoiceTone): string {
  switch (tone) {
    case "data_driven_analyst":
      return `SDR_VOICE — Data-Driven Analyst (**WINS over any generic warmth rule**) — Prompt 43:
- Subject: **must** telegraph **metric / benchmark / ROI / funnel** (still human-readable).
- Email HTML: **2–4 <p>**; stack **multiple** concrete numbers or tight **X–Y%** bands in prose ("peers often see …"); tie each to **pipeline, CAC, cycle time, yield, payback, or cohort** outcomes — **no** "(inferred …)" tags in the copy.
- LinkedIn ≤300 chars: **≥1** explicit **% or number** + one **ROI or funnel** clause.
- Word count 100–175 still applies; **density of evidence > emotional softening**.
- Questions in body: **max 1**, optional; prefer **statement-led** analysis.`;
    case "consultative_enterprise":
      return `SDR_VOICE — Consultative Enterprise (**WINS over casual warmth**):
- Subject: calm, **strategic**, specific — suitable for a senior leader's inbox.
- Email: **long-horizon partnership** framing — initiatives, alignment, governance-friendly language; **no slang**, no hype adjectives.
- Show **thoughtful sequencing** (why now, what good looks like) in **one idea per <p>**.
- LinkedIn: **respectful peer** — concise, no emoji stack; CTA is a **small, credible** next step (working session, not "quick call" spam).
- 0–1 question in body; default **statement-led**.`;
    case "warm_relationship_builder":
      return `SDR_VOICE — Warm Relationship Builder — Prompt 43–44 + **57** + **58** + **66** + **67** (**premium consultative — top-tier human SDR**):
- **Opening (Prompt 68):** **Hi [FirstName],** or **Hey [FirstName],** as the **only** text in the **first** HTML paragraph — **mandatory**; body starts in the **next** paragraph; then **personalization** from research (never generic).
- Subject: **curiosity-driven**, **≤8 words**; **natural** peer line — **not** marketing; **prefer** one proper-noun or anchor **only this account** earns; **no** "Thoughts on / Quick question" / webinar tone.
- Email: **≥1** line with **"I've seen teams like yours"** / **"teams in your position"** / **"folks in your seat"** tied to a **named** research detail; **generous CTA** + **easy out** in the **paragraph before** the formal sign-off.
- **Prompt 67:** **Relationship-oriented** — one **sourced** line that **recognizes their mandate or motion** (not generic praise); **spend/fintech** language only when research supports — **plain English**.
- **Closing:** **Best regards** or **Warm regards**, then **name** + **AgentForge Sales** (as in system prompt) — **never** a naked "Cheers" without the full signature block.
- **Consultative** > vendor: observations and **plain stakes**; **zero** corporate jargon (no "leverage", "synergies", "solutions", "unlock", "empower" — use normal words).
- Light **"we / together"** once if natural. **One sentence** may state a **clear POV** as a peer.
- LinkedIn: **different hook** than email; rapport-first; closing may use **"happy to share"** / **"no strings"** / **"only if useful"** (waived ban for that clause only).
- **100–175 words** body + greeting + sign-off; **homework-done** warmth — **not** robotic or low-effort.`;
    case "bold_challenger":
      return `SDR_VOICE — Bold Challenger (**WINS over "safe" warmth**) — Prompt 43–44:
- Subject: **direct / pattern-interrupt** — **not** a cozy default subject; still professional.
- Email: **≥2 numeric provocations** (**%**, **$**, **weeks**, **pts**) framing **pattern risk** or **benchmark gap** (use **"often" / "typically" / "peers"**, not **"you failed"**). Plus **≥1** proof point from research. **≤1** rhetorical question in the full body.
- LinkedIn: **one line** that **surfaces a blind spot or cost of waiting** + sharp idea — **curious**, not scolding.
- 0–1 question total in email; prefer **statement-led reframe**.
- Avoid insult, arrogance, culture-war — **professional tension only**.`;
    default:
      return "";
  }
}

/** When voice !== default, tell the model not to dilute preset with generic default-tone smoothing. */
export function getSdrVoiceOutreachPriorityNote(tone: SdrVoiceTone): string {
  switch (tone) {
    case "default":
      return "VOICE_PRIORITY: default — follow Path 39 beta polish (warm, smooth, human-first) as primary stylistic anchor.";
    case "warm_relationship_builder":
      return `VOICE_PRIORITY: **warm_relationship_builder** — **Rapport and collaborative language WIN** over collapsing into generic default smoothness. Keep **peer phrases + generous CTA** visible even if the model tries to "sanitize" the voice. Subject/body/LinkedIn must read **noticeably warmer** than default.`;
    case "bold_challenger":
      return `VOICE_PRIORITY: **bold_challenger** — **Professional tension + numeric provocation WIN** over polite hedging, but **never** at the cost of **credibility or respect**. Use **peer/industry** framing ("teams often see…") not **accusatory** tone. **≤1** rhetorical **?** in the email body.`;
    case "data_driven_analyst":
      return `VOICE_PRIORITY: **data_driven_analyst** — **Metrics in subject + body WIN** over warmth-first rules when they conflict. Prefer **funnel math / ROI / benchmark** density over emotional softening.`;
    case "consultative_enterprise":
      return `VOICE_PRIORITY: **consultative_enterprise** — **Exec-credible, strategic register WINS** over casual warmth or slang. The SDR_VOICE + system layer **override** junior-sounding phrasing.`;
    default:
      return `VOICE_PRIORITY: **${tone}** — The SDR_VOICE block **overrides** conflicting generic warmth or tone smoothing. Execute the preset faithfully.`;
  }
}

export function getSdrVoiceNurtureInstructions(tone: SdrVoiceTone): string {
  switch (tone) {
    case "data_driven_analyst":
      return `NURTURE_VOICE (Data-Driven Analyst) — **mandatory across all 3 steps** (Prompt 43):
- Each step: **summary** or **value_add_idea** carries **≥1** of: **%**, **$ band**, **funnel-stage yield**, **cohort**, **payback**, **ROI sketch** (honest hedge in prose when extrapolating).
- **sequence_summary:** state the **metric arc** ("building toward **X–Y%** lift if …" / **funnel math** hypothesis) in plain language.
- Vary channels; **≥1** step proposes a **quant asset** (benchmark brief, ROI one-pager, funnel template).`;
    case "consultative_enterprise":
      return `NURTURE_VOICE (Consultative Enterprise):
- Steps read as **advisor chapters** — hypothesis, stakeholder map, governance — not a generic drip.
- sequence_summary frames **multi-touch strategic partnership** cadence.
- CTAs implied in copy: **working sessions, readouts, steering artifacts** — not cheesy "checking in".`;
    case "warm_relationship_builder":
      return `NURTURE_VOICE (Warm Relationship Builder) — Prompt 43 + **57** + **58** + **67** + **69**:
- **Helpful relationship-building** — reads like **you're helping an AE friend**, not executing a script. **gift-style** value_add_ideas — **no guilt trips**, no "just checking in" as the whole value.
- **sequence_summary:** conversational — **one breath** you'd say out loud; **no** drip-meta ("touch 1", "cadence step").
- **Prompt 67:** Each step **materially different** — **story advances**; **no** three polite pings. **Strategic** timing_rationale — **why this spacing** for **this** buyer.
- **Prompt 69:** **Bespoke** cadence — **named assets**, **causal timing** between touches; **arc** in sequence_summary (insight → proof → path or similar).
- Each step **different warm opening** + **different verb**; **unscripted** helpfulness; tie to **objections** with empathy.
- **Prompt 58:** every **content_asset_suggestion** = **named artifact** (specific checklist, template, benchmark slice) for **this** company's motion.`;
    case "bold_challenger":
      return `NURTURE_VOICE (Bold Challenger) — Prompt 43:
- **One sharp angle per step** — reframe or **respectfully challenge**; tie to objections when known.
- **sequence_summary:** **tension → proof → path** with **≥1** cost-of-delay or **% band** hook (plain-language hedge when extrapolating).
- **Max one provocative ? per step**; professional only.`;
    default:
      return `NURTURE_VOICE (Default): Effortless human cadence per Prompt 38 — creative value, no recycled filler.`;
  }
}

/** Qualification human: scoring alignment. */
export function getSdrVoiceQualificationHint(tone: SdrVoiceTone): string {
  switch (tone) {
    case "consultative_enterprise":
      return "Score/copy test: consultative enterprise — reward strategic, measured playbook; penalize hype and slang.";
    case "warm_relationship_builder":
      return "Score/copy test: warm relationship — reward trust-building, empathetic NBA; penalize pushy or template-y tone.";
    case "bold_challenger":
      return "Score/copy test: bold challenger — reward crisp POV and professional tension; penalize empty bravado or rudeness.";
    case "data_driven_analyst":
      return "Score/copy test: data-driven — reward metrics/ROI clarity in outreach; penalize vague claims with no anchor.";
    default:
      return "Score/copy test: default — balanced human SDR quality.";
  }
}

/** bant_summary + next_best_action must sound like this voice. */
export function getSdrVoiceQualificationPlaybookInstructions(tone: SdrVoiceTone): string {
  switch (tone) {
    case "data_driven_analyst":
      return `Write **bant_summary** and **next_best_action** in **Data-Driven Analyst** voice: cite **specific metrics to validate**, benchmarks to bring, and ROI discovery steps. Name **artifacts** (e.g. baseline funnel math, cohort readout). Objections: still buyer-voice, but your reasoning lines can reference **quantified risk**. **Prompt 48:** do not echo research exec / ICP / news / BANT evidence strings — synthesize freshly.`;
    case "consultative_enterprise":
      return `Write **bant_summary** and **next_best_action** in **Consultative Enterprise** voice: strategic framing, **long-term partnership**, steering cadence, stakeholders, governance. NBA = **named deliverables + decision criteria** (no casual "ping me"). **Prompt 48:** bant_summary must not parrot research narrative fields — new framing.`;
    case "warm_relationship_builder":
      return `Write **bant_summary** and **next_best_action** in **Warm Relationship Builder** voice (Prompt 43 + **57** + **58** + **67** + **69**): empathetic, **"we can validate together"**, **strategic** — name **unknowns**, **political risk**, **gentle multithread** paths — **Slack cadence**, not memo (**58**: no "Furthermore" / "It is important to"). **Prompt 67:** sound like **deal-coaching a friend** — **nuanced** objections framing, **zero** checkbox BANT. **Prompt 69:** trace **hypotheses** to this account's **research story** — no generic SaaS objections. NBA = **sequenced choreography** (ease risk → proof → expand) + **≥1 generous offer** + **easy out**. **Prompt 48:** bant_summary must not reuse sentences from research exec / ICP / news / BANT evidence. Objections in JSON stay **buyer-voice**; your bant_summary/NBA stay **AE-coach** voice.`;
    case "bold_challenger":
      return `Write **bant_summary** and **next_best_action** in **Bold Challenger** voice (Prompt 43): **assumptions to stress-test**, **status-quo tax** in **numbered or ranged** terms where honest. NBA = **sharp discovery move** (hypothesis, trap, proof that flips skepticism). **top_objections reasoning** should lean **quantified deal risk**. **Prompt 48:** bant_summary must not copy research exec / ICP / news / BANT evidence — challenge in fresh language.`;
    default:
      return `Write **bant_summary** and **next_best_action** in **default** balanced tone: crisp, human, playbook-ready per Prompt 38. **bant_summary** must not recycle sentences from research **executive_summary**, **icp_fit_summary**, **recent_news**, or **bant evidence** — synthesize in new words (Prompt 48).`;
  }
}

/** Appended to qualification ANCHOR from graph — shifts scoring rubric by voice. */
export function getSdrVoiceQualificationScoringSupplement(tone: SdrVoiceTone): string {
  switch (tone) {
    case "data_driven_analyst":
      return `Reward outreach that **anchors claims in numbers, benchmarks, or operational metrics** (honest hedging in prose when extrapolating). Penalize fluffy benefits with no measurable hook. Qual scores should reflect **evidence-forward** fit.`;
    case "consultative_enterprise":
      return `Reward **strategic, long-horizon** copy and NBA; penalize transactional or slang-heavy outreach. Qual scores favor **exec-credible** motion.`;
    case "warm_relationship_builder":
      return `Reward **empathy + specific rapport** (not generic kindness). **Prompt 58 + 67 + 69:** warm outreach + bant_summary must feel **clearly premium** vs default — homework, named anchors, consultative ease, **relationship-aware** lines, **research-grounded** objections/NBA. Penalize aggressive or cold sequences **and** templated BANT/objections. Qual scores favor **trust-building** quality.`;
    case "bold_challenger":
      return `Reward **professional tension + clear POV**; penalize bland safe text OR rude/aggressive tone. Qual scores favor **memorable, respectful challenge**.`;
    default:
      return `Use standard Prompt 39 warmth/smooth reward curve for outreach quality.`;
  }
}

export function sdrVoiceLabel(tone: SdrVoiceTone | undefined): string {
  const t = tone ?? "default";
  return SDR_VOICE_OPTIONS.find((o) => o.value === t)?.label ?? "Default";
}
