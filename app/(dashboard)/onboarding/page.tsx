import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

/** Prompt 107 — first-time setup wizard (authenticated). Prompt 114 — hero card + entrance motion. */
export default function OnboardingPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 px-1 py-2 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 sm:space-y-10 sm:py-4">
      <div className="space-y-3 rounded-2xl border border-border/45 bg-gradient-to-br from-card via-card to-muted/25 px-4 py-5 shadow-soft ring-1 ring-black/[0.03] sm:px-6 sm:py-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Setup guide</h1>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          Move at your own pace — each step links to the right place on your dashboard. You can revisit this
          anytime from <span className="font-medium text-foreground">Setup</span> in the navigation.
        </p>
      </div>
      <OnboardingWizard />
    </div>
  );
}
