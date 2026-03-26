import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  let response = NextResponse.next({ request: { headers: request.headers } });
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
        response = NextResponse.next({ request: { headers: request.headers } });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLogin = path === "/login";
  const isSignup = path === "/signup";
  const isProtected =
    path === "/" ||
    path.startsWith("/agents") ||
    path === "/replies" ||
    path.startsWith("/replies/") ||
    path === "/analytics" ||
    path.startsWith("/analytics/");

  if (!user && isProtected) {
    const redirect = new URL("/login", request.url);
    redirect.searchParams.set("next", path);
    return NextResponse.redirect(redirect);
  }

  if (user && (isLogin || isSignup)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/",
    "/agents",
    "/agents/:path*",
    "/replies",
    "/replies/:path*",
    "/analytics",
    "/analytics/:path*",
    "/login",
    "/signup",
  ],
};
