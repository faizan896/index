/**
 * Reading /login's search params: the `error` code the auth routes redirect
 * with, and the `next` path to return to after signing in.
 */
import { safeNextPath } from "@/lib/validate";

type Param = string | string[] | undefined;

function first(value: Param): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const ERROR_MESSAGES = new Map<string, string>([
  ["auth", "That sign-in link has expired or was already used. Request a new one."],
  ["not_allowed", "This account isn't allowed to use this library."],
  ["oauth", "Signing in with Google didn't work. Try again, or use your email."],
]);

/** The sentence for an `?error=` code; null when there is none. Unknown codes get a general line. */
export function loginErrorMessage(value: Param): string | null {
  const code = first(value)?.trim();
  if (!code) return null;
  return ERROR_MESSAGES.get(code) ?? "Signing in didn't work. Please try again.";
}

/** A same-site path to continue to after signing in ("/" when missing or unsafe). */
export function loginNextPath(value: Param): string {
  return safeNextPath(first(value));
}
