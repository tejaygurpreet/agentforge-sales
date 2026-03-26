"use server";

import { revalidatePath } from "next/cache";
import { signupSchema, type SignupFormValues } from "@/lib/signup-schema";
import {
  createServerSupabaseActionClient,
  getServiceRoleSupabaseOrNull,
} from "@/lib/supabase-server";

export type SignUpResult =
  | { ok: true }
  | { ok: false; error: string };

function friendlyMessage(raw: string): string {
  const m = raw.toLowerCase();
  if (
    m.includes("rate limit") ||
    m.includes("too many") ||
    m.includes("email rate limit")
  ) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }
  if (
    (m.includes("already") || m.includes("registered")) &&
    (m.includes("user") || m.includes("email") || m.includes("exists"))
  ) {
    return "An account with this email already exists. Sign in instead.";
  }
  return raw;
}

/**
 * Creates a **confirmed** user via Admin API when `SUPABASE_SERVICE_ROLE_KEY` is set
 * (no confirmation email → avoids Supabase email rate limits). Then signs in with SSR cookies.
 * Fallback: anon `signUp` + `signInWithPassword` if service role is missing (e.g. local dev without key).
 */
export async function signUpAndSignIn(
  input: SignupFormValues,
): Promise<SignUpResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.flatten().fieldErrors;
    const msg =
      first.fullName?.[0] ||
      first.email?.[0] ||
      first.password?.[0] ||
      first.confirmPassword?.[0] ||
      "Check your details and try again.";
    return { ok: false, error: msg };
  }

  const { fullName, email, password } = parsed.data;
  const emailNorm = email.trim().toLowerCase();
  const nameTrim = fullName.trim();

  const admin = getServiceRoleSupabaseOrNull();

  if (admin) {
    const { error: createError } = await admin.auth.admin.createUser({
      email: emailNorm,
      password,
      email_confirm: true,
      user_metadata: { full_name: nameTrim },
    });

    if (createError) {
      return {
        ok: false,
        error: friendlyMessage(createError.message),
      };
    }
  } else {
    const supabaseAnon = await createServerSupabaseActionClient();
    const { data, error: signUpError } = await supabaseAnon.auth.signUp({
      email: emailNorm,
      password,
      options: {
        data: { full_name: nameTrim },
      },
    });

    if (signUpError) {
      return { ok: false, error: friendlyMessage(signUpError.message) };
    }

    if (data.session) {
      revalidatePath("/", "layout");
      return { ok: true };
    }

    const { error: signInError } = await supabaseAnon.auth.signInWithPassword({
      email: emailNorm,
      password,
    });

    if (signInError) {
      return {
        ok: false,
        error: friendlyMessage(
          signInError.message ||
            "Add SUPABASE_SERVICE_ROLE_KEY to your server environment for reliable signup, or disable Confirm email in Supabase.",
        ),
      };
    }

    revalidatePath("/", "layout");
    return { ok: true };
  }

  const supabase = await createServerSupabaseActionClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: emailNorm,
    password,
  });

  if (signInError) {
    return {
      ok: false,
      error: friendlyMessage(
        signInError.message || "Could not sign you in after signup.",
      ),
    };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
