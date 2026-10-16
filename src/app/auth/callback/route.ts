import type { NextRequest } from "next/server";

import { finishSignIn, siteRedirect } from "@/lib/server/auth-redirect";
import { logServerError } from "@/lib/server/log";
import { createSupabaseServerClient } from "@/lib/server/supabase";
import { safeNextPath } from "@/lib/validate";

/** OAuth and magic-link (PKCE) sign-ins land here with a one-time code. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  if (!code) return siteRedirect(request, "/login?error=auth");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    logServerError("auth: exchange code", error);
    return siteRedirect(request, "/login?error=auth");
  }
  return finishSignIn(supabase, request, next);
}
