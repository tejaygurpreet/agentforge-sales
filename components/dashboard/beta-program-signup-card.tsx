"use client";

import { submitBetaSignupAction } from "@/app/(dashboard)/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Loader2, Sparkles } from "lucide-react";
import { useCallback, useState } from "react";

const initial = {
  full_name: "",
  company: "",
  role: "",
  linkedin_url: "",
  motivation: "",
};

/**
 * Prompt 75 — Beta program interest form; persists to `beta_signups` via server action.
 */
export function BetaProgramSignupCard() {
  const [values, setValues] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const onChange =
    (field: keyof typeof initial) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setError(null);
      setSuccess(false);
      setValues((v) => ({ ...v, [field]: e.target.value }));
    };

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setSuccess(false);
      setPending(true);
      try {
        const res = await submitBetaSignupAction({
          full_name: values.full_name,
          company: values.company,
          role: values.role,
          linkedin_url: values.linkedin_url,
          motivation: values.motivation,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setSuccess(true);
        setValues(initial);
      } finally {
        setPending(false);
      }
    },
    [values],
  );

  return (
    <Card
      className={cn(
        "premium-card-interactive overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-card/95 via-card/80 to-primary/[0.07] shadow-xl ring-1 ring-primary/15 dark:from-card/90 dark:via-card/70 dark:to-primary/[0.12]",
      )}
    >
      <CardHeader className="relative space-y-3 border-b border-border/40 bg-muted/20 pb-6">
        <div className="flex flex-wrap items-start gap-3">
          <span className="rounded-xl border border-primary/35 bg-primary/15 p-2.5 text-primary shadow-inner">
            <Sparkles className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <CardTitle className="text-balance-safe text-xl font-semibold tracking-tight sm:text-2xl">
              Join the Beta Program – Get Early Access + Lifetime Discount
            </CardTitle>
            <CardDescription className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Be among the first to use AgentForge Sales. Help shape the product and get lifetime 50%
              off when it goes paid.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {success ? (
          <div
            role="status"
            className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-900 dark:text-emerald-100"
          >
            Thanks — you&apos;re on the beta list. We&apos;ll be in touch soon.
          </div>
        ) : (
          <form className="space-y-5" onSubmit={(e) => void onSubmit(e)} noValidate>
            {error ? (
              <p
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="beta-full-name">Full name</Label>
                <Input
                  id="beta-full-name"
                  name="full_name"
                  autoComplete="name"
                  required
                  maxLength={200}
                  value={values.full_name}
                  onChange={onChange("full_name")}
                  className="bg-background/60 dark:bg-background/40"
                  placeholder="Alex Rivera"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="beta-company">Company</Label>
                <Input
                  id="beta-company"
                  name="company"
                  autoComplete="organization"
                  required
                  maxLength={200}
                  value={values.company}
                  onChange={onChange("company")}
                  className="bg-background/60 dark:bg-background/40"
                  placeholder="Acme Inc"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="beta-role">Role</Label>
                <Input
                  id="beta-role"
                  name="role"
                  autoComplete="organization-title"
                  required
                  maxLength={120}
                  value={values.role}
                  onChange={onChange("role")}
                  className="bg-background/60 dark:bg-background/40"
                  placeholder="Head of Sales"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="beta-linkedin">LinkedIn URL (optional)</Label>
                <Input
                  id="beta-linkedin"
                  name="linkedin_url"
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  maxLength={500}
                  value={values.linkedin_url}
                  onChange={onChange("linkedin_url")}
                  className="bg-background/60 dark:bg-background/40"
                  placeholder="https://www.linkedin.com/in/…"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="beta-motivation">Why do you want early access?</Label>
              <Textarea
                id="beta-motivation"
                name="motivation"
                required
                minLength={10}
                maxLength={4000}
                rows={4}
                value={values.motivation}
                onChange={onChange("motivation")}
                className="min-h-[100px] resize-y bg-background/60 dark:bg-background/40"
                placeholder="A few sentences about your team, pipeline, and what you hope to validate…"
              />
              <p className="text-xs text-muted-foreground">Minimum 10 characters.</p>
            </div>

            <Button type="submit" disabled={pending} className="w-full gap-2 sm:w-auto">
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden />
              )}
              Join the beta
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
