"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Activity,
  AlertCircle,
  Brain,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardCopy,
  CloudUpload,
  Cpu,
  Download,
  ExternalLink,
  Eye,
  HelpCircle,
  FileJson,
  FileText,
  Lightbulb,
  Loader2,
  Mail,
  MessageSquare,
  Mic,
  Play,
  Radar,
  ScrollText,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ComponentType, ReactNode } from "react";
import { useCallback, useEffect, useState, useTransition } from "react";
import type { CampaignRerunPayload } from "@/components/dashboard/campaign-rerun-types";
import { useForm } from "react-hook-form";
import {
  exportCampaignToHubSpotAction,
  previewLeadEnrichmentAction,
  sendOutreachEmailAction,
  startCampaignAction,
} from "@/app/(dashboard)/actions";
import { DashboardReplyStrip } from "@/components/dashboard/dashboard-reply-strip";
import { useReplyIntel } from "@/components/dashboard/reply-intel-context";
import { PdfBrandingPanel } from "@/components/dashboard/pdf-branding-panel";
import { campaignSnapshotToMarkdown } from "@/lib/campaign-markdown";
import { buildCampaignSummaryExport } from "@/lib/campaign-summary-export";
import {
  computeCampaignStrength,
  safeCampaignDownloadBasename,
} from "@/lib/campaign-strength";
import type { CampaignStrengthResult } from "@/lib/campaign-strength";
import { dashboardOutlineActionClass } from "@/lib/dashboard-action-classes";
import { emailPlainTextFromHtml } from "@/lib/email-plain";
import {
  leadFormSchema,
  type CampaignClientSnapshot,
  type LeadEnrichmentPayload,
  type LeadFormInput,
} from "@/agents/types";
import { toast } from "@/hooks/use-toast";
import { buildCampaignPdfExportOptions, loadPdfBranding } from "@/lib/pdf-branding";
import { getVoiceSampleEmailPreview } from "@/lib/sdr-voice-preview";
import { SDR_VOICE_OPTIONS, sdrVoiceLabel, voiceLabelForLead } from "@/lib/sdr-voice";
import type { CustomVoiceRow, WhiteLabelClientSettingsDTO } from "@/types";
import { textEchoesAnyCorpus } from "@/lib/text-similarity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function displayResearchBantEvidence(evidence: string, research: Record<string, unknown>): string {
  const exec = String(research.executive_summary ?? "");
  const icp = String(research.icp_fit_summary ?? "");
  const news = String(
    (research as { recent_news_or_funding_summary?: string }).recent_news_or_funding_summary ?? "",
  );
  if (textEchoesAnyCorpus(evidence, [exec, icp, news])) {
    return "Same theme as the account overview — validate on discovery.";
  }
  return evidence;
}

const RESEND_KEY_MISSING =
  "Email not sent — add RESEND_API_KEY to enable delivery from this workspace.";

const resultCardClass =
  "rounded-2xl border border-border/70 bg-card shadow-xl ring-1 ring-black/[0.03] backdrop-blur-sm transition-all duration-300 hover:shadow-2xl hover:ring-border/45 dark:bg-card/92 dark:ring-white/[0.05]";

const resultsCardHeaderClass =
  "space-y-0 border-b border-border/50 bg-gradient-to-r from-muted/50 via-muted/12 to-transparent px-6 pb-5 pt-6";

const resultsCardContentClass = "space-y-7 px-6 pb-8 pt-7 text-[15px] leading-relaxed";

function strengthTierBadgeClass(label: CampaignStrengthResult["label"]): string {
  switch (label) {
    case "Strong":
      return "border-emerald-500/45 bg-emerald-500/[0.14] text-emerald-950 shadow-sm dark:border-emerald-400/40 dark:bg-emerald-500/18 dark:text-emerald-50";
    case "Promising":
      return "border-sky-500/40 bg-sky-500/[0.12] text-sky-950 shadow-sm dark:border-sky-400/35 dark:bg-sky-500/14 dark:text-sky-50";
    case "Solid":
      return "border-border/70 bg-muted/45 text-foreground dark:bg-muted/30";
    case "Mixed":
      return "border-amber-500/45 bg-amber-500/[0.12] text-amber-950 dark:text-amber-50";
    case "At risk":
      return "border-red-500/45 bg-red-500/[0.12] text-red-950 dark:text-red-50";
    default:
      return "";
  }
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Stages that completed on a lighter Groq model after rate limits (output still reviewable). */
function collectRateLimitFallbackStages(
  snapshot: CampaignClientSnapshot,
): string[] {
  const r = snapshot.results ?? {};
  const pairs: [string, string][] = [
    ["research_node", "Research"],
    ["outreach_node", "Outreach"],
    ["qualification_node", "Qualification"],
    ["nurture_node", "Nurture"],
  ];
  return pairs
    .filter(([key]) => {
      const n = r[key];
      return isRecord(n) && n.rate_limit_lighter_model === true;
    })
    .map(([, label]) => label);
}

type QualificationRow = { objection: string; reasoning: string };

function normalizeQualObjections(raw: unknown): QualificationRow[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: QualificationRow[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      out.push({ objection: item, reasoning: "" });
    } else if (isRecord(item) && typeof item.objection === "string") {
      out.push({
        objection: item.objection,
        reasoning:
          typeof item.reasoning === "string"
            ? item.reasoning
            : typeof item.brief_reason === "string"
              ? item.brief_reason
              : "",
      });
    }
  }
  return out.length ? out : null;
}

/** Normalized qualification for UI (legacy string[] objections + Prompt 10 objects). */
function getQualificationDisplay(d: unknown): {
  score: number;
  bant_summary: string;
  top_objections: QualificationRow[];
  next_best_action: string;
} | null {
  if (!isRecord(d) || typeof d.score !== "number") return null;
  if (typeof d.bant_summary !== "string") return null;
  const obs = normalizeQualObjections(d.top_objections);
  if (!obs) return null;
  const nba =
    typeof d.next_best_action === "string"
      ? d.next_best_action
      : typeof d.recommended_action === "string"
        ? d.recommended_action
        : null;
  if (!nba) return null;
  return {
    score: d.score,
    bant_summary: d.bant_summary,
    top_objections: obs,
    next_best_action: nba,
  };
}

function scoreTierClass(score: number): string {
  if (score > 70) {
    return "border-emerald-600/45 bg-emerald-600/12 text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-500/12 dark:text-emerald-50";
  }
  if (score >= 40) {
    return "border-amber-500/50 bg-amber-500/12 text-amber-950 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-50";
  }
  return "border-red-600/45 bg-red-600/12 text-red-950 dark:border-red-500/40 dark:bg-red-500/12 dark:text-red-50";
}

function ScoreTierBadge({
  score,
  prefix = "",
}: {
  score: number;
  prefix?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 tabular-nums font-semibold", scoreTierClass(score))}
      title={
        score > 70
          ? "Strong fit — advance with clear qualification"
          : score >= 40
            ? "Workable — discovery will clarify risk"
            : "Low fit — validate before investing cycles"
      }
    >
      {prefix ? <span>{prefix}</span> : null}
      {score}
      <span className="font-normal opacity-80">/100</span>
    </Badge>
  );
}

function qualificationHeroShellClass(score: number): string {
  if (score > 70) {
    return "border-emerald-500/45 bg-gradient-to-br from-emerald-500/[0.15] via-emerald-500/[0.07] to-transparent dark:from-emerald-500/18 dark:via-emerald-950/55";
  }
  if (score >= 40) {
    return "border-amber-500/45 bg-gradient-to-br from-amber-500/[0.14] via-amber-500/[0.07] to-transparent dark:from-amber-500/15 dark:via-amber-950/45";
  }
  return "border-red-500/45 bg-gradient-to-br from-red-500/[0.12] via-red-500/[0.06] to-transparent dark:from-red-500/15 dark:via-red-950/50";
}

function qualificationTierHeadline(score: number): string {
  if (score > 70) {
    return "Strong signal — book discovery and define exit criteria with the champion.";
  }
  if (score >= 40) {
    return "Viable opportunity — run disciplined discovery; objections set the playbook.";
  }
  return "Early-stage — confirm ICP and economic buyer before scaling rep effort.";
}

function OverallCampaignStrength({ snapshot }: { snapshot: CampaignClientSnapshot }) {
  const s = computeCampaignStrength(snapshot);
  const barClass =
    s.composite >= 74
      ? "bg-emerald-500 dark:bg-emerald-400"
      : s.composite >= 56
        ? "bg-amber-500 dark:bg-amber-400"
        : "bg-red-500 dark:bg-red-400";
  const signalBits: string[] = [];
  if (s.icp != null) signalBits.push(`ICP ${s.icp}`);
  if (s.qual != null) signalBits.push(`Qual ${s.qual}`);
  const signalLine = signalBits.length ? signalBits.join(" · ") : null;
  return (
    <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-background via-muted/40 to-muted/5 px-6 py-6 shadow-lg ring-1 ring-black/[0.025] sm:px-8 sm:py-7 dark:from-background dark:via-muted/25 dark:to-muted/[0.04] dark:ring-white/[0.04]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="mt-0.5 rounded-xl border border-border/60 bg-background/95 p-2.5 shadow-sm">
            <Activity className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
              Overall campaign strength
            </p>
            {signalLine ? (
              <p className="mt-1.5 font-semibold tabular-nums tracking-tight text-foreground">
                {signalLine}
              </p>
            ) : null}
            <p
              className={cn(
                "leading-relaxed text-muted-foreground",
                signalLine ? "mt-1 text-sm" : "mt-1.5 text-sm",
              )}
            >
              {s.summary}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 sm:pl-2">
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold tabular-nums tracking-tight text-foreground sm:text-5xl">
              {s.composite}
            </span>
            <span className="pb-1 text-base font-medium text-muted-foreground sm:text-lg">/100</span>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "px-3 py-1 text-xs font-bold uppercase tracking-wide",
              strengthTierBadgeClass(s.label),
            )}
          >
            {s.label}
          </Badge>
        </div>
      </div>
      <div className="mt-5 h-3 overflow-hidden rounded-full bg-black/[0.08] dark:bg-white/[0.12]">
        <div
          className={cn("h-full rounded-full transition-all duration-700", barClass)}
          style={{ width: `${s.composite}%` }}
          role="progressbar"
          aria-valuenow={s.composite}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Overall campaign strength ${s.composite} out of 100`}
        />
      </div>
      <p className="mt-2.5 text-[11px] font-medium tabular-nums text-muted-foreground">
        {s.stepsComplete}/4 stages complete · Blended signal index ~{s.signalCore}
        {snapshot.outreach_output?.email_sent ? " · First touch delivered" : ""}
      </p>
    </div>
  );
}

function QualificationScoreVisual({ score }: { score: number }) {
  const tier =
    score > 70
      ? { label: "Strong opportunity signal", barClass: "bg-emerald-500 dark:bg-emerald-400" }
      : score >= 40
        ? {
            label: "Qualified with open threads",
            barClass: "bg-amber-500 dark:bg-amber-400",
          }
        : { label: "Needs further validation", barClass: "bg-red-500 dark:bg-red-400" };
  const w = Math.min(100, Math.max(0, score));
  return (
    <div className="mt-5 max-w-md">
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.1]">
        <div
          className={cn("h-full rounded-full transition-all duration-500", tier.barClass)}
          style={{ width: `${w}%` }}
          role="progressbar"
          aria-valuenow={w}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Score ${w} out of 100`}
        />
      </div>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {tier.label}
      </p>
    </div>
  );
}

/** Older persisted snapshots (pre–simplified schema). */
function isLegacyQualificationDetail(d: unknown): d is Record<string, unknown> {
  return (
    isRecord(d) &&
    typeof d.score === "number" &&
    Array.isArray(d.objections) &&
    !Array.isArray(d.top_objections)
  );
}

function humanizeClientError(message: string): string {
  const m = message.trim();
  if (m.includes("Missing GROQ_API_KEY – please add it to .env.local")) return m;
  if (
    /GROQ_API_KEY|ANTHROPIC_API_KEY|Configure GROQ|No LLM provider/i.test(m) ||
    (/too_small|string must contain at least 1 character/i.test(m) &&
      /GROQ|ANTHROPIC|API_KEY/i.test(m))
  ) {
    return "Missing GROQ_API_KEY – please add it to .env.local";
  }
  return m;
}

function formatCompletedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function StepBadge({ ok, label }: { ok: boolean; label: string }) {
  if (ok) {
    return (
      <Badge variant="default" className="gap-1 border-green-600/30 bg-green-600/15 text-green-900 hover:bg-green-600/20 dark:text-green-100">
        <CheckCircle2 className="h-3 w-3" />
        {label}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-amber-600/40 text-amber-900 dark:text-amber-100">
      <AlertCircle className="h-3 w-3" />
      Warning
    </Badge>
  );
}

function isOutreachReadyToSend(outreach: {
  email_sent: boolean;
  resend_status?: string;
}): boolean {
  return outreach.resend_status === "ready_to_send" && !outreach.email_sent;
}

function outreachNotice(outreach: {
  email_sent: boolean;
  send_error?: string;
  subject: string;
  resend_status?: string;
}): { friendly: string; detail?: string } {
  if (outreach.email_sent) {
    return { friendly: "" };
  }
  if (isOutreachReadyToSend(outreach)) {
    return {
      friendly:
        "Draft generated — click Send Email above to deliver via Resend.",
      detail: undefined,
    };
  }
  if (outreach.send_error === RESEND_KEY_MISSING) {
    return { friendly: outreach.send_error, detail: undefined };
  }
  return {
    friendly:
      "Email not sent — complete Resend domain verification to send from this workspace.",
    detail: outreach.send_error,
  };
}

function SectionLabel({
  icon: Icon,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
      <Icon className="h-3.5 w-3.5 shrink-0 opacity-85" aria-hidden />
      {children}
    </p>
  );
}

const BANT_KEYS = ["budget", "authority", "need", "timeline"] as const;

function SimplifiedQualificationBody(props: {
  score: number;
  bant_summary: string;
  top_objections: QualificationRow[];
  next_best_action: string;
  degraded?: boolean;
}) {
  const { score, bant_summary, top_objections, next_best_action, degraded } = props;
  return (
    <div className="space-y-5">
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border border-border/80 p-5 shadow-sm sm:p-6",
          qualificationHeroShellClass(score),
        )}
      >
        <div className="pointer-events-none absolute -right-4 -top-4 text-[7rem] font-black leading-none text-foreground/[0.035] dark:text-white/[0.04] sm:text-[9rem]">
          Q
        </div>
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-foreground/15 text-[10px] font-bold uppercase tracking-widest">
                Analyst read
              </Badge>
              <span className="text-[10px] text-muted-foreground">Research · first touch · BANT</span>
              {degraded ? (
                <Badge
                  variant="outline"
                  className="border-amber-500/50 text-[10px] font-medium text-amber-950 dark:text-amber-100"
                >
                  Recovered output
                </Badge>
              ) : null}
            </div>
            <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
              Qualification score
            </p>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
              <span className="text-6xl font-bold tabular-nums tracking-tight text-foreground sm:text-7xl">
                {score}
              </span>
              <span className="text-2xl font-medium text-muted-foreground sm:text-3xl">/ 100</span>
            </div>
            <QualificationScoreVisual score={score} />
            <p className="mt-4 max-w-xl text-sm font-medium leading-relaxed text-foreground/90">
              {qualificationTierHeadline(score)}
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 lg:items-end lg:pt-8">
            <ScoreTierBadge score={score} />
            <span className="text-center text-[10px] tabular-nums text-muted-foreground lg:text-right">
              {top_objections.length} buyer objection{top_objections.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-gradient-to-b from-muted/20 to-transparent px-4 py-4 sm:px-5">
        <SectionLabel icon={Target}>BANT summary</SectionLabel>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Evidence-linked read — ends with lift condition or forecast risk.
        </p>
        <div className="mt-3 text-sm leading-[1.75] text-foreground/95">{bant_summary}</div>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <SectionLabel icon={AlertCircle}>Buyer objections</SectionLabel>
            <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-muted-foreground">
              Specific mechanisms in the buyer&apos;s voice. Each includes{" "}
              <span className="font-semibold text-foreground">why it matters</span> (impact + your move).
            </p>
          </div>
        </div>
        <ul className="grid list-none gap-3 p-0 sm:gap-3.5">
          {top_objections.map((o, i) => (
            <li
              key={`${o.objection}-${o.reasoning}-${i}`}
              className="flex gap-3 rounded-xl border border-border/70 bg-card/80 p-3.5 shadow-sm ring-1 ring-black/[0.02] dark:ring-white/[0.04] sm:gap-4 sm:p-4"
            >
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums text-foreground"
                style={{
                  background:
                    score > 70
                      ? "rgb(16 185 129 / 0.15)"
                      : score >= 40
                        ? "rgb(245 158 11 / 0.18)"
                        : "rgb(239 68 68 / 0.12)",
                }}
              >
                {i + 1}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-[15px] font-semibold leading-snug text-foreground">{o.objection}</p>
                {o.reasoning ? (
                  <div className="rounded-lg border-l-[3px] border-l-amber-500/90 bg-amber-500/[0.05] px-3 py-2.5 dark:border-l-amber-400 dark:bg-amber-500/[0.08]">
                    <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-amber-900/90 dark:text-amber-200">
                      Why it matters
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">{o.reasoning}</p>
                  </div>
                ) : (
                  <p className="text-xs italic text-muted-foreground">
                    No &quot;why it matters&quot; provided for this objection.
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4 sm:p-5 dark:border-primary/25 dark:bg-primary/[0.07]">
        <div className="flex flex-wrap items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary opacity-90" aria-hidden />
          <span className="text-xs font-bold uppercase tracking-wide text-foreground">Playbook</span>
          <Badge variant="secondary" className="text-[9px] font-semibold">
            Next best action
          </Badge>
        </div>
        <p className="mt-3 text-[15px] font-medium leading-[1.65] text-foreground">{next_best_action}</p>
      </div>
    </div>
  );
}

function researchIcpScore(r: Record<string, unknown>): number | null {
  return typeof r.icp_fit_score === "number" ? r.icp_fit_score : null;
}

function researchStakeholderList(r: Record<string, unknown>): string[] {
  if (Array.isArray(r.key_stakeholders)) return r.key_stakeholders as string[];
  if (Array.isArray(r.stakeholders)) return r.stakeholders as string[];
  return [];
}

function outreachEmailHtml(o: Record<string, unknown>): string {
  if (typeof o.email_body === "string") return o.email_body;
  if (typeof o.email_html === "string") return o.email_html;
  return "";
}

function EnrichmentPreviewBody({ data }: { data: LeadEnrichmentPayload }) {
  const block = (label: string, text: string) =>
    text.trim() ? (
      <details
        key={label}
        className="group rounded-lg border border-border/60 bg-background/80 px-3 py-2"
      >
        <summary className="cursor-pointer text-xs font-semibold text-foreground">{label}</summary>
        <p className="mt-2 max-h-[220px] overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
          {text.length > 8000 ? `${text.slice(0, 8000)}…` : text}
        </p>
      </details>
    ) : null;
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        Source: <span className="font-medium text-foreground">{data.provider}</span> ·{" "}
        {data.source_urls.length} reference URLs
      </p>
      {block("Company snapshot", data.company_snapshot)}
      {block("Funding & news", data.funding_news)}
      {block("Hiring signals", data.hiring_signals)}
      {block("Tech & product", data.tech_stack)}
      {block("Intent signals", data.intent_signals)}
    </div>
  );
}

type CampaignWorkspaceProps = {
  rerunRequest?: CampaignRerunPayload | null;
  onRerunConsumed?: () => void;
  hubspotConnected?: boolean;
  /** Prompt 78 — saved custom voices (same tab lists presets + these). */
  customVoices?: CustomVoiceRow[];
  /** Prompt 79 — server white-label for exports. */
  whiteLabel?: WhiteLabelClientSettingsDTO | null;
};

export function CampaignWorkspace({
  rerunRequest = null,
  onRerunConsumed,
  hubspotConnected = false,
  customVoices = [],
  whiteLabel = null,
}: CampaignWorkspaceProps) {
  const { setReplyIntel } = useReplyIntel();
  const router = useRouter();
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [snapshot, setSnapshot] = useState<CampaignClientSnapshot | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [voicePreviewOpen, setVoicePreviewOpen] = useState(false);
  const [copyTip, setCopyTip] = useState<"email" | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [exportTip, setExportTip] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [sendEmailPending, setSendEmailPending] = useState(false);
  const [hubspotExportBusy, setHubspotExportBusy] = useState(false);
  const [enrichmentPreview, setEnrichmentPreview] = useState<LeadEnrichmentPayload | null>(null);
  const [enrichmentBusy, setEnrichmentBusy] = useState(false);
  const [enrichmentError, setEnrichmentError] = useState<string | null>(null);

  useEffect(() => {
    if (!snapshot) {
      setReplyIntel(null);
      return;
    }
    setReplyIntel({
      threadId: snapshot.thread_id,
      company: snapshot.lead.company,
      leadName: snapshot.lead.name,
      prospectEmail: snapshot.lead.email,
    });
  }, [snapshot, setReplyIntel]);

  const form = useForm<LeadFormInput>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: {
      name: "Jordan Lee",
      email: "jordan@acme.example",
      company: "Acme Corp",
      linkedin_url: "",
      phone: "",
      notes: "Evaluating sales automation.",
      status: "new",
      sdr_voice_tone: "default",
      custom_voice_id: undefined,
      custom_voice_name: undefined,
    },
  });

  const onPreviewEnrichment = useCallback(async () => {
    setEnrichmentError(null);
    const valid = await form.trigger();
    if (!valid) return;
    const values = form.getValues();
    setEnrichmentBusy(true);
    try {
      const res = await previewLeadEnrichmentAction(values);
      if (!res.ok) {
        setEnrichmentError(res.error);
        setEnrichmentPreview(null);
        return;
      }
      setEnrichmentPreview(res.enrichment);
    } finally {
      setEnrichmentBusy(false);
    }
  }, [form]);

  const runCampaignFromValues = useCallback(
    (values: LeadFormInput) => {
      setFeedback(null);
      setSnapshot(null);
      setEnrichmentPreview(null);
      startTransition(async () => {
        const res = await startCampaignAction({
          ...values,
          status: values.status ?? "new",
          sdr_voice_tone: values.sdr_voice_tone ?? "default",
          custom_voice_id: values.custom_voice_id,
          custom_voice_name: values.custom_voice_name,
        });
        if (!res.ok) {
          const msg = humanizeClientError(res.error);
          setFeedback({ type: "error", text: msg });
          toast({
            variant: "destructive",
            title: "Campaign did not complete",
            description: msg,
          });
          return;
        }
        setSnapshot(res.snapshot);
        const when = formatCompletedAt(res.snapshot.campaign_completed_at);
        setFeedback({
          type: "success",
          text: `Campaign finished. Thread: ${res.thread_id}. Status: ${res.snapshot.final_status}.${when ? ` Completed: ${when}.` : ""}`,
        });
        toast({
          title: "Campaign complete",
          description: `Thread ${res.thread_id} — ${res.snapshot.final_status.replace(/_/g, " ")}${when ? `. ${when}` : ""}`,
        });
        router.refresh();
      });
    },
    [router],
  );

  const onSendOutreachEmail = useCallback(async () => {
    if (!snapshot?.thread_id) return;
    setSendEmailPending(true);
    try {
      const res = await sendOutreachEmailAction({ thread_id: snapshot.thread_id });
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Could not send email",
          description: res.error,
        });
        return;
      }
      setSnapshot(res.snapshot);
      if (res.deliverability) {
        const d = res.deliverability;
        toast({
          title: "Email sent",
          description: `Inbox health ${d.inboxHealthScore}/100 (${d.status}).`,
        });
      } else {
        toast({ title: "Email sent successfully." });
      }
      router.refresh();
    } finally {
      setSendEmailPending(false);
    }
  }, [snapshot, router]);

  const onExportToHubSpot = useCallback(async () => {
    if (!snapshot?.thread_id) return;
    setHubspotExportBusy(true);
    setExportTip(null);
    try {
      const res = await exportCampaignToHubSpotAction({ thread_id: snapshot.thread_id });
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "HubSpot export failed",
          description: res.error,
        });
        return;
      }
      setExportTip(`HubSpot — deal created (${res.dealId}).`);
      toast({
        title: "Exported to HubSpot",
        description: `Deal ${res.dealId}`,
      });
      window.setTimeout(() => setExportTip(null), 6000);
    } finally {
      setHubspotExportBusy(false);
    }
  }, [snapshot]);

  useEffect(() => {
    if (!rerunRequest) return;
    const { values, autoStart } = rerunRequest;
    form.reset({
      name: values.name,
      email: values.email,
      company: values.company,
      linkedin_url: values.linkedin_url ?? "",
      phone: values.phone ?? "",
      notes: values.notes ?? "",
      status: values.status ?? "new",
      sdr_voice_tone: values.sdr_voice_tone ?? "default",
      custom_voice_id: values.custom_voice_id,
      custom_voice_name: values.custom_voice_name,
    });
    setFeedback({
      type: "success",
      text: "Lead restored from history — starting a new campaign (new thread)…",
    });
    requestAnimationFrame(() => {
      document
        .getElementById("campaign-workspace")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    if (autoStart) {
      const t = window.setTimeout(() => {
        runCampaignFromValues({
          ...values,
          linkedin_url: values.linkedin_url ?? "",
          status: values.status ?? "new",
          sdr_voice_tone: values.sdr_voice_tone ?? "default",
          custom_voice_id: values.custom_voice_id,
          custom_voice_name: values.custom_voice_name,
        });
        onRerunConsumed?.();
      }, 240);
      return () => window.clearTimeout(t);
    }
    onRerunConsumed?.();
    return undefined;
  }, [rerunRequest, form, runCampaignFromValues, onRerunConsumed]);

  function onSubmit(values: LeadFormInput) {
    runCampaignFromValues(values);
  }

  const selectedTone = form.watch("sdr_voice_tone") ?? "default";
  const customVoiceIdWatch = form.watch("custom_voice_id");
  const customVoiceNameWatch = form.watch("custom_voice_name");
  const activeCustomRow = customVoices.find((v) => v.id === customVoiceIdWatch);
  const activeVoiceLabel =
    customVoiceIdWatch && (activeCustomRow?.name || customVoiceNameWatch)
      ? activeCustomRow?.name ?? customVoiceNameWatch ?? "Custom voice"
      : sdrVoiceLabel(selectedTone);
  const activeVoiceShort =
    customVoiceIdWatch && activeCustomRow
      ? activeCustomRow.description.length > 280
        ? `${activeCustomRow.description.slice(0, 280)}…`
        : activeCustomRow.description
      : SDR_VOICE_OPTIONS.find((o) => o.value === selectedTone)?.short ??
        "Balanced default pipeline output.";
  const voicePreview = customVoiceIdWatch ? null : getVoiceSampleEmailPreview(selectedTone);

  const research = snapshot?.research_output;
  const outreach = snapshot?.outreach_output;
  const nurture = snapshot?.nurture_output;
  const score = snapshot?.qualification_score;
  const rNode = isRecord(snapshot?.results?.research_node)
    ? snapshot!.results.research_node
    : null;
  const oNode = isRecord(snapshot?.results?.outreach_node)
    ? snapshot!.results.outreach_node
    : null;
  const qNode = isRecord(snapshot?.results?.qualification_node)
    ? snapshot!.results.qualification_node
    : null;
  const nNode = isRecord(snapshot?.results?.nurture_node)
    ? snapshot!.results.nurture_node
    : null;

  const qualDetail = snapshot?.qualification_detail;
  /** Runtime may include older saved campaign shapes — narrow with guards below. */
  const qualRaw: unknown = qualDetail ?? null;
  const qualNorm =
    (qualRaw != null ? getQualificationDisplay(qualRaw) : null) ??
    (qNode != null ? getQualificationDisplay(qNode) : null);

  const researchOk = Boolean(research && !(rNode && typeof rNode.error === "string"));
  const outreachOk = Boolean(
    outreach && !(oNode && typeof oNode.error === "string"),
  );
  const qualOk = Boolean(
    (qualDetail != null || (score !== null && score !== undefined)) &&
      !(qNode && typeof qNode.error === "string"),
  );
  const nurtureOk = Boolean(nurture && !(nNode && typeof nNode.error === "string"));

  const rateLimitFallbackStages = snapshot
    ? collectRateLimitFallbackStages(snapshot)
    : [];

  const logJson = snapshot ? JSON.stringify(snapshot, null, 2) : "";

  async function copyEmailForOutreach() {
    if (!outreach) return;
    setCopyError(null);
    const html = outreachEmailHtml(outreach as Record<string, unknown>);
    const body = emailPlainTextFromHtml(html);
    const payload = `Subject: ${outreach.subject}\n\n${body}`;
    const ok = await copyTextToClipboard(payload);
    if (ok) {
      setCopyTip("email");
      window.setTimeout(() => setCopyTip(null), 2500);
    } else {
      setCopyError("Could not copy email — select the preview text or try again.");
      window.setTimeout(() => setCopyError(null), 4000);
    }
  }

  async function copyLinkedInMessage() {
    if (!outreach) return;
    setCopyError(null);
    const ok = await copyTextToClipboard(outreach.linkedin_message);
    if (ok) {
      toast({
        title: "Copied to clipboard – ready to paste on LinkedIn",
      });
    } else {
      setCopyError("Could not copy LinkedIn message — try again.");
      window.setTimeout(() => setCopyError(null), 4000);
    }
  }

  const openLinkedInCompose = useCallback(() => {
    if (!outreach?.linkedin_message?.trim()) return;
    const msg = outreach.linkedin_message.trim();
    if (!msg) return;
    const urlWithBody = `https://www.linkedin.com/messaging/compose/?body=${encodeURIComponent(msg)}`;
    const url =
      urlWithBody.length > 2000
        ? "https://www.linkedin.com/messaging/"
        : urlWithBody;
    if (urlWithBody.length > 2000) {
      toast({
        title: "LinkedIn opened",
        description: "Message is long — copy it first, then paste in LinkedIn.",
      });
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }, [outreach]);

  function exportCampaignMarkdown() {
    if (!snapshot) return;
    setExportTip(null);
    try {
      const b = loadPdfBranding();
      const md = campaignSnapshotToMarkdown(snapshot, {
        orgName: whiteLabel?.appName?.trim() || b.orgName.trim() || undefined,
        logoPublicUrl: whiteLabel?.logoUrl?.trim() || b.logoPublicUrl.trim() || undefined,
        productName: whiteLabel?.appName?.trim() || snapshot.brand_display_name?.trim(),
      });
      const base = safeCampaignDownloadBasename(snapshot.lead.company, snapshot.thread_id);
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${base}.md`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportTip("Markdown handoff saved.");
      window.setTimeout(() => setExportTip(null), 4500);
    } catch {
      setExportTip("Export failed — try JSON or View full log.");
      window.setTimeout(() => setExportTip(null), 6500);
    }
  }

  function exportCampaignSummaryJson() {
    if (!snapshot) return;
    setExportTip(null);
    try {
      const summary = buildCampaignSummaryExport(snapshot);
      const brand = loadPdfBranding();
      const withBranding = {
        export_branding: {
          org_name: whiteLabel?.appName?.trim() || brand.orgName.trim() || null,
          logo_public_url: whiteLabel?.logoUrl?.trim() || brand.logoPublicUrl.trim() || null,
          primary_hex: whiteLabel?.primaryColor ?? brand.primaryHex,
          secondary_hex: whiteLabel?.secondaryColor ?? brand.secondaryHex,
          support_email: whiteLabel?.supportEmail?.trim() || null,
          pdf_dark: brand.pdfDark,
        },
        ...summary,
      };
      const base = safeCampaignDownloadBasename(snapshot.lead.company, snapshot.thread_id);
      const blob = new Blob([JSON.stringify(withBranding, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${base}-summary.json`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportTip("JSON summary saved — CRM-ready shape.");
      window.setTimeout(() => setExportTip(null), 4500);
    } catch {
      setExportTip("JSON export failed.");
      window.setTimeout(() => setExportTip(null), 5000);
    }
  }

  async function exportCampaignPdf() {
    if (!snapshot) return;
    setExportTip(null);
    try {
      const { downloadCampaignPdfSummary } = await import("@/lib/campaign-pdf");
      const opts = await buildCampaignPdfExportOptions(whiteLabel ?? undefined);
      await downloadCampaignPdfSummary(snapshot, opts);
      setExportTip("Premium PDF saved — executive one-pager + full dossier.");
      toast({
        title: "PDF exported",
        description: "Branded report downloaded (check your downloads folder).",
      });
      window.setTimeout(() => setExportTip(null), 4500);
    } catch {
      setExportTip("PDF failed — use Markdown or JSON.");
      toast({
        variant: "destructive",
        title: "PDF export failed",
        description: "Try Markdown or JSON, or check the browser console.",
      });
      window.setTimeout(() => setExportTip(null), 5500);
    }
  }

  return (
    <div
      id="campaign-workspace"
      className="relative scroll-mt-24 space-y-10 transition-all duration-500 ease-out"
    >
      <PdfBrandingPanel />

      <DashboardReplyStrip />

      {isPending ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-background/75 backdrop-blur-[2px]"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-8 py-6 shadow-lg">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-semibold">Running campaign</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Lead intel → research → outreach → qualification → nurture. Usually under a minute.
              </p>
              <p className="mt-2 inline-flex items-center gap-2 rounded-lg border border-violet-500/35 bg-violet-500/[0.1] px-3 py-1.5 text-sm font-semibold text-violet-950 dark:border-violet-400/35 dark:bg-violet-500/15 dark:text-violet-50">
                <Mic className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                Voice: {activeVoiceLabel}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <Card
        className={cn(
          "rounded-2xl border-border/80 bg-card/95 shadow-xl ring-1 ring-border/20 transition-all duration-500 dark:bg-card/95 dark:ring-white/[0.07]",
          "hover:shadow-2xl hover:ring-border/35",
          isPending && "pointer-events-none opacity-55",
        )}
      >
        <CardHeader className="space-y-3 border-b border-border/40 bg-gradient-to-r from-muted/35 via-transparent to-transparent pb-5 dark:from-muted/15">
          <div>
            <CardTitle className="text-xl tracking-tight">New campaign</CardTitle>
            <CardDescription className="mt-1.5 text-sm leading-relaxed">
              One submit runs the full graph. Thread id:{" "}
              <code className="rounded bg-muted/80 px-1.5 py-0.5 text-xs">
                {"`${userId}_${Date.now()}`"}
              </code>
            </CardDescription>
          </div>
          <div
            className="rounded-xl border-2 border-violet-500/35 bg-gradient-to-br from-violet-500/[0.12] via-violet-500/[0.06] to-transparent px-4 py-4 shadow-md ring-2 ring-violet-500/10 dark:border-violet-400/35 dark:from-violet-500/[0.14] dark:via-violet-500/[0.08] dark:ring-violet-400/15"
            role="region"
            aria-label="Selected SDR voice for this campaign"
          >
            <div className="flex gap-3">
              <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-violet-500/30 bg-background/90 shadow-sm dark:border-violet-400/25">
                <Mic className="h-5 w-5 text-violet-600 dark:text-violet-300" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-800/90 dark:text-violet-200/90">
                  Active campaign voice — all agents
                </p>
                <p className="mt-1.5 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                  {activeVoiceLabel}
                </p>
                <p className="mt-1 text-base font-medium leading-relaxed text-muted-foreground">
                  {activeVoiceShort}
                </p>
                <p className="mt-2.5 text-xs leading-relaxed text-foreground/90">
                  Injected ahead of <strong>research, outreach, qualification,</strong> and{" "}
                  <strong>nurture</strong> system prompts. <span className="font-medium">Presets</span> are
                  tuned contrasts (warm vs challenger vs data); <span className="font-medium">custom voices</span>{" "}
                  use your saved tone instructions and examples everywhere instead.
                </p>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-2">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input disabled={isPending} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="company"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company</FormLabel>
                      <FormControl>
                        <Input disabled={isPending} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        disabled={isPending}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="linkedin_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>LinkedIn URL (optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="url"
                        placeholder="https://linkedin.com/in/…"
                        disabled={isPending}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-3 rounded-xl border border-border/65 bg-muted/15 px-4 py-4 dark:bg-muted/10">
                <div className="flex items-center gap-2">
                  <FormLabel className="m-0 text-base">Campaign voice</FormLabel>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="About SDR voices"
                      >
                        <HelpCircle className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs text-left leading-relaxed">
                      Pick a built-in preset or a voice you created under the Custom voices tab. Custom
                      voices replace preset system layers with your tone instructions and examples across
                      the full pipeline.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Five presets (same as before) or your saved custom voices — both inject into research,
                  outreach, qualification, and nurture.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={!customVoiceIdWatch ? "default" : "outline"}
                    disabled={isPending}
                    onClick={() => {
                      form.setValue("custom_voice_id", undefined);
                      form.setValue("custom_voice_name", undefined);
                    }}
                  >
                    Preset voices
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={customVoiceIdWatch ? "default" : "outline"}
                    disabled={isPending || customVoices.length === 0}
                    title={
                      customVoices.length === 0
                        ? "Create a custom voice under the Custom voices tab first"
                        : undefined
                    }
                    onClick={() => {
                      const first = customVoices[0];
                      if (!first) return;
                      form.setValue("custom_voice_id", first.id);
                      form.setValue("custom_voice_name", first.name);
                      form.setValue("sdr_voice_tone", "default");
                    }}
                  >
                    Custom voices
                  </Button>
                </div>
                {!customVoiceIdWatch ? (
                  <FormField
                    control={form.control}
                    name="sdr_voice_tone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Preset</FormLabel>
                        <FormControl>
                          <select
                            disabled={isPending}
                            className={cn(
                              "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              "disabled:cursor-not-allowed disabled:opacity-50",
                            )}
                            {...field}
                          >
                            {SDR_VOICE_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </FormControl>
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                          {SDR_VOICE_OPTIONS.find((o) => o.value === field.value)?.short}
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <FormField
                    control={form.control}
                    name="custom_voice_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Your custom voice</FormLabel>
                        <FormControl>
                          <select
                            disabled={isPending}
                            className={cn(
                              "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              "disabled:cursor-not-allowed disabled:opacity-50",
                            )}
                            value={field.value ?? ""}
                            onChange={(e) => {
                              const id = e.target.value;
                              field.onChange(id || undefined);
                              const row = customVoices.find((v) => v.id === id);
                              form.setValue("custom_voice_name", row?.name);
                              form.setValue("sdr_voice_tone", "default");
                            }}
                          >
                            {customVoices.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name}
                              </option>
                            ))}
                          </select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-8 gap-1.5 text-xs transition-all duration-200",
                      dashboardOutlineActionClass,
                    )}
                    disabled={isPending || Boolean(customVoiceIdWatch)}
                    onClick={() => setVoicePreviewOpen(true)}
                  >
                    <Eye className="h-3.5 w-3.5 opacity-90" aria-hidden />
                    Preview preset sample
                  </Button>
                </div>
                {customVoiceIdWatch ? (
                  <p className="text-[11px] text-muted-foreground">
                    Preset samples are hidden while a custom voice is selected — run the campaign to hear
                    your tone in the outputs.
                  </p>
                ) : null}
              </div>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        disabled={isPending}
                        placeholder="Context for the agents — ICP hints, timing, competitors…"
                        className="min-h-[88px] resize-y"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div
                className="flex flex-col gap-2 rounded-xl border-2 border-primary/30 bg-primary/[0.08] px-4 py-4 shadow-sm dark:border-primary/35 dark:bg-primary/[0.11] sm:flex-row sm:items-center sm:justify-between"
                role="status"
                aria-live="polite"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 rounded-lg border border-primary/25 bg-background/90 p-2.5 shadow-sm">
                    <Mic className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/90">
                      Active SDR voice (this submit)
                    </p>
                    <p className="mt-1 text-lg font-bold tracking-tight text-foreground">
                      {activeVoiceLabel}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {activeVoiceShort}
                    </p>
                  </div>
                </div>
                <p className="text-xs font-medium text-muted-foreground sm:max-w-[240px] sm:text-right">
                  Same voice across research → outreach → qual → nurture; competitors rarely keep this
                  consistent.
                </p>
              </div>
              <div
                className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] px-4 py-4 dark:border-emerald-400/25 dark:bg-emerald-500/[0.09]"
                role="region"
                aria-label="Lead enrichment preview"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Radar className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                    <p className="text-sm font-semibold">Lead intel preview</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={isPending || enrichmentBusy}
                    onClick={() => void onPreviewEnrichment()}
                  >
                    {enrichmentBusy ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Radar className="mr-2 h-4 w-4 opacity-90" aria-hidden />
                    )}
                    Fetch lead intel
                  </Button>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Preview company context, funding, hiring, tech, and intent signals (Tavily / Browserless)
                  before you start. The same enrichment runs automatically when you click Start campaign.
                </p>
                {enrichmentError ? (
                  <p className="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {enrichmentError}
                  </p>
                ) : null}
                {enrichmentPreview ? (
                  <EnrichmentPreviewBody data={enrichmentPreview} />
                ) : null}
              </div>
              <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Running agents…
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Start campaign
                  </>
                )}
              </Button>
            </form>
          </Form>

          {feedback ? (
            <div
              role="status"
              className={
                feedback.type === "success"
                  ? "rounded-md border border-green-600/30 bg-green-500/10 px-3 py-2 text-sm text-green-800 dark:text-green-200"
                  : "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              }
            >
              {feedback.text}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={voicePreviewOpen} onOpenChange={setVoicePreviewOpen}>
        <DialogContent className="max-h-[min(90vh,720px)] max-w-lg overflow-y-auto border-border/80 shadow-2xl sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2 text-lg">
              <Mic className="h-5 w-5 text-violet-600 dark:text-violet-300" aria-hidden />
              Voice preview — {activeVoiceLabel}
            </DialogTitle>
            <DialogDescription className="text-left text-sm leading-relaxed">
              {voicePreview
                ? SDR_VOICE_OPTIONS.find((o) => o.value === selectedTone)?.short
                : "Custom voice — no preset sample."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            {voicePreview ? (
              <>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Sample subject
                  </p>
                  <p className="mt-1 rounded-lg border border-border/70 bg-muted/25 px-3 py-2 font-medium leading-snug text-foreground">
                    {voicePreview.subject}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Sample body
                  </p>
                  <pre className="mt-1 max-h-[280px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border/70 bg-card px-3 py-3 font-sans text-[13px] leading-relaxed text-foreground shadow-inner">
                    {voicePreview.body}
                  </pre>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{voicePreview.disclaimer}</p>
              </>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">
                Switch to <strong className="font-medium text-foreground">Preset voices</strong> to preview
                built-in samples. Custom voices run only inside a live campaign.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setVoicePreviewOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {snapshot ? (
        <div className="space-y-6">
          {snapshot.lead_enrichment_preview ? (
            <Card className="rounded-2xl border-emerald-500/35 bg-emerald-500/[0.05] dark:border-emerald-400/30">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Radar className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  Saved lead intel (this run)
                </CardTitle>
                <CardDescription>
                  Enrichment from Tavily / Browserless — also stored on the campaign record when
                  configured.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EnrichmentPreviewBody data={snapshot.lead_enrichment_preview} />
              </CardContent>
            </Card>
          ) : null}
          <OverallCampaignStrength snapshot={snapshot} />
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Prospect reply analyzer</span> (above) auto-links to
            this thread while results are visible — paste their reply for suggested next moves.
          </p>
          {rateLimitFallbackStages.length > 0 ? (
            <p
              className="rounded-md border border-border/60 bg-muted/25 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
              role="status"
            >
              <span className="font-medium text-foreground/85">
                Lighter model after rate limit:{" "}
              </span>
              {rateLimitFallbackStages.join(", ")}. Primary tier was busy; output is still usable —
              re-run when load is lower for the full-quality model.
            </p>
          ) : null}
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/60 pb-5">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight">Campaign results</h2>
                <Badge
                  variant={
                    snapshot.final_status === "failed"
                      ? "destructive"
                      : snapshot.final_status === "completed_with_errors"
                        ? "outline"
                        : "secondary"
                  }
                  className="capitalize"
                >
                  {snapshot.final_status.replace(/_/g, " ")}
                </Badge>
                <Badge
                  variant="outline"
                  className="border-violet-500/45 bg-violet-500/[0.1] px-2.5 py-1 text-xs font-semibold tracking-tight text-violet-950 dark:border-violet-400/45 dark:bg-violet-500/15 dark:text-violet-50"
                >
                  Voice: {voiceLabelForLead(snapshot.lead)}
                </Badge>
              </div>
              {snapshot.campaign_completed_at ? (
                <p className="text-xs text-muted-foreground">
                  Completed{" "}
                  <time dateTime={snapshot.campaign_completed_at} className="font-medium text-foreground">
                    {formatCompletedAt(snapshot.campaign_completed_at)}
                  </time>
                </p>
              ) : null}
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              <div className="flex flex-wrap gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn("gap-1.5", dashboardOutlineActionClass)}
                  >
                    <Download className="h-4 w-4" />
                    Export
                    <ChevronDown className="h-3.5 w-3.5 opacity-80" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    Handoff formats
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="cursor-pointer gap-2 py-2.5"
                    onClick={() => exportCampaignMarkdown()}
                  >
                    <FileText className="h-4 w-4 opacity-70" />
                    Markdown report
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer gap-2 py-2.5"
                    onClick={() => exportCampaignSummaryJson()}
                  >
                    <FileJson className="h-4 w-4 opacity-70" />
                    JSON summary
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer gap-2 py-2.5"
                    onClick={() => void exportCampaignPdf()}
                  >
                    <FileText className="h-4 w-4 opacity-70" />
                    PDF (executive + dossier)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {snapshot.final_status !== "failed" && snapshot.final_status !== "running" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    "gap-2 border-orange-500/35 bg-orange-500/[0.06] dark:bg-orange-500/10",
                    dashboardOutlineActionClass,
                  )}
                  disabled={!hubspotConnected || hubspotExportBusy}
                  title={
                    hubspotConnected
                      ? "Create/update HubSpot contact & deal, notes, and PDF attachment"
                      : "Connect HubSpot above (Private App token)"
                  }
                  onClick={() => void onExportToHubSpot()}
                >
                  {hubspotExportBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <CloudUpload className="h-4 w-4" aria-hidden />
                  )}
                  Export to HubSpot
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn("gap-2", dashboardOutlineActionClass)}
                onClick={() => setLogOpen(true)}
              >
                <ScrollText className="h-4 w-4" />
                View full log
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => {
                  console.log(
                    "[AgentForge] full campaign snapshot\n",
                    JSON.stringify(snapshot, null, 2),
                  );
                }}
              >
                Log to console
              </Button>
              </div>
              {exportTip ? (
                <p className="text-xs text-muted-foreground sm:text-right" role="status">
                  {exportTip}
                </p>
              ) : null}
            </div>
          </div>

          <Dialog open={logOpen} onOpenChange={setLogOpen}>
            <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle>Full campaign state</DialogTitle>
                <DialogDescription>
                  JSON snapshot returned from the server (same shape as stored in{" "}
                  <code className="text-xs">campaigns.results</code>).
                </DialogDescription>
              </DialogHeader>
              <pre className="max-h-[55vh] overflow-auto rounded-md border bg-muted/40 p-3 text-xs leading-relaxed">
                {logJson}
              </pre>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  className={cn("gap-2", dashboardOutlineActionClass)}
                  onClick={async () => {
                    await navigator.clipboard.writeText(logJson);
                  }}
                >
                  <ClipboardCopy className="h-4 w-4" />
                  Copy JSON
                </Button>
                <Button type="button" onClick={() => setLogOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {snapshot.final_status === "completed_with_errors" ? (
            <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Finished with step errors</p>
                <p>
                  All stages ran; some nodes logged errors. Review the cards or open{" "}
                  <span className="font-medium">View full log</span>.
                </p>
              </div>
            </div>
          ) : null}

          {snapshot.pipeline_error ? (
            <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Pipeline error</p>
                <p>{humanizeClientError(snapshot.pipeline_error)}</p>
              </div>
            </div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
            <Card className={cn(resultCardClass, "overflow-hidden")}>
              <CardHeader
                className={cn(
                  resultsCardHeaderClass,
                  "flex flex-row flex-wrap items-start justify-between gap-3",
                )}
              >
                <div className="min-w-0">
                  <CardTitle className="text-lg font-semibold tracking-tight">Research</CardTitle>
                  <CardDescription className="mt-1.5">
                    ICP score, industry, BANT, stakeholders, pains & angles
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  {research && researchIcpScore(research as Record<string, unknown>) != null ? (
                    <div className="flex items-end gap-1.5 rounded-xl border border-border/70 bg-background/90 px-3 py-2 shadow-sm">
                      <span className="text-3xl font-bold tabular-nums leading-none tracking-tight text-foreground sm:text-4xl">
                        {researchIcpScore(research as Record<string, unknown>)}
                      </span>
                      <span className="pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        ICP /100
                      </span>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <StepBadge ok={researchOk} label="Success" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className={resultsCardContentClass}>
                {research ? (
                  <>
                    <div>
                      <SectionLabel icon={Sparkles}>Executive summary</SectionLabel>
                      <p className="mt-2 font-medium leading-relaxed text-foreground">
                        {research.executive_summary}
                      </p>
                    </div>
                    {typeof (research as { industry_inference?: string }).industry_inference ===
                    "string" &&
                    (research as { industry_inference: string }).industry_inference.trim() ? (
                      <div className="rounded-lg border border-border/70 bg-muted/10 p-3">
                        <SectionLabel icon={Building2}>Industry</SectionLabel>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                          {(research as { industry_inference: string }).industry_inference}
                        </p>
                      </div>
                    ) : null}
                    {typeof (research as { recent_news_or_funding_summary?: string })
                      .recent_news_or_funding_summary === "string" &&
                    (research as { recent_news_or_funding_summary: string })
                      .recent_news_or_funding_summary.trim() ? (
                      <div className="rounded-lg border border-border/60 bg-card/80 p-3">
                        <SectionLabel icon={ScrollText}>News & funding note</SectionLabel>
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                          {
                            (research as { recent_news_or_funding_summary: string })
                              .recent_news_or_funding_summary
                          }
                        </p>
                      </div>
                    ) : null}
                    {snapshot.live_signals && snapshot.live_signals.length > 0 ? (
                      <div className="rounded-lg border border-primary/25 bg-primary/[0.04] p-3 dark:border-primary/20 dark:bg-primary/[0.06]">
                        <SectionLabel icon={Radar}>Live signals</SectionLabel>
                        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                          Post-research signal pass (funding, hiring, motion). Directional — validate on
                          calls.
                        </p>
                        <ul className="mt-2 space-y-2 text-xs leading-relaxed text-muted-foreground">
                          {snapshot.live_signals.map((s, i) => (
                            <li key={`${s.captured_at}-${i}`}>
                              <span className="font-semibold text-foreground/90">
                                {s.signal_type.replace(/_/g, " ")}.
                              </span>{" "}
                              {s.signal_text}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {"reasoning_steps" in research &&
                    Array.isArray(research.reasoning_steps) &&
                    research.reasoning_steps.length > 0 ? (
                      <div className="rounded-xl border border-border/80 bg-muted/20 p-4 shadow-inner dark:bg-muted/10">
                        <SectionLabel icon={Brain}>Reasoning trace</SectionLabel>
                        <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-muted-foreground marker:font-semibold marker:text-foreground/70">
                          {research.reasoning_steps.map((step, i) => (
                            <li key={`${i}-${step.slice(0, 24)}`} className="pl-1">
                              {step}
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                    {"bant_assessment" in research && research.bant_assessment ? (
                      <div className="space-y-2">
                        <SectionLabel icon={Target}>BANT hypothesis</SectionLabel>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {BANT_KEYS.map((key) => {
                            const b = research.bant_assessment[key];
                            return (
                              <div
                                key={key}
                                className="rounded-lg border border-border/70 bg-card/80 p-3 text-xs"
                              >
                                <div className="flex flex-wrap items-center gap-2 font-semibold capitalize text-foreground">
                                  <span>{key}</span>
                                  <Badge variant="outline" className="text-[10px]">
                                    {b.confidence}
                                  </Badge>
                                </div>
                                <p className="mt-1 text-muted-foreground">
                                  {displayResearchBantEvidence(
                                    b.evidence,
                                    research as Record<string, unknown>,
                                  )}
                                </p>
                                <p className="mt-1 italic text-muted-foreground/90">{b.notes}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                    {"tech_stack_hints" in research &&
                    Array.isArray(research.tech_stack_hints) &&
                    research.tech_stack_hints.length > 0 ? (
                      <div>
                        <SectionLabel icon={Cpu}>Tech stack hints</SectionLabel>
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {research.tech_stack_hints.map((t) => (
                            <li key={t}>
                              <Badge variant="secondary" className="font-normal">
                                {t}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <div className="space-y-3 border-t border-border/60 pt-4">
                      <div>
                        <SectionLabel icon={TrendingUp}>ICP fit narrative</SectionLabel>
                        <p className="mt-2 leading-relaxed text-muted-foreground">
                          {research.icp_fit_summary}
                        </p>
                      </div>
                      <div>
                        <SectionLabel icon={Users}>Key stakeholders</SectionLabel>
                        <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
                          {researchStakeholderList(research as Record<string, unknown>).map(
                            (s) => (
                              <li key={s}>{s}</li>
                            ),
                          )}
                        </ul>
                      </div>
                      <div>
                        <SectionLabel icon={AlertCircle}>Pain points</SectionLabel>
                        <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
                          {Array.isArray(
                            (research as { pain_points?: string[] }).pain_points,
                          )
                            ? (research as { pain_points: string[] }).pain_points.map((p) => (
                                <li key={p}>{p}</li>
                              ))
                            : null}
                        </ul>
                      </div>
                      <div>
                        <SectionLabel icon={Lightbulb}>Messaging angles</SectionLabel>
                        <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
                          {Array.isArray(
                            (research as { messaging_angles?: string[] }).messaging_angles,
                          )
                            ? (research as { messaging_angles: string[] }).messaging_angles.map(
                                (a) => (
                                  <li key={a}>{a}</li>
                                ),
                              )
                            : null}
                        </ul>
                      </div>
                    </div>
                  </>
                ) : rNode && "error" in rNode && typeof rNode.error === "string" ? (
                  <p className="text-destructive">{rNode.error}</p>
                ) : (
                  <p className="text-muted-foreground">No research output.</p>
                )}
              </CardContent>
            </Card>

            <Card className={cn(resultCardClass, "overflow-hidden")}>
              <CardHeader
                className={cn(
                  resultsCardHeaderClass,
                  "flex flex-row flex-wrap items-start justify-between gap-3",
                )}
              >
                <div className="min-w-0">
                  <CardTitle className="text-lg font-semibold tracking-tight">Outreach</CardTitle>
                  <CardDescription className="mt-1.5">
                    Subject, email body (HTML), LinkedIn & strategy
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StepBadge ok={outreachOk} label="Success" />
                  {outreach?.linkedin_message?.trim() ? (
                    <Badge
                      variant="outline"
                      className="border-emerald-500/40 bg-emerald-500/10 text-[11px] font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-100"
                    >
                      LinkedIn Ready
                    </Badge>
                  ) : null}
                  {outreach ? (
                    isOutreachReadyToSend(outreach) ? (
                      <>
                        <Badge
                          variant="outline"
                          className="border-sky-500/35 text-sky-950 dark:text-sky-100"
                        >
                          Ready to send
                        </Badge>
                        <Button
                          type="button"
                          size="sm"
                          className={cn("gap-1.5", dashboardOutlineActionClass)}
                          disabled={sendEmailPending}
                          onClick={() => void onSendOutreachEmail()}
                        >
                          {sendEmailPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Mail className="h-3.5 w-3.5" aria-hidden />
                          )}
                          Send Email
                        </Button>
                      </>
                    ) : outreach.email_sent ? (
                      <Badge className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Sent
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Not sent</Badge>
                    )
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className={cn(resultsCardContentClass, "space-y-4")}>
                {outreach ? (
                  <>
                    {outreach.email_sent ? (
                      <p className="rounded-md border border-green-600/30 bg-green-500/10 px-3 py-2 text-sm text-green-800 dark:text-green-200">
                        Email sent successfully.
                      </p>
                    ) : (
                      (() => {
                        const { friendly, detail } = outreachNotice(outreach);
                        if (!friendly) return null;
                        return (
                          <div className="space-y-2 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-950 dark:text-sky-100">
                            <p>{friendly}</p>
                            {detail && detail !== friendly ? (
                              <p className="text-xs opacity-80">{detail}</p>
                            ) : null}
                          </div>
                        );
                      })()
                    )}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Subject
                      </p>
                      <p className="mt-1 font-medium">{outreach.subject}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn("gap-1.5", dashboardOutlineActionClass)}
                        onClick={() => void copyEmailForOutreach()}
                      >
                        <Mail className="h-3.5 w-3.5" />
                        Copy email
                      </Button>
                      {copyTip === "email" ? (
                        <span className="self-center text-xs text-emerald-700 dark:text-emerald-400">
                          Email copied
                        </span>
                      ) : null}
                    </div>
                    <div className="rounded-xl border border-emerald-500/35 bg-gradient-to-br from-emerald-500/[0.08] to-transparent p-4 ring-1 ring-emerald-500/15 dark:from-emerald-500/12">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-100">
                        LinkedIn — safe handoff (copy only; no auto-post)
                      </p>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Copy the DM below, or open LinkedIn compose — we never post on your behalf.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="default"
                          className="gap-2 px-5 sm:min-w-[220px]"
                          onClick={() => void copyLinkedInMessage()}
                        >
                          <MessageSquare className="h-4 w-4" aria-hidden />
                          Copy LinkedIn Message
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="default"
                          className={cn("gap-2", dashboardOutlineActionClass)}
                          onClick={() => openLinkedInCompose()}
                        >
                          <ExternalLink className="h-4 w-4" aria-hidden />
                          Open LinkedIn compose
                        </Button>
                      </div>
                    </div>
                    {copyError ? (
                      <p className="text-xs text-destructive" role="status">
                        {copyError}
                      </p>
                    ) : null}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Email body (preview)
                      </p>
                      <div className="mt-1 max-h-[18rem] overflow-y-auto rounded-2xl border border-border/65 bg-card px-5 py-4 shadow-inner ring-1 ring-black/[0.03] dark:ring-white/[0.06]">
                        <div
                          className="whitespace-pre-wrap break-words text-[15px] leading-[1.75] tracking-tight text-foreground antialiased"
                          style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
                        >
                          {emailPlainTextFromHtml(
                            outreachEmailHtml(outreach as Record<string, unknown>),
                          )}
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        LinkedIn
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                        {outreach.linkedin_message}
                      </p>
                    </div>
                    {outreach.personalization_hooks &&
                    outreach.personalization_hooks.length > 0 ? (
                      <div>
                        <SectionLabel icon={Target}>Personalization hooks</SectionLabel>
                        <ul className="mt-2 list-inside list-disc text-muted-foreground">
                          {outreach.personalization_hooks.map((h) => (
                            <li key={h}>{h}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {outreach.primary_angle ? (
                      <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                        <SectionLabel icon={Sparkles}>Primary angle</SectionLabel>
                        <p className="mt-2 text-sm leading-relaxed">{outreach.primary_angle}</p>
                      </div>
                    ) : null}
                    {outreach.cta_strategy ? (
                      <div>
                        <SectionLabel icon={MessageSquare}>CTA strategy</SectionLabel>
                        <p className="mt-2 text-sm text-muted-foreground">{outreach.cta_strategy}</p>
                      </div>
                    ) : null}
                    {outreach.linkedin_rationale ? (
                      <div>
                        <SectionLabel icon={Mail}>LinkedIn rationale</SectionLabel>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {outreach.linkedin_rationale}
                        </p>
                      </div>
                    ) : null}
                    {oNode && typeof oNode.resend_status === "string" ? (
                      <p className="text-xs text-muted-foreground">
                        ESP status: {oNode.resend_status}
                      </p>
                    ) : null}
                  </>
                ) : oNode && "error" in oNode && typeof oNode.error === "string" ? (
                  <p className="text-destructive">{oNode.error}</p>
                ) : (
                  <p className="text-muted-foreground">No outreach output.</p>
                )}
              </CardContent>
            </Card>

            <Card className={cn(resultCardClass, "overflow-hidden")}>
              <CardHeader
                className={cn(
                  resultsCardHeaderClass,
                  "flex flex-row flex-wrap items-start justify-between gap-3",
                )}
              >
                <div className="min-w-0">
                  <CardTitle className="text-lg font-semibold tracking-tight">Qualification</CardTitle>
                  <CardDescription className="mt-1.5">
                    Confident score, BANT narrative, three objection cards, playbook-style next step
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  {typeof score === "number" ? (
                    <div className="flex items-end gap-1.5 rounded-xl border border-border/70 bg-background/90 px-3 py-2 shadow-sm">
                      <span className="text-3xl font-bold tabular-nums leading-none tracking-tight text-foreground sm:text-4xl">
                        {score}
                      </span>
                      <span className="pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Qual /100
                      </span>
                    </div>
                  ) : null}
                  <StepBadge ok={qualOk} label="Success" />
                </div>
              </CardHeader>
              <CardContent className={resultsCardContentClass}>
                {qualNorm ? (
                  <SimplifiedQualificationBody
                    {...qualNorm}
                    degraded={qNode?.degraded === true}
                  />
                ) : qualRaw != null && isLegacyQualificationDetail(qualRaw) ? (
                  <>
                    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/60 pb-4">
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="flex items-baseline gap-2">
                          <span className="text-4xl font-bold tabular-nums tracking-tight">
                            {Number(qualRaw.score)}
                          </span>
                          <span className="text-muted-foreground">/ 100</span>
                        </div>
                        <ScoreTierBadge score={Number(qualRaw.score)} />
                      </div>
                    </div>
                    {typeof qualRaw.summary === "string" ? (
                      <p className="leading-relaxed text-foreground">{qualRaw.summary}</p>
                    ) : null}
                    <div>
                      <SectionLabel icon={AlertCircle}>Top objections</SectionLabel>
                      <ul className="mt-2 list-inside list-decimal space-y-1 text-muted-foreground">
                        {(qualRaw.objections as string[]).map((o) => (
                          <li key={o}>{o}</li>
                        ))}
                      </ul>
                    </div>
                    {typeof qualRaw.next_action === "string" ? (
                      <div className="rounded-md bg-muted/40 p-3">
                        <SectionLabel icon={TrendingUp}>Next best action</SectionLabel>
                        <div className="mt-2 font-medium leading-snug">
                          {qualRaw.next_action}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : score !== null && score !== undefined ? (
                  <>
                    <div className="flex flex-wrap items-end gap-3 border-b pb-3">
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-bold tabular-nums tracking-tight">
                          {score}
                        </span>
                        <span className="text-muted-foreground">/ 100</span>
                      </div>
                      <ScoreTierBadge score={score} />
                    </div>
                    {qNode && typeof qNode.bant_summary === "string" ? (
                      <p className="leading-relaxed text-muted-foreground">{qNode.bant_summary}</p>
                    ) : qNode && typeof qNode.summary === "string" ? (
                      <p className="leading-relaxed">{qNode.summary}</p>
                    ) : null}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Top objections
                      </p>
                      <ul className="mt-1 list-decimal space-y-2 pl-4 text-sm text-muted-foreground">
                        {(() => {
                          const rows = normalizeQualObjections(qNode?.top_objections);
                          if (rows) {
                            return rows.map((o) => (
                              <li key={`${o.objection}-${o.reasoning}`}>
                                <span className="font-medium text-foreground">{o.objection}</span>
                                {o.reasoning ? (
                                  <p className="mt-0.5 text-xs leading-relaxed">{o.reasoning}</p>
                                ) : null}
                              </li>
                            ));
                          }
                          if (Array.isArray(qNode?.objections)) {
                            return (qNode!.objections as string[]).map((o) => (
                              <li key={o}>{o}</li>
                            ));
                          }
                          return null;
                        })()}
                      </ul>
                    </div>
                    {qNode && typeof qNode.next_best_action === "string" ? (
                      <div className="rounded-md bg-muted/40 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Next best action
                        </p>
                        <p className="mt-1 font-medium">{qNode.next_best_action}</p>
                      </div>
                    ) : qNode && typeof qNode.recommended_action === "string" ? (
                      <div className="rounded-md bg-muted/40 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Recommended action
                        </p>
                        <p className="mt-1 font-medium">{qNode.recommended_action}</p>
                      </div>
                    ) : qNode && typeof qNode.next_action === "string" ? (
                      <div className="rounded-md bg-muted/40 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Next best action
                        </p>
                        <p className="mt-1 font-medium">{qNode.next_action}</p>
                      </div>
                    ) : null}
                  </>
                ) : qNode && "error" in qNode && typeof qNode.error === "string" ? (
                  <p className="text-destructive">{qNode.error}</p>
                ) : (
                  <p className="text-muted-foreground">No qualification output.</p>
                )}
              </CardContent>
            </Card>

            <Card className={cn(resultCardClass, "overflow-hidden")}>
              <CardHeader
                className={cn(
                  resultsCardHeaderClass,
                  "flex flex-row flex-wrap items-start justify-between gap-3",
                )}
              >
                <div className="min-w-0">
                  <CardTitle className="text-lg font-semibold tracking-tight">Nurture</CardTitle>
                  <CardDescription className="mt-1.5">
                    Playbook cadence — value-add steps & timing
                  </CardDescription>
                </div>
                <StepBadge ok={nurtureOk} label="Success" />
              </CardHeader>
              <CardContent className={cn(resultsCardContentClass, "space-y-4")}>
                {nurture ? (
                  <>
                    <p className="leading-relaxed">{nurture.sequence_summary}</p>
                    <ol className="space-y-4">
                      {nurture.follow_up_sequences.map((step, i) => (
                        <li
                          key={`${step.day_offset}-${step.channel}-${i}`}
                          className="rounded-lg border border-border/80 bg-muted/15 p-4"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="gap-1">
                              <CalendarClock className="h-3 w-3" />
                              Day +{step.day_offset}
                            </Badge>
                            <Badge variant="secondary">{step.channel}</Badge>
                          </div>
                          <p className="mt-3 text-sm font-medium leading-relaxed text-foreground">
                            {step.summary}
                          </p>
                          {"value_add_idea" in step && step.value_add_idea ? (
                            <div className="mt-3 text-xs">
                              <SectionLabel icon={Lightbulb}>Value add</SectionLabel>
                              <p className="mt-1 text-muted-foreground">{step.value_add_idea}</p>
                            </div>
                          ) : null}
                          {"content_asset_suggestion" in step &&
                          step.content_asset_suggestion ? (
                            <div className="mt-2 text-xs">
                              <SectionLabel icon={FileText}>Content / asset</SectionLabel>
                              <p className="mt-1 text-muted-foreground">
                                {step.content_asset_suggestion}
                              </p>
                            </div>
                          ) : null}
                          {"timing_rationale" in step && step.timing_rationale ? (
                            <div className="mt-2 text-xs">
                              <SectionLabel icon={TrendingUp}>Timing</SectionLabel>
                              <p className="mt-1 italic text-muted-foreground">
                                {step.timing_rationale}
                              </p>
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  </>
                ) : nNode && "error" in nNode && typeof nNode.error === "string" ? (
                  <p className="text-destructive">{nNode.error}</p>
                ) : (
                  <p className="text-muted-foreground">No nurture output.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
