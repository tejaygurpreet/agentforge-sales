import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/** Prefer NEXT_PUBLIC_APP_URL (e.g. https://agentforgesales.com) so post-confirm redirects match Site URL. */
function redirectBase(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      /* invalid URL — fall back */
    }
  }
  return new URL(request.url).origin;
}

export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const { searchParams } = new URL(request.url);
  const origin = redirectBase(request);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!url || !anon) {
    return NextResponse.redirect(`${origin}/login?error=config`);
  }

  if (code) {
    const response = NextResponse.redirect(`${origin}${next}`);
    type CookieSetOptions = Parameters<typeof response.cookies.set>[2];
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieSetOptions;
          }[],
        ) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return response;
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
