"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DEFAULT_BRAND_DISPLAY_NAME } from "@/lib/brand-prompt";
import { ONBOARDING_DISMISS_STORAGE_KEY } from "@/lib/onboarding-storage";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Link2,
  Palette,
  Play,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const STEPS = [
  {
    key: "welcome",
    title: "Welcome",
    headline: `You're in — let's make ${DEFAULT_BRAND_DISPLAY_NAME} yours`,
    body: "This short guide points you to the right places on your dashboard: branding, CRM, and your first AI campaign. You can leave anytime and come back from **Setup** in the top bar.",
    icon: Sparkles,
    accent: "from-accent/[0.12] via-card to-primary/[0.08]",
  },
  {
    key: "brand",
    title: "Brand",
    headline: "Match the product to your company",
    body: "Add your logo, colors, and support email so exports and the header feel on-brand. Everything is optional and saved to your workspace only.",
    icon: Palette,
    accent: "from-primary/[0.1] via-card to-amber-500/[0.06]",
    cta: { label: "Open brand & integrations", href: "/#workspace-brand-integrations" },
  },
  {
    key: "crm",
    title: "Integrations",
    headline: "Optional: sync with HubSpot",
    body: "Paste a Private App token once — deals and notes can flow from completed campaigns when you export. Nothing syncs until you choose to.",
    icon: Link2,
    accent: "from-orange-500/[0.1] via-card to-amber-500/[0.05]",
    cta: { label: "Jump to HubSpot card", href: "/#workspace-brand-integrations" },
  },
  {
    key: "campaign",
    title: "First campaign",
    headline: "Run research → outreach → qualification → nurture",
    body: "Add a lead, pick a voice, and start. Results land in the Workspace tab — review every step before you send email or LinkedIn.",
    icon: Play,
    accent: "from-primary/[0.1] via-card to-muted0/[0.06]",
    cta: { label: "Go to campaign workspace", href: "/#campaign-workspace" },
  },
] as const;

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const total = STEPS.length;
  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === total - 1;

  function markCompleteAndGoHome() {
    try {
      localStorage.setItem(ONBOARDING_DISMISS_STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    router.push("/");
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setStep(i)}
            className={cn(
              "flex h-8 min-w-[2rem] items-center justify-center rounded-full border px-2 text-xs font-semibold transition-all duration-200",
              i === step
                ? "border-primary bg-primary/[0.12] text-foreground shadow-sm ring-1 ring-primary/25"
                : i < step
                  ? "border-primary/50 bg-primary/[0.1] text-foreground"
                  : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/50",
            )}
            aria-label={`Step ${i + 1}: ${s.title}`}
            aria-current={i === step ? "step" : undefined}
          >
            {i < step ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : i + 1}
          </button>
        ))}
        <span className="ml-1 text-xs font-medium text-muted-foreground">
          Step {step + 1} of {total}
        </span>
      </div>

      <Card
        className={cn(
          "overflow-hidden rounded-2xl border-border/55 shadow-lift ring-1 ring-border/25",
          "transition-shadow duration-300",
        )}
      >
        <CardHeader
          className={cn(
            "space-y-4 border-b border-border/40 bg-gradient-to-br px-8 pb-8 pt-10 sm:px-10",
            current.accent,
          )}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border/50 bg-card shadow-sm">
            <Icon className="h-7 w-7 text-primary" aria-hidden />
          </div>
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              {current.title}
            </p>
            <CardTitle className="text-2xl font-semibold tracking-tight sm:text-3xl">{current.headline}</CardTitle>
            <CardDescription className="text-base leading-relaxed text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
              {current.body.split("**").map((chunk, i) =>
                i % 2 === 1 ? (
                  <strong key={i}>{chunk}</strong>
                ) : (
                  <span key={i}>{chunk}</span>
                ),
              )}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 px-8 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-10">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              <ChevronLeft className="mr-1 h-4 w-4" aria-hidden />
              Back
            </Button>
            {!isLast ? (
              <Button type="button" className="rounded-xl shadow-soft" onClick={() => setStep((s) => s + 1)}>
                Continue
                <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
              </Button>
            ) : (
              <Button type="button" className="gap-2 rounded-xl shadow-soft" onClick={markCompleteAndGoHome}>
                Finish &amp; go to dashboard
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            )}
          </div>
          {"cta" in current && current.cta ? (
            <Button
              type="button"
              variant="secondary"
              className="w-full rounded-xl sm:w-auto"
              asChild
            >
              <Link href={current.cta.href}>
                {current.cta.label}
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        Prefer to explore alone?{" "}
        <button
          type="button"
          className="font-semibold text-primary underline-offset-4 hover:underline"
          onClick={markCompleteAndGoHome}
        >
          Skip for now
        </button>
      </p>
    </div>
  );
}
