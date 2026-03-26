"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
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
import { createClient } from "@/lib/supabase";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "" },
  });

  function onSubmit(values: LoginValues) {
    startTransition(async () => {
      try {
        const supabase = createClient();
        const origin =
          typeof window !== "undefined" ? window.location.origin : "";
        const { error } = await supabase.auth.signInWithOtp({
          email: values.email,
          options: {
            emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
          },
        });
        if (error) {
          toast({
            variant: "destructive",
            title: "Sign-in failed",
            description: error.message,
          });
          return;
        }
        setSent(true);
        toast({
          title: "Check your email",
          description: "We sent you a magic link to sign in.",
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unexpected error";
        toast({
          variant: "destructive",
          title: "Error",
          description: message,
        });
      }
    });
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">AgentForge Sales</CardTitle>
        <CardDescription>
          Sign in with your work email. We&apos;ll email you a magic link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                      placeholder="you@company.com"
                      disabled={isPending || sent}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={isPending || sent}
            >
              {sent ? "Link sent" : isPending ? "Sending…" : "Send magic link"}
            </Button>
          </form>
        </Form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          After signing in you&apos;ll land on the dashboard.
        </p>
      </CardContent>
    </Card>
  );
}
