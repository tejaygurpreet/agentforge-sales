"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { signUpAndSignIn } from "./actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { DEFAULT_BRAND_DISPLAY_NAME } from "@/lib/brand-prompt";
import { AuthSplitLayout } from "@/components/auth/auth-split-layout";
import { signupSchema, type SignupFormValues } from "@/lib/signup-schema";
import { cn } from "@/lib/utils";
import { Loader2, Lock, Mail, Rocket, User } from "lucide-react";

export function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const [isPending, startTransition] = useTransition();

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  function onSubmit(values: SignupFormValues) {
    startTransition(async () => {
      const result = await signUpAndSignIn(values);
      if (!result.ok) {
        toast({
          variant: "destructive",
          title: "We couldn’t create your account",
          description:
            result.error ||
            "Try again in a moment. If the problem continues, use a different email or sign in instead.",
        });
        return;
      }
      toast({
        title: "Welcome",
        description: "Your account is ready.",
      });
      router.push(next);
      router.refresh();
    });
  }

  const loginHref = next !== "/" ? `/login?next=${encodeURIComponent(next)}` : "/login";

  return (
    <AuthSplitLayout tagline="Create your workspace. One sign-up — then Setup, campaigns, and inbox unlock.">
    <Card
      className={cn(
        "w-full overflow-hidden rounded-[var(--card-radius)] border-border/50 bg-card shadow-soft ring-1 ring-black/[0.04]",
        "bg-gradient-to-br from-card via-card to-muted/25",
      )}
    >
      <CardHeader className="space-y-4 border-b border-border/40 bg-gradient-to-br from-primary/[0.07] via-card to-primary/[0.05] px-8 pb-8 pt-9 text-center sm:text-left">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[var(--card-radius)] border border-sage/30 bg-white shadow-inner sm:mx-0">
          <Rocket className="h-7 w-7 text-sage" aria-hidden />
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-sage/90">Get started</p>
          <CardTitle className="text-2xl font-semibold tracking-tight">Create your account</CardTitle>
          <CardDescription className="text-[15px] leading-relaxed">
            Join {DEFAULT_BRAND_DISPLAY_NAME} — your name is saved to your profile. You&apos;re signed in
            right after signup.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 px-8 pb-9 pt-8">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-5"
            aria-busy={isPending}
          >
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Full name</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                      <Input
                        autoComplete="name"
                        placeholder="Jordan Lee"
                        disabled={isPending}
                        className="h-11 rounded-xl border-border/60 bg-white pl-10 shadow-inner transition-shadow focus-visible:ring-2 focus-visible:ring-sage/30"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Email</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                      <Input
                        type="email"
                        autoComplete="email"
                        placeholder="you@company.com"
                        disabled={isPending}
                        className="h-11 rounded-xl border-border/60 bg-white pl-10 shadow-inner transition-shadow focus-visible:ring-2 focus-visible:ring-sage/30"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                      <Input
                        type="password"
                        autoComplete="new-password"
                        disabled={isPending}
                        className="h-11 rounded-xl border-border/60 bg-white pl-10 shadow-inner transition-shadow focus-visible:ring-2 focus-visible:ring-sage/30"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Confirm password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                      <Input
                        type="password"
                        autoComplete="new-password"
                        disabled={isPending}
                        className="h-11 rounded-xl border-border/60 bg-white pl-10 shadow-inner transition-shadow focus-visible:ring-2 focus-visible:ring-sage/30"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="h-11 w-full gap-2 rounded-xl text-base shadow-soft transition-transform active:scale-[0.99]"
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Creating your account…
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4" aria-hidden />
                  Sign up
                </>
              )}
            </Button>
          </form>
        </Form>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href={loginHref}
            className="font-semibold text-sage underline-offset-4 transition-colors hover:text-sage/85 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
    </AuthSplitLayout>
  );
}
