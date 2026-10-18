/**
 * Pure helpers for the item detail page: what the header's meta line says,
 * what the Details list holds, how addresses are shown, and how a related
 * read explains itself.
 */
import { displaySource, formatDate, formatReadingTime } from "@/lib/format";
import type { LinkDetail, LinkListItem, ProcessingStatus, RelatedLink } from "@/lib/types";

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

/** How many characters of an address the Details list shows before cutting out the middle. */
const ADDRESS_LENGTH = 60;

/** One line of the Details list. */
export type ItemFact =
  | { kind: "text"; label: string; text: string }
  | { kind: "date"; label: string; text: string; dateTime: string }
  /** `text` is shortened for display; `full` is the whole address; `href` is null unless it is a web address. */
  | { kind: "address"; label: string; text: string; full: string; href: string | null };

export type ItemFactsLink = Pick<
  LinkDetail,
  "url" | "canonicalUrl" | "resolvedUrl" | "createdAt" | "status" | "statusChangedAt" | "finishedAt" | "lang" | "wordCount"
>;

function dateFact(label: string, value: string | null): ItemFact[] {
  const text = formatDate(value);
  return value && text ? [{ kind: "date", label, text, dateTime: value }] : [];
}

function addressFact(label: string, url: string): ItemFact {
  return { kind: "address", label, text: truncateMiddle(displayUrl(url), ADDRESS_LENGTH), full: url, href: safeHref(url) };
}

/**
 * The Details list, in order: when it was saved, when its status last
 * changed (or when it was finished), its addresses (the canonical and
 * resolved ones only when they differ from what was saved), language and
 * length. Facts the link doesn't have are left out.
 */
export function itemFacts(link: ItemFactsLink): ItemFact[] {
  const facts: ItemFact[] = [...dateFact("Saved", link.createdAt)];

  if (link.status === "finished") facts.push(...dateFact("Finished", link.finishedAt ?? link.statusChangedAt));
  else if (link.status === "reading") facts.push(...dateFact("Started reading", link.statusChangedAt));
  else facts.push(...dateFact("Status changed", link.statusChangedAt));

  facts.push(addressFact("Original URL", link.url));
  const canonical = link.canonicalUrl?.trim();
  if (canonical && !isSameAddress(canonical, link.url)) facts.push(addressFact("Canonical URL", canonical));
  const resolved = link.resolvedUrl?.trim();
  if (resolved && !isSameAddress(resolved, link.url) && !(canonical && isSameAddress(resolved, canonical))) {
    facts.push(addressFact("Resolved URL", resolved));
  }

  const language = languageName(link.lang);
  if (language) facts.push({ kind: "text", label: "Language", text: language });
  if (link.wordCount && link.wordCount > 0) {
    facts.push({ kind: "text", label: "Word count", text: Math.round(link.wordCount).toLocaleString("en-US") });
  }
  return facts;
}
