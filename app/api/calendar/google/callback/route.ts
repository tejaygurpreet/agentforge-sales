import {
  exchangeGoogleAuthorizationCode,
  saveUserCalendarRefreshToken,
  verifyCalendarOAuthState,
} from "@/lib/calendar";
import { getServiceRoleSupabaseOrNull } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function base() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const err = url.searchParams.get("error");
  if (err) {
    return NextResponse.redirect(new URL(`/?calendar_error=${encodeURIComponent(err)}`, base()));
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const payload = state ? verifyCalendarOAuthState(state) : null;
  if (!code || !payload || payload.provider !== "google") {
    return NextResponse.redirect(new URL("/?calendar_error=invalid_callback", base()));
  }
  const sr = getServiceRoleSupabaseOrNull();
  if (!sr) {
    return NextResponse.redirect(new URL("/?calendar_error=no_service_role", base()));
  }
  try {
    const tokens = await exchangeGoogleAuthorizationCode(code);
    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        new URL("/?calendar_error=missing_refresh_reconnect", base()),
      );
    }
    await saveUserCalendarRefreshToken(
      sr,
      payload.userId,
      "google",
      tokens.refresh_token,
      null,
    );
    return NextResponse.redirect(new URL("/?calendar_connected=google", base()));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "token_failed";
    return NextResponse.redirect(new URL(`/?calendar_error=${encodeURIComponent(msg)}`, base()));
  }
}
