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
import { signupSchema, type SignupFormValues } from "@/lib/signup-schema";
import { cn } from "@/lib/utils";
import { Loader2, Lock, Mail, Rocket, User } from "lucide-react";

export function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
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
    <Card
      className={cn(
        "w-full max-w-[420px] overflow-hidden rounded-2xl border-border/55 bg-card/95 shadow-lift ring-1 ring-border/25",
        "animate-in fade-in zoom-in-95 duration-500",
      )}
    >
      <CardHeader className="space-y-4 border-b border-border/40 bg-gradient-to-br from-emerald-500/[0.07] via-card to-sky-500/[0.05] px-8 pb-8 pt-9 text-center sm:text-left">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/30 bg-card shadow-sm sm:mx-0">
          <Rocket className="h-7 w-7 text-emerald-700" aria-hidden />
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-800/85">Get started</p>
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
                        className="h-11 rounded-xl border-border/60 pl-10 shadow-sm transition-shadow focus-visible:ring-2 focus-visible:ring-primary/25"
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
                        className="h-11 rounded-xl border-border/60 pl-10 shadow-sm transition-shadow focus-visible:ring-2 focus-visible:ring-primary/25"
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
                        className="h-11 rounded-xl border-border/60 pl-10 shadow-sm transition-shadow focus-visible:ring-2 focus-visible:ring-primary/25"
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
                        className="h-11 rounded-xl border-border/60 pl-10 shadow-sm transition-shadow focus-visible:ring-2 focus-visible:ring-primary/25"
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
            className="font-semibold text-primary underline-offset-4 transition-colors hover:text-primary/90 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
