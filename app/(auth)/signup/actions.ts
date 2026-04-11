"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signupSchema, type SignupFormValues } from "@/lib/signup-schema";
import {
  createServerSupabaseActionClient,
  createServiceRoleSupabase,
} from "@/lib/supabase-server";

export type SignUpResult = { ok: true } | { ok: false; error: string };

function friendlyMessage(raw: string): string {
  const m = raw.toLowerCase();
  if (
    m.includes("rate limit") ||
    m.includes("too many") ||
    m.includes("email rate limit")
  ) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }
  return raw;
}

function isEmailNotConfirmedError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("email not confirmed") ||
    m.includes("email_not_confirmed") ||
    (m.includes("not confirmed") && m.includes("email")) ||
    m.includes("verify your email")
  );
}

function isDuplicateUserError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("already been registered") ||
    m.includes("already registered") ||
    m.includes("user already exists") ||
    m.includes("duplicate") ||
    (m.includes("already") && m.includes("exists"))
  );
}

async function findUserIdByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<string | null> {
  const target = email.toLowerCase();
  let page = 1;
  const perPage = 200;
  for (let i = 0; i < 10; i++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error || !data?.users?.length) return null;
    const found = data.users.find((u) => u.email?.toLowerCase() === target);
    if (found?.id) return found.id;
    if (data.users.length < perPage) return null;
    page += 1;
  }
  return null;
}

/** Forces `email_confirmed_at` via Admin API (no dashboard toggle required for this user). */
async function forceConfirmUser(
  admin: SupabaseClient,
  userId: string,
  fullName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await admin.auth.admin.updateUserById(userId, {
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) return { ok: false, error: friendlyMessage(error.message) };
  return { ok: true };
}

async function signInOrFail(
  supabase: SupabaseClient,
  email: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

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

  let admin: SupabaseClient;
  try {
    admin = createServiceRoleSupabase();
  } catch {
    return {
      ok: false,
      error:
        "Add SUPABASE_SERVICE_ROLE_KEY to your server environment (Vercel → Environment Variables). Signup requires the service role to create confirmed accounts.",
    };
  }

  const supabase = await createServerSupabaseActionClient();

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: emailNorm,
      password,
      email_confirm: true,
      user_metadata: { full_name: nameTrim },
    });

  let userId = created?.user?.id ?? null;

  if (!createError && userId) {
    const forced = await forceConfirmUser(admin, userId, nameTrim);
    if (!forced.ok) return { ok: false, error: forced.error };
  }

  if (createError) {
    if (!isDuplicateUserError(createError.message)) {
      return { ok: false, error: friendlyMessage(createError.message) };
    }

    userId = (await findUserIdByEmail(admin, emailNorm)) ?? userId;

    if (userId) {
      const confirmed = await forceConfirmUser(admin, userId, nameTrim);
      if (!confirmed.ok) {
        return { ok: false, error: confirmed.error };
      }
    }

    let signIn = await signInOrFail(supabase, emailNorm, password);
    if (signIn.ok) return { ok: true };

    if (isEmailNotConfirmedError(signIn.error)) {
      const uid = userId ?? (await findUserIdByEmail(admin, emailNorm));
      if (uid) {
        const c = await forceConfirmUser(admin, uid, nameTrim);
        if (!c.ok) return { ok: false, error: c.error };
        signIn = await signInOrFail(supabase, emailNorm, password);
        if (signIn.ok) return { ok: true };
      }
    }

    return {
      ok: false,
      error: friendlyMessage(
        isEmailNotConfirmedError(signIn.error)
          ? signIn.error
          : signIn.error.includes("Invalid login") ||
              signIn.error.toLowerCase().includes("invalid")
            ? "An account with this email already exists. Sign in with your password."
            : signIn.error,
      ),
    };
  }

  let signIn = await signInOrFail(supabase, emailNorm, password);
  if (signIn.ok) return { ok: true };

  if (userId && isEmailNotConfirmedError(signIn.error)) {
    const c = await forceConfirmUser(admin, userId, nameTrim);
    if (!c.ok) return { ok: false, error: c.error };
    signIn = await signInOrFail(supabase, emailNorm, password);
    if (signIn.ok) return { ok: true };
  }

  if (!userId && isEmailNotConfirmedError(signIn.error)) {
    const uid = await findUserIdByEmail(admin, emailNorm);
    if (uid) {
      const c = await forceConfirmUser(admin, uid, nameTrim);
      if (!c.ok) return { ok: false, error: c.error };
      signIn = await signInOrFail(supabase, emailNorm, password);
      if (signIn.ok) return { ok: true };
    }
  }

  return { ok: false, error: friendlyMessage(signIn.error) };
}
