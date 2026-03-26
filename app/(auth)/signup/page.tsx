import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { SignupForm } from "./signup-form";

function SignupFormFallback() {
  return (
    <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Suspense fallback={<SignupFormFallback />}>
        <SignupForm />
      </Suspense>
    </div>
  );
}
