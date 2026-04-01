import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { SignupForm } from "./signup-form";

function SignupFormFallback() {
  return (
    <div className="w-full max-w-[440px] space-y-5 rounded-[var(--card-radius)] border border-border/50 bg-card/90 p-8 shadow-soft ring-1 ring-black/[0.04] motion-safe:animate-content-settle">
      <Skeleton className="mx-auto h-12 w-12 rounded-2xl" />
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-11 w-full rounded-xl" />
      <Skeleton className="h-11 w-full rounded-xl" />
      <Skeleton className="h-11 w-full rounded-xl" />
      <Skeleton className="h-11 w-full rounded-xl" />
      <Skeleton className="h-11 w-full rounded-xl" />
    </div>
  );
}

/** Prompt 136 — Same energetic split hero as login (`AuthSplitLayout`). */
export default function SignupPage() {
  return (
    <Suspense fallback={<SignupFormFallback />}>
      <SignupForm />
    </Suspense>
  );
}
