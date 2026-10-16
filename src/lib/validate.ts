/**
 * Input validation for server actions and route handlers. Every value that
 * crosses from the browser is `unknown` until one of these says otherwise.
 */
import type { ReadingStatus } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function isReadingStatus(value: unknown): value is ReadingStatus {
  return value === "unread" || value === "reading" || value === "finished";
}

/** Trims and collapses whitespace; strips control characters. */
export function normalizeSpace(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * For optional single-line fields in a patch: undefined when the field is
 * absent, null when it was cleared, otherwise the cleaned string (cut to
 * maxLength).
 */
export function optionalLine(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return undefined;
  const cleaned = normalizeSpace(value).slice(0, maxLength).trim();
  return cleaned || null;
}

/** Like optionalLine, but keeps line breaks (descriptions, notes). */
export function optionalText(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return undefined;
  const cleaned = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength)
    .trim();
  return cleaned || null;
}

/**
 * "YYYY-MM-DD" → ISO timestamp at midnight UTC; "" → null; anything else
 * (including impossible dates like 2024-02-30) → "invalid".
 */
export function parseDateInput(value: string): string | null | "invalid" {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return "invalid";
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "invalid";
  if (year < 1800 || year > 2200) return "invalid";
  return date.toISOString();
}

/**
 * A same-site path to send the user to after signing in. Anything that could
 * leave the site ("//evil.com", "/\\evil.com", "https://…") becomes the fallback.
 */
export function safeNextPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string") return fallback;
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F\\]/.test(path)) return fallback;
  if (path.startsWith("/auth/") || path.startsWith("/login")) return fallback;
  return path.slice(0, 1024);
}

/** Pragmatic email check: one @, a dotted domain, no spaces, sane length. */
export function isEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
