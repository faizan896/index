import "server-only";

import { NextResponse } from "next/server";

import { isEmailAllowed } from "./env";
import type { ServerSupabase } from "./supabase";

/**
 * Where to send someone after a sign-in attempt. Always the origin the request
 * arrived on: the session cookies were just set there (on a preview
 * deployment, that's the preview's own domain).
 */
export function siteRedirect(request: Request, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, new URL(request.url).origin), { status: 303 });
}

/** After a session is established: enforce the allowlist, then continue. */
export async function finishSignIn(supabase: ServerSupabase, request: Request, next: string): Promise<NextResponse> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return siteRedirect(request, "/login?error=auth");
  if (!isEmailAllowed(data.user.email)) {
    await supabase.auth.signOut();
    return siteRedirect(request, "/login?error=not_allowed");
  }
  return siteRedirect(request, next);
}
