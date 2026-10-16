"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSiteUrl, isEmailAllowed } from "@/lib/server/env";
import { logServerError } from "@/lib/server/log";
import { createSupabaseServerClient } from "@/lib/server/supabase";
import { isEmail, safeNextPath } from "@/lib/validate";

export interface EmailSignInState {
  status: "idle" | "sent" | "error";
  message?: string;
  email?: string;
}

async function siteUrl(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const proto = requestHeaders.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return getSiteUrl(host ? `${proto}://${host}` : null);
}

function callbackUrl(base: string, next: string): string {
  const url = new URL("/auth/callback", base);
  if (next !== "/") url.searchParams.set("next", next);
  return url.toString();
}

/** For useActionState: reads "email" and "next" from the form and sends a sign-in link. */
export async function signInWithEmail(_previous: EmailSignInState, formData: FormData): Promise<EmailSignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = safeNextPath(formData.get("next"));
  if (!isEmail(email)) return { status: "error", message: "Enter a valid email address.", email };

  // An address outside the allowlist gets the same answer as any other, so
  // the form never reveals who has access, but no email is sent.
  if (!isEmailAllowed(email)) return { status: "sent", email };

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl(await siteUrl(), next), shouldCreateUser: true },
    });
    if (error) {
      if (error.status === 429) {
        return { status: "error", message: "Too many sign-in emails. Wait a minute, then try again.", email };
      }
      logServerError("signInWithEmail", error);
      return { status: "error", message: "Index couldn't send the email. Please try again.", email };
    }
  } catch (error) {
    logServerError("signInWithEmail", error);
    return { status: "error", message: "Index couldn't send the email. Please try again.", email };
  }
  return { status: "sent", email };
}

/** Form action: reads "next" from the form and redirects to Google via Supabase OAuth. */
export async function signInWithGoogle(formData: FormData): Promise<void> {
  const next = safeNextPath(formData.get("next"));
  let destination = "/login?error=oauth";
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl(await siteUrl(), next) },
    });
    if (error) logServerError("signInWithGoogle", error);
    else if (data.url) destination = data.url;
  } catch (error) {
    logServerError("signInWithGoogle", error);
  }
  // redirect() works by throwing, so it stays outside the try block.
  redirect(destination);
}
