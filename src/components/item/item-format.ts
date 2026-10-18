/**
 * Pure helpers for the item detail page: what the header's meta line says,
 * how addresses are shown, and how a related read explains itself.
 */
import { displaySource, formatDate, formatReadingTime } from "@/lib/format";
import type { LinkListItem, ProcessingStatus, RelatedLink } from "@/lib/types";

/** What the background work is doing right now. */
export type ProcessingPhase = "fetching" | "sorting" | "idle";

function isActive(status: ProcessingStatus): boolean {
  return status === "pending" || status === "processing";
}

export function processingPhase(item: Pick<LinkListItem, "metadataStatus" | "classificationStatus">): ProcessingPhase {
  if (isActive(item.metadataStatus)) return "fetching";
  if (isActive(item.classificationStatus)) return "sorting";
  return "idle";
}

/**
 * The header's meta line, in order: author · source · "Published 12 Jan 2025" ·
 * "8 min read". Parts the link doesn't have are left out; an author that is
 * just the site's name again is not repeated.
 */
export function itemMetaParts(
  link: Pick<LinkListItem, "author" | "siteName" | "domain" | "publishedAt" | "readingMinutes">,
): string[] {
  const parts: string[] = [];
  const source = displaySource(link);
  const author = link.author?.trim();
  if (author && author.toLowerCase() !== source.toLowerCase()) parts.push(author);
  parts.push(source);
  const published = formatDate(link.publishedAt);
  if (published) parts.push(`Published ${published}`);
  const reading = formatReadingTime(link.readingMinutes);
  if (reading) parts.push(`${reading} read`);
  return parts;
}

/** Ends a message with a full stop unless it already has closing punctuation. */
export function asSentence(text: string | null | undefined): string {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return "";
  return /[.!?…]["”’)]?$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** Shortens text by cutting out its middle: "example.com/2024/a-long…/final-part". */
export function truncateMiddle(value: string, max: number): string {
  const chars = [...value];
  if (chars.length <= max) return value;
  if (max < 2) return "…";
  const keep = max - 1;
  const head = Math.ceil(keep * 0.6);
  const tail = keep - head;
  return `${chars.slice(0, head).join("")}…${tail > 0 ? chars.slice(-tail).join("") : ""}`;
}

/** An address the way people read it: no scheme, no trailing slash. */
export function displayUrl(url: string): string {
  return url.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

/** The URL itself when it is a web address (never `javascript:` and friends), else null. */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

/** Whether two URLs name the same address (ignoring scheme/host case and a trailing slash). */
export function isSameAddress(a: string, b: string): boolean {
  const key = (value: string) => {
    try {
      return new URL(value).href.replace(/\/$/, "");
    } catch {
      return value.trim().replace(/\/$/, "");
    }
  };
  return key(a) === key(b);
}

/** "English" for "en", "Brazilian Portuguese" for "pt-BR"; the code itself when it isn't recognised. */
export function languageName(code: string | null | undefined): string {
  const tag = code?.trim();
  if (!tag) return "";
  try {
    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(tag);
    return name || tag;
  } catch {
    return tag;
  }
}

/** Up to `max` names two items share, categories first, then tags; duplicates dropped. */
export function sharedNames(link: Pick<RelatedLink, "sharedCategories" | "sharedTags">, max = 3): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of [...link.sharedCategories, ...link.sharedTags]) {
    if (names.length >= max) break;
    const name = raw.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

/** "Payments, Stablecoins" (commas or line breaks) → ["Payments", "Stablecoins"]. */
export function splitNames(input: string): string[] {
  return input
    .split(/[,\n]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

/** Orders names the way the database lists them (alphabetically, ignoring case). */
export function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
}
