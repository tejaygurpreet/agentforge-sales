"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
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
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase";
import { Loader2, Lock, LogIn, Mail, Sparkles } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const [isPending, startTransition] = useTransition();

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  function onSubmit(values: LoginValues) {
    startTransition(async () => {
      try {
        const supabase = createClient();
        const { error } = await supabase.auth.signInWithPassword({
          email: values.email,
          password: values.password,
        });
        if (error) {
          toast({
            variant: "destructive",
            title: "We couldn’t sign you in",
            description:
              error.message ||
              "Check your email and password, then try again. If you forgot your password, reset it from your email provider.",
          });
          return;
        }
        toast({
          title: "Signed in",
          description: "Welcome back.",
        });
        router.push(next);
        router.refresh();
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unexpected error";
        toast({
          variant: "destructive",
          title: "Something went wrong",
          description: message,
        });
      }
    });
  }

  const signupHref =
    next !== "/" ? `/signup?next=${encodeURIComponent(next)}` : "/signup";

  return (
    <Card
      className={cn(
        "w-full max-w-[420px] overflow-hidden rounded-2xl border-border/55 bg-card/95 shadow-lift ring-1 ring-border/25",
        "animate-in fade-in zoom-in-95 duration-500",
      )}
    >
      <CardHeader className="space-y-4 border-b border-border/40 bg-gradient-to-br from-primary/[0.08] via-card to-accent/[0.06] px-8 pb-8 pt-9 text-center sm:text-left">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/25 bg-card shadow-sm sm:mx-0">
          <Sparkles className="h-7 w-7 text-primary" aria-hidden />
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary/80">Welcome back</p>
          <CardTitle className="text-2xl font-semibold tracking-tight">{DEFAULT_BRAND_DISPLAY_NAME}</CardTitle>
          <CardDescription className="text-[15px] leading-relaxed">
            Sign in with your work email. New here? Create an account in under a minute.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 px-8 pb-9 pt-8">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
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
                        autoComplete="current-password"
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
                  Signing in…
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" aria-hidden />
                  Sign in
                </>
              )}
            </Button>
          </form>
        </Form>
        <p className="text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link
            href={signupHref}
            className="font-semibold text-primary underline-offset-4 transition-colors hover:text-primary/90 hover:underline"
          >
            Create an account
          </Link>
        </p>
        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          After you sign in, use <span className="font-medium text-foreground">Setup</span> in the top
          navigation for a guided walkthrough — brand, integrations, and your first campaign.
        </p>
      </CardContent>
    </Card>
  );
}
