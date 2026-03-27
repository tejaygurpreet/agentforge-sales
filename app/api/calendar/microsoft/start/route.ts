import {
  buildMicrosoftCalendarAuthUrl,
  signCalendarOAuthState,
} from "@/lib/calendar";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function base() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/?calendar_auth=required", base()));
  }
  try {
    const state = signCalendarOAuthState({ userId: user.id, provider: "microsoft" });
    const url = buildMicrosoftCalendarAuthUrl(state);
    return NextResponse.redirect(url);
  } catch {
    return NextResponse.redirect(new URL("/?calendar_error=oauth_config", base()));
  }
}
