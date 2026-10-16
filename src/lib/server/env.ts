/**
 * Server configuration from the environment. Free of Node-only imports so
 * the middleware (edge runtime) can use it too.
 */

export class ConfigurationError extends Error {}

export interface SupabaseConfig {
  url: string;
  /** The browser-safe publishable (or legacy anon) key. Never the secret key. */
  key: string;
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();
  if (!url || !key) return null;
  return { url, key };
}

export function requireSupabaseConfig(): SupabaseConfig {
  const config = getSupabaseConfig();
  if (!config) {
    throw new ConfigurationError(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return config;
}

/** True when the server can categorize with Anthropic. */
export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/** The sign-in allowlist, or null when anyone the Supabase project accepts may sign in. */
export function getAllowedEmails(): Set<string> | null {
  const raw = process.env.INDEX_ALLOWED_EMAILS?.trim();
  if (!raw) return null;
  const emails = raw
    .split(/[,\s]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return emails.length ? new Set(emails) : null;
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  const allowed = getAllowedEmails();
  if (!allowed) return true;
  return Boolean(email && allowed.has(email.trim().toLowerCase()));
}

/**
 * The public origin used in sign-in redirect URLs. NEXT_PUBLIC_SITE_URL wins;
 * otherwise the request's own origin (fine locally and on Vercel previews).
 */
export function getSiteUrl(requestOrigin?: string | null): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (requestOrigin) return requestOrigin.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}
