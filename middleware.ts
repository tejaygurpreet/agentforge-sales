import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function nextWithPathname(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  let response = nextWithPathname(request);
  type CookieSetOptions = Parameters<typeof response.cookies.set>[2];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return response;
  }

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
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set("x-pathname", request.nextUrl.pathname);
        response = NextResponse.next({
          request: { headers: requestHeaders },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (path === "/agents" || path.startsWith("/agents/")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const isLogin = path === "/login";
  const isSignup = path === "/signup";
  const isPublic = path === "/";

  if (!user && !isPublic && !isLogin && !isSignup) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && (isLogin || isSignup)) {
    return NextResponse.redirect(new URL("/campaigns", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/signup",
    "/campaigns",
    "/campaigns/:path*",
    "/setup",
    "/setup/:path*",
    "/agents",
    "/agents/:path*",
    "/replies",
    "/replies/:path*",
    "/analytics",
    "/analytics/:path*",
    "/inbox",
    "/inbox/:path*",
    "/onboarding",
    "/onboarding/:path*",
    "/coming-soon",
    "/coming-soon/:path*",
    "/twilio",
    "/twilio/:path*",
  ],
};
