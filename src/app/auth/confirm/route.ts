import type { EmailOtpType } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

import { finishSignIn, siteRedirect } from "@/lib/server/auth-redirect";
import { logServerError } from "@/lib/server/log";
import { createSupabaseServerClient } from "@/lib/server/supabase";
import { safeNextPath } from "@/lib/validate";

const OTP_TYPES: readonly EmailOtpType[] = ["email", "magiclink", "signup", "invite", "recovery", "email_change"];

/**
 * Token-hash sign-in links (see README: the recommended email template).
 * Unlike the PKCE code flow, these work even when the link is opened in a
 * different browser from the one that asked for it.
 */
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  if (!tokenHash || !type || !(OTP_TYPES as readonly string[]).includes(type)) {
    return siteRedirect(request, "/login?error=auth");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash });
  if (error) {
    logServerError("auth: verify otp", error);
    return siteRedirect(request, "/login?error=auth");
  }
  return finishSignIn(supabase, request, next);
}
