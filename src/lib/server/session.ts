import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "./database.types";
import { getSupabaseConfig, isEmailAllowed } from "./env";

/** Paths anyone may visit without a session. */
function isPublicPath(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/auth/") || pathname === "/setup";
}

function redirectTo(request: NextRequest, pathname: string, params: Record<string, string> = {}): URL {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

/** Carries refreshed auth cookies over to a redirect or error response. */
function withCookies(source: NextResponse, target: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie);
  return target;
}

/**
 * Runs on every request: refreshes the Supabase session cookies, keeps
 * signed-out visitors on the sign-in page, and enforces the optional email
 * allowlist.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const config = getSupabaseConfig();

  if (!config) {
    // Not configured yet: explain how, instead of failing on every page.
    if (pathname === "/setup" || pathname.startsWith("/_next/")) return NextResponse.next();
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Index is not configured yet." }, { status: 503 });
    }
    return NextResponse.redirect(redirectTo(request, "/setup"));
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(config.url, config.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Do not put code between client creation and getUser(): it refreshes the
  // session, and anything in between can sign users out at random.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && !isEmailAllowed(user.email)) {
    await supabase.auth.signOut();
    if (pathname.startsWith("/api/")) {
      return withCookies(response, NextResponse.json({ error: "Not allowed." }, { status: 403 }));
    }
    return withCookies(response, NextResponse.redirect(redirectTo(request, "/login", { error: "not_allowed" })));
  }

  if (!user && !isPublicPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      return withCookies(response, NextResponse.json({ error: "Sign in to continue." }, { status: 401 }));
    }
    const next = pathname === "/" ? {} : { next: `${pathname}${request.nextUrl.search}` };
    return withCookies(response, NextResponse.redirect(redirectTo(request, "/login", next)));
  }

  if (user && pathname === "/login") {
    return withCookies(response, NextResponse.redirect(redirectTo(request, "/")));
  }

  return response;
}
