import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { LoginForm } from "./login-form";

function LoginFormFallback() {
  return (
    <div className="w-full max-w-[440px] space-y-5 rounded-[var(--card-radius)] border border-border/50 bg-card/90 p-8 shadow-soft ring-1 ring-black/[0.04] motion-safe:animate-content-settle">
      <Skeleton className="mx-auto h-12 w-12 rounded-2xl" />
      <Skeleton className="h-8 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-11 w-full rounded-xl" />
      <Skeleton className="h-11 w-full rounded-xl" />
      <Skeleton className="h-11 w-full rounded-xl" />
    </div>
  );
}

/** Prompt 136 — Uses `AuthSplitLayout` + `AuthHeroIllustration` (energetic sage/coral/terracotta). */
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFormFallback />}>
      <LoginForm />
    </Suspense>
  );
}
