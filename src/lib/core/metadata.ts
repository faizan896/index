/**
 * Reading a fetched page: its title, description, author, publication, date,
 * canonical URL, language and reading time, plus a plain-text excerpt for the
 * classifier. Sources, best first: Open Graph and Twitter tags, Highwire
 * (citation_*, used by journals and arXiv), JSON-LD, Dublin Core,
 * Parse.ly/Sailthru tags, and finally the document itself.
 *
 * Everything returned is plain text that has been through cleanText. Nothing
 * here throws, whatever the input.
 */
import { elementRanges, scanHtml, visibleText, type ElementRange, type HtmlScan, type HtmlTag } from "@/lib/core/html/scan";
import { cleanText, countWords, type WordCount } from "@/lib/core/text";
import { MAX_URL_LENGTH, domainOf } from "@/lib/core/url";

export interface PageMetadata {
  title: string | null;
  description: string | null;
  author: string | null;
  siteName: string | null;
  /** ISO 8601. Date-only values are midnight UTC. */
  publishedAt: string | null;
  /** Absolute http(s), resolved against the page URL. */
  canonicalUrl: string | null;
  /** Lowercase BCP 47-style tag ("en-us"). */
  lang: string | null;
  /** og:type, lowercased ("article", "website"). */
  type: string | null;
  /** Words in the main content; each Chinese or Japanese character counts as one. */
  wordCount: number | null;
  readingMinutes: number | null;
  /** Plain text from the main content, at most 4,000 characters, for classification only. */
  excerpt: string | null;
  /** From article:tag, JSON-LD and meta keywords; cleaned, at most 12. */
  keywords: string[];
  /** The page is a bot challenge or access-denied interstitial, not the content. */
  blocked: boolean;
}

const MAX_TITLE = 300;
const MAX_DESCRIPTION = 600;
const MAX_AUTHOR = 200;
const MAX_SITE_NAME = 120;
const MAX_EXCERPT = 4000;
const MAX_KEYWORD = 60;
const MAX_KEYWORDS = 12;
const MAX_TYPE = 60;
const MAX_LANG = 35;
const MAX_LISTED_AUTHORS = 3;

const WORDS_PER_MINUTE = 230;
const CJK_CHARACTERS_PER_MINUTE = 500;
/** Below this the page is a teaser, a paywall or an app shell, and a reading time would be a guess. */
const MIN_READING_WORDS = 120;
/** Below this the page text says nothing worth classifying. */
const MIN_EXCERPT_WORDS = 20;
/** Interstitials are short; a page with this much text is the real thing whatever its title says. */
const MAX_INTERSTITIAL_WORDS = 200;

/** Bounds on repeated inputs, so a hostile page costs no more than an ordinary one. */
const MAX_VALUES_PER_KEY = 50;
const MAX_TIME_ELEMENTS = 20;
const MAX_KEYWORD_CANDIDATES = 200;

const ONE_YEAR_MS = 366 * 24 * 60 * 60 * 1000;
const EARLIEST_YEAR = 1900;

// ─── Meta tags ──────────────────────────────────────────────────────────────

/** Meta tag values by lowercased name, property or itemprop, in document order. */
type MetaIndex = Map<string, string[]>;

function indexMeta(tags: readonly HtmlTag[]): MetaIndex {
  const index: MetaIndex = new Map();
  const add = (key: string, value: string) => {
    const list = index.get(key);
    if (list) list.push(value);
    else index.set(key, [value]);
  };
  for (const tag of tags) {
    if (tag.name !== "meta") continue;
    const value = tag.attrs.content ?? tag.attrs.value;
    if (value === undefined) continue;
    const keys = new Set<string>();
    for (const property of (tag.attrs.property ?? "").toLowerCase().split(/\s+/)) if (property) keys.add(property);
    for (const attribute of ["name", "itemprop"]) {
      const key = tag.attrs[attribute]?.trim().toLowerCase();
      if (key) keys.add(key);
    }
    const httpEquiv = tag.attrs["http-equiv"]?.trim().toLowerCase();
    if (httpEquiv) keys.add(`http-equiv:${httpEquiv}`);
    for (const key of keys) add(key, value);
  }
  return index;
}

/** Values of the first tags with these keys, in key order. A page repeating a tag thousands of times gains nothing past the first few. */
function metaValues(meta: MetaIndex, keys: readonly string[]): string[] {
  return keys.flatMap((key) => (meta.get(key) ?? []).slice(0, MAX_VALUES_PER_KEY));
}

/** First tag in the list (by key order, then document order) whose cleaned value is not empty. */
function firstMeta(meta: MetaIndex, keys: readonly string[], maxLength?: number): string | null {
  for (const value of metaValues(meta, keys)) {
    const text = cleanText(value, maxLength);
    if (text) return text;
  }
  return null;
}

function firstTag(tags: readonly HtmlTag[], name: string, accept: (tag: HtmlTag) => boolean = () => true): HtmlTag | null {
  return tags.find((tag) => tag.name === name && accept(tag)) ?? null;
}

// ─── URLs ───────────────────────────────────────────────────────────────────

/** An absolute http(s) URL for `value`, resolved against `base`, or null. */
function absoluteHttpUrl(value: string | null | undefined, base: string): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    try {
      url = new URL(raw, base);
    } catch {
      return null;
    }
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) return null;
  const href = url.toString();
  return href.length <= MAX_URL_LENGTH ? href : null;
}

function hostnameOf(url: string): string {
  try {
    return domainOf(new URL(url).hostname);
  } catch {
    return "";
  }
}

// ─── Dates ──────────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** 2024 · 2024-03 · 2024-03-05 · 2024/3/5 · 2024.03.05 · 2024-03-05T10:20:30.123+01:00 · 2024-03-05 10:20 */
const NUMERIC_DATE =
  /^(\d{4})(?:[-/.](\d{1,2})(?:[-/.](\d{1,2}))?)?(?:(?:T|\s+)(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?\s*(Z|UTC|GMT|[+-]\d{2}(?::?\d{2})?)?$/i;
const COMPACT_DATE = /^(\d{4})(\d{2})(\d{2})$/;
const TIME_PART = /^(?:at\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\s*(Z|UTC|GMT|[+-]\d{2}:?\d{2})?/i;
/** "5 March 2024", "05 Mar 2024 10:20:30 GMT" */
const DAY_MONTH_YEAR = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?,?\s+(\d{4})(?:[,\s]+(.*))?$/i;
/** "March 5, 2024", "Mar 5 2024 10:20 AM" */
const MONTH_DAY_YEAR = /^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?:[,\s]+(.*))?$/i;
const WEEKDAY = /^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i;

function zoneOffsetMinutes(zone: string | undefined): number {
  if (!zone || /^(?:z|utc|gmt)$/i.test(zone)) return 0;
  const match = /^([+-])(\d{2}):?(\d{2})?$/.exec(zone);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return match[1] === "-" ? -minutes : minutes;
}

interface DateParts {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
  millisecond?: number;
  offset?: number;
}

/** Validates the parts and applies the publication-date sanity window. */
function toIso(parts: DateParts): string | null {
  const { year, month, day } = parts;
  const hour = parts.hour ?? 0;
  const minute = parts.minute ?? 0;
  const second = Math.min(parts.second ?? 0, 59);
  if (year < EARLIEST_YEAR || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59) return null;
  const midnight = Date.UTC(year, month - 1, day);
  if (new Date(midnight).getUTCDate() !== day) return null; // 2024-02-30
  const time = Date.UTC(year, month - 1, day, hour, minute, second, parts.millisecond ?? 0) - (parts.offset ?? 0) * 60_000;
  if (!Number.isFinite(time) || time > Date.now() + ONE_YEAR_MS) return null;
  return new Date(time).toISOString();
}

function monthNumber(name: string): number {
  return MONTHS[name.slice(0, 3).toLowerCase()] ?? 0;
}

function withTime(parts: DateParts, rest: string | undefined): DateParts {
  const match = rest ? TIME_PART.exec(rest.trim()) : null;
  if (!match) return parts;
  let hour = Number(match[1]);
  const meridiem = match[4]?.toLowerCase().replace(/\./g, "");
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return { ...parts, hour, minute: Number(match[2]), second: Number(match[3] ?? 0), offset: zoneOffsetMinutes(match[5]) };
}

/**
 * A publication date as ISO 8601, or null when the value isn't a plausible
 * one (before 1900, more than a year ahead, or not a real calendar date).
 * Times without a zone are taken as UTC so the result never depends on
 * where the server runs.
 */
function parseDate(value: string | null | undefined): string | null {
  const text = cleanText(value, 80);
  if (!text) return null;

  const numeric = NUMERIC_DATE.exec(text);
  if (numeric) {
    const fraction = numeric[7] ? Number(numeric[7].slice(0, 3).padEnd(3, "0")) : 0;
    return toIso({
      year: Number(numeric[1]),
      month: Number(numeric[2] ?? 1),
      day: Number(numeric[3] ?? 1),
      hour: Number(numeric[4] ?? 0),
      minute: Number(numeric[5] ?? 0),
      second: Number(numeric[6] ?? 0),
      millisecond: fraction,
      offset: zoneOffsetMinutes(numeric[8]),
    });
  }

  const compact = COMPACT_DATE.exec(text);
  if (compact) return toIso({ year: Number(compact[1]), month: Number(compact[2]), day: Number(compact[3]) });

  if (/^\d{10}(?:\d{3})?$/.test(text)) {
    const time = text.length === 10 ? Number(text) * 1000 : Number(text);
    const date = new Date(time);
    return toIso({
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds(),
      millisecond: date.getUTCMilliseconds(),
    });
  }

  const words = text.replace(WEEKDAY, "");
  const dayFirst = DAY_MONTH_YEAR.exec(words);
  if (dayFirst) {
    const month = monthNumber(dayFirst[2] ?? "");
    if (!month) return null;
    return toIso(withTime({ year: Number(dayFirst[3]), month, day: Number(dayFirst[1]) }, dayFirst[4]));
  }
  const monthFirst = MONTH_DAY_YEAR.exec(words);
  if (monthFirst) {
    const month = monthNumber(monthFirst[1] ?? "");
    if (!month) return null;
    return toIso(withTime({ year: Number(monthFirst[3]), month, day: Number(monthFirst[2]) }, monthFirst[4]));
  }
  return null;
}

// ─── JSON-LD ────────────────────────────────────────────────────────────────

type JsonObject = { [key: string]: unknown };

/** Article-like types, best first, then other Article subtypes, then web pages. */
const PRIMARY_TYPES = ["article", "newsarticle", "blogposting", "scholarlyarticle", "techarticle", "report"];
const OTHER_ARTICLE_TYPES = new Set([
  "analysisnewsarticle", "askpublicnewsarticle", "backgroundnewsarticle", "opinionnewsarticle", "reportagenewsarticle",
  "reviewnewsarticle", "liveblogposting", "socialmediaposting", "discussionforumposting", "medicalscholarlyarticle",
  "satiricalarticle", "advertisercontentarticle", "apireference",
]);
const PAGE_TYPES = new Set(["itempage", "aboutpage", "profilepage", "collectionpage", "qapage", "faqpage", "medicalwebpage"]);

const MAX_JSON_LD_NODES = 500;
const MAX_JSON_LD_DEPTH = 8;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonLd(block: string): unknown {
  // Some CMSs wrap the block in an HTML comment or CDATA markers.
  const text = block
    .trim()
    .replace(/^<!--/, "")
    .replace(/-->$/, "")
    .replace(/^\/\*\s*<!\[CDATA\[\s*\*\//, "")
    .replace(/\/\*\s*\]\]>\s*\*\/$/, "")
    .trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    // Raw line breaks and tabs inside strings are the usual reason a block is invalid.
    try {
      return JSON.parse(text.replace(/[\u0000-\u001f]+/g, " "));
    } catch {
      return undefined;
    }
  }
}

function collectNodes(value: unknown, nodes: JsonObject[], depth: number): void {
  if (depth > MAX_JSON_LD_DEPTH || nodes.length >= MAX_JSON_LD_NODES) return;
  if (Array.isArray(value)) {
    for (const item of value) collectNodes(item, nodes, depth + 1);
    return;
  }
  if (!isObject(value)) return;
  nodes.push(value);
  collectNodes(value["@graph"], nodes, depth + 1);
  collectNodes(value.mainEntity, nodes, depth + 1);
}

function typeRank(node: JsonObject): number {
  const raw = node["@type"];
  let best = Infinity;
  for (const type of Array.isArray(raw) ? raw : [raw]) {
    if (typeof type !== "string") continue;
    const name = type.trim().replace(/^.*[/#:]/, "").toLowerCase();
    const primary = PRIMARY_TYPES.indexOf(name);
    const rank =
      primary !== -1
        ? primary
        : OTHER_ARTICLE_TYPES.has(name)
          ? PRIMARY_TYPES.length
          : name === "webpage"
            ? PRIMARY_TYPES.length + 1
            : PAGE_TYPES.has(name)
              ? PRIMARY_TYPES.length + 2
              : Infinity;
    best = Math.min(best, rank);
  }
  return best;
}

/** A non-empty string value: a plain string, a {"@value": …} object, or the first item of an array of those. */
function jsonText(value: unknown): string | null {
  const item: unknown = Array.isArray(value) ? value[0] : value;
  const text = typeof item === "string" ? item : isObject(item) && typeof item["@value"] === "string" ? item["@value"] : null;
  return text?.trim() ? text : null;
}

interface JsonLdFacts {
  title: string | null;
  description: string | null;
  authors: string[];
  publisher: string | null;
  dates: string[];
  keywords: string[];
}

function readJsonLd(blocks: readonly string[]): JsonLdFacts {
  const nodes: JsonObject[] = [];
  for (const block of blocks) collectNodes(parseJsonLd(block), nodes, 0);

  const byId = new Map<string, JsonObject>();
  for (const node of nodes) {
    const id = node["@id"];
    if (typeof id === "string" && !byId.has(id)) byId.set(id, node);
  }
  /** Follows {"@id": …} references (Yoast's @graph style) to the full node. */
  const resolve = (value: unknown): unknown => {
    if (isObject(value) && typeof value["@id"] === "string" && !("name" in value)) return byId.get(value["@id"]) ?? value;
    return value;
  };
  const names = (value: unknown, depth = 0): string[] => {
    if (Array.isArray(value)) return depth < 2 ? value.slice(0, MAX_VALUES_PER_KEY).flatMap((item) => names(item, depth + 1)) : [];
    if (typeof value === "string") return [value];
    const node = resolve(value);
    if (!isObject(node)) return [];
    const name = jsonText(node.name);
    if (name) return [name];
    const given = jsonText(node.givenName);
    const family = jsonText(node.familyName);
    return given || family ? [[given, family].filter(Boolean).join(" ")] : [];
  };

  const ranked = nodes
    .map((node, order) => ({ node, order, rank: typeRank(node) }))
    .filter((entry) => entry.rank !== Infinity)
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map((entry) => entry.node);

  const first = <T>(read: (node: JsonObject) => T | null): T | null => {
    for (const node of ranked) {
      const value = read(node);
      if (value !== null) return value;
    }
    return null;
  };
  const nonEmpty = (list: string[]) => (list.length ? list : null);

  return {
    title: first((node) => jsonText(node.headline) ?? jsonText(node.name)),
    description: first((node) => jsonText(node.description)),
    authors: first((node) => nonEmpty(names(node.author))) ?? [],
    publisher: first((node) => names(node.publisher)[0] ?? null),
    dates: ranked.flatMap((node) => [jsonText(node.datePublished), jsonText(node.dateCreated)]).filter((date): date is string => !!date),
    keywords: first((node) => {
      const value = node.keywords;
      const list = Array.isArray(value) ? value.map(jsonText).filter((item): item is string => !!item) : [jsonText(value)].filter((item): item is string => !!item);
      return nonEmpty(list);
    }) ?? [],
  };
}

// ─── Authors ────────────────────────────────────────────────────────────────

/** Placeholder bylines CMSs fill in when nobody set one. */
const PLACEHOLDER_AUTHORS = new Set([
  "admin", "administrator", "root", "webmaster", "wpadmin", "user", "guest", "unknown", "null", "undefined", "none",
  "n/a", "na", "author", "default", "editor",
]);
const NAME_SUFFIX = /^(?:jr|sr|ii|iii|iv|phd|md|esq|et al)\.?$/i;

function isPlausibleAuthor(name: string): boolean {
  if (name.length < 2 || !/\p{L}/u.test(name)) return false;
  if (/:\/\/|^www\.|^\/\/|^[\w-]+(?:\.[\w-]+)+\/\S*$/i.test(name)) return false; // a URL
  if (/\S+@\S+\.\S+/.test(name)) return false; // an email address
  return !PLACEHOLDER_AUTHORS.has(name.toLowerCase());
}

/** "Vaswani, Ashish" → "Ashish Vaswani", the way citation_author and dc.creator often write names. */
function invertName(name: string): string {
  const parts = name.split(",");
  if (parts.length !== 2) return name;
  const family = (parts[0] ?? "").trim();
  const given = (parts[1] ?? "").trim();
  if (!family || !given || NAME_SUFFIX.test(given)) return name;
  if (family.split(/\s+/).length > 3 || given.split(/\s+/).length > 4) return name;
  return `${given} ${family}`;
}

/** One byline from a list of names: up to three, then "et al.". */
function formatAuthors(values: readonly string[], invert = false): string | null {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const value of values) {
    let name = cleanText(value, MAX_AUTHOR);
    if (!name) continue;
    name = name.replace(/^by\s+(?=\S)/i, "");
    if (invert) name = invertName(name);
    const key = name.toLowerCase();
    if (!isPlausibleAuthor(name) || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  if (!names.length) return null;
  const shown = names.slice(0, MAX_LISTED_AUTHORS).join(", ");
  return cleanText(names.length > MAX_LISTED_AUTHORS ? `${shown} et al.` : shown, MAX_AUTHOR);
}

// ─── Titles ─────────────────────────────────────────────────────────────────

/** " | ", " - ", " — ", " – ", " · ", " • ", " » ", " :: ", and bare "|" or "｜" (common in Japanese titles). */
const TITLE_SEPARATOR = /\s+(?:[-–—·•»~/]|::|--)\s+|\s*[|｜]\s*/g;

/** Lowercase letters and digits only, without a leading "The": what makes two spellings of a site name equal. */
function siteKey(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Keys a title's site suffix may match: the site name, the host ("nytimes.com") and its labels ("nytimes"). */
function siteKeys(siteName: string | null, host: string): Set<string> {
  const keys = new Set<string>();
  if (siteName) keys.add(siteKey(siteName));
  if (host) {
    keys.add(siteKey(host));
    const labels = host.split(".");
    for (const label of labels.slice(0, -1)) if (label.length >= 3) keys.add(siteKey(label));
  }
  keys.delete("");
  return keys;
}

/** Keys for each name in a byline ("Jane Doe, Kim Lee et al."), to recognise "by Jane Doe" in a title. */
function authorKeys(author: string | null): Set<string> {
  const keys = new Set<string>();
  if (!author) return keys;
  keys.add(siteKey(author));
  for (const name of author.replace(/\s+et al\.$/, "").split(/,\s*|\s+(?:and|&)\s+/)) keys.add(siteKey(name));
  keys.delete("");
  return keys;
}

/**
 * Removes the site name a page appends or prepends to its title
 * ("Title | Site", "Site - Title") and a trailing byline naming the author
 * ("Title | by Jane Doe"). Only segments matching the site, the domain or the
 * author go, so a title that merely contains a dash keeps it.
 */
function stripTitleAffixes(title: string, sites: ReadonlySet<string>, authors: ReadonlySet<string>): string {
  let result = title;
  for (let round = 0; round < 3; round++) {
    const separators = [...result.matchAll(TITLE_SEPARATOR)];
    const last = separators[separators.length - 1];
    const first = separators[0];
    if (!last || !first || last.index === undefined || first.index === undefined) break;
    const suffix = result.slice(last.index + last[0].length);
    const prefix = result.slice(0, first.index);
    const byline = /^by\s+(.+)$/i.exec(suffix);
    let next = result;
    if (sites.has(siteKey(suffix)) || (byline && authors.has(siteKey(byline[1] ?? "")))) next = result.slice(0, last.index);
    else if (sites.has(siteKey(prefix))) next = result.slice(first.index + first[0].length);
    if (next === result || !/[\p{L}\p{N}]/u.test(next)) break;
    result = next.trim();
  }
  return result;
}

// ─── Content ────────────────────────────────────────────────────────────────

interface Content {
  text: string;
  count: WordCount;
  /** The words a reader of the text would read at the Latin pace (CJK characters converted). */
  effectiveWords: number;
}

function measure(scan: HtmlScan, from: number, to: number): Content {
  const text = visibleText(scan, from, to);
  const count = countWords(text);
  return { text, count, effectiveWords: count.words + (count.cjk * WORDS_PER_MINUTE) / CJK_CHARACTERS_PER_MINUTE };
}

interface MeasuredElement {
  range: ElementRange;
  content: Content;
}

function measureAll(scan: HtmlScan, ranges: readonly ElementRange[]): MeasuredElement[] {
  return ranges.map((range) => ({ range, content: measure(scan, range.open + 1, range.close) }));
}

/** The element with the most text, the earliest on a tie. */
function largest(elements: readonly MeasuredElement[]): MeasuredElement | null {
  let best: MeasuredElement | null = null;
  for (const element of elements) {
    if (!best || element.content.effectiveWords > best.content.effectiveWords) best = element;
  }
  return best;
}

/**
 * The main content: the largest <article> when the page has one (if it is
 * short, the page is a teaser and that is the honest answer), otherwise
 * <main> when it holds a real text, otherwise <body>.
 */
function mainContent(scan: HtmlScan, articles: readonly MeasuredElement[]): Content {
  const article = largest(articles);
  if (article) return article.content;
  const main = largest(measureAll(scan, elementRanges(scan, "main")));
  if (main && main.content.effectiveWords >= MIN_READING_WORDS) return main.content;
  const body = elementRanges(scan, "body")[0];
  return body ? measure(scan, body.open + 1, body.close) : measure(scan, 0, scan.tokens.length);
}

/** The first <time datetime> inside an article, the largest article first. */
function articleTime(scan: HtmlScan, articles: readonly MeasuredElement[]): string | null {
  const bySize = [...articles].sort((a, b) => b.content.effectiveWords - a.content.effectiveWords);
  let tried = 0;
  for (const { range } of bySize) {
    for (let index = range.open + 1; index < range.close && tried < MAX_TIME_ELEMENTS; index++) {
      const token = scan.tokens[index];
      if (token?.type !== "open" || token.tag.name !== "time" || token.tag.attrs.datetime === undefined) continue;
      tried++;
      const date = parseDate(token.tag.attrs.datetime);
      if (date) return date;
    }
  }
  return null;
}

/** Cuts long text before cleaning so the excerpt costs the same on a 3 MB page as on a short one. */
function excerptOf(content: Content): string | null {
  if (content.effectiveWords < MIN_EXCERPT_WORDS) return null;
  const limit = MAX_EXCERPT + 400;
  let text = content.text;
  if (text.length > limit) {
    const code = text.charCodeAt(limit - 1);
    text = text.slice(0, code >= 0xd800 && code <= 0xdbff ? limit - 1 : limit);
  }
  return cleanText(text, MAX_EXCERPT);
}

// ─── Interstitials ──────────────────────────────────────────────────────────

const INTERSTITIAL_TITLES = [
  /^just a moment\b/i, // Cloudflare managed challenge
  /^attention required!? \| cloudflare$/i, // Cloudflare block page
  /^access denied\b/i, // Akamai, Cloudflare
  /^access to this page has been denied\b/i, // PerimeterX
  /^are you a (?:robot|human)\b/i,
  /^robot or human\b/i,
  /^robot check$/i,
  /^(?:please )?verify(?:ing)? (?:that )?you are (?:a )?human\b/i,
  /^human verification$/i,
  /^pardon our interruption\b/i, // Imperva / Distil
  /^checking your browser\b/i,
  /^one moment,? please\b/i,
  /^ddos-guard$/i,
  /^request rejected$/i, // F5
  /^security check(?:point)?$/i,
];

/**
 * Markup only challenge pages carry, searched in the raw HTML. Vendors'
 * ordinary page scripts (Cloudflare's jsd, DataDome's tag) are deliberately
 * not listed: they load on normal pages too.
 */
const INTERSTITIAL_MARKUP =
  /_cf_chl_opt|cf-browser-verification|\/cdn-cgi\/challenge-platform\/h\/|captcha-delivery\.com|px-captcha|incapsula incident id/i;

/**
 * What challenge pages say to the reader, searched in the visible text and
 * <noscript> only, so an app whose scripts merely contain such a string
 * (a sign-up form's translations) is not mistaken for one.
 */
const INTERSTITIAL_TEXT =
  /checking your browser before accessing|verifying you are human|verify you are (?:a )?human|enable javascript and cookies to continue|needs to review the security of your connection|please complete the security check|press (?:&amp;|&) hold to confirm|unusual traffic from your (?:computer )?network/i;

function isInterstitial(scan: HtmlScan, content: Content): boolean {
  if (content.effectiveWords >= MAX_INTERSTITIAL_WORDS) return false;
  const title = cleanText(scan.title, MAX_TITLE);
  if (title && INTERSTITIAL_TITLES.some((pattern) => pattern.test(title))) return true;
  if (INTERSTITIAL_MARKUP.test(scan.html)) return true;
  const noscript = scan.tokens.flatMap((token) => (token.type === "open" && token.tag.name === "noscript" && token.content ? [token.content] : []));
  return INTERSTITIAL_TEXT.test([visibleText(scan), ...noscript].join(" "));
}

// ─── Small fields ───────────────────────────────────────────────────────────

function normalizeLang(value: string | null | undefined): string | null {
  const text = cleanText(value, 100)?.split(/[,;\s]/)[0]?.replace(/_/g, "-").toLowerCase();
  if (!text || text.length > MAX_LANG || !/^[a-z]{2,3}(?:-[a-z0-9]{1,8})*$/.test(text)) return null;
  return text;
}

function collectKeywords(sources: readonly string[]): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];
  let candidates = 0;
  for (const source of sources) {
    for (const part of source.split(/[,;]/)) {
      if (++candidates > MAX_KEYWORD_CANDIDATES) return keywords;
      const keyword = cleanText(part);
      if (!keyword || keyword.length > MAX_KEYWORD || keyword.includes("://") || !/\p{L}/u.test(keyword)) continue;
      const key = keyword.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      keywords.push(keyword);
      if (keywords.length >= MAX_KEYWORDS) return keywords;
    }
  }
  return keywords;
}

function emptyMetadata(): PageMetadata {
  return {
    title: null,
    description: null,
    author: null,
    siteName: null,
    publishedAt: null,
    canonicalUrl: null,
    lang: null,
    type: null,
    wordCount: null,
    readingMinutes: null,
    excerpt: null,
    keywords: [],
    blocked: false,
  };
}

// ─── Extraction ─────────────────────────────────────────────────────────────

function extract(html: string, pageUrl: string): PageMetadata {
  const scan = scanHtml(html);
  const articles = measureAll(scan, elementRanges(scan, "article"));
  const content = mainContent(scan, articles);
  if (isInterstitial(scan, content)) return { ...emptyMetadata(), blocked: true };

  const meta = indexMeta(scan.tags);
  const ld = readJsonLd(scan.jsonLd);
  const host = hostnameOf(pageUrl);

  const siteName =
    firstMeta(meta, ["og:site_name", "application-name"], MAX_SITE_NAME) ??
    cleanText(ld.publisher, MAX_SITE_NAME) ??
    firstMeta(meta, ["citation_journal_title", "citation_conference_title"], MAX_SITE_NAME);

  const author =
    formatAuthors(metaValues(meta, ["citation_author"]), true) ??
    formatAuthors(metaValues(meta, ["citation_authors"]).flatMap((value) => value.split(";")), true) ??
    formatAuthors(ld.authors) ??
    formatAuthors(metaValues(meta, ["author"])) ??
    formatAuthors(metaValues(meta, ["article:author"])) ??
    formatAuthors(metaValues(meta, ["dc.creator", "dcterms.creator"]), true) ??
    formatAuthors(metaValues(meta, ["parsely-author", "sailthru.author", "byl"]));

  const sites = siteKeys(siteName, host);
  const authors = authorKeys(author);
  const titleSources = [
    ...metaValues(meta, ["og:title", "twitter:title", "citation_title"]),
    ...(ld.title ? [ld.title] : []),
    ...metaValues(meta, ["dc.title", "dcterms.title"]),
    ...(scan.title !== null ? [scan.title] : []),
  ];
  let title: string | null = null;
  for (const source of titleSources) {
    const cleaned = cleanText(source);
    title = cleaned ? cleanText(stripTitleAffixes(cleaned, sites, authors), MAX_TITLE) : null;
    if (title) break;
  }

  const description =
    firstMeta(meta, ["og:description", "twitter:description", "description"], MAX_DESCRIPTION) ??
    cleanText(ld.description, MAX_DESCRIPTION) ??
    firstMeta(meta, ["dc.description", "dcterms.description", "dcterms.abstract", "citation_abstract"], MAX_DESCRIPTION);

  const dateSources = [
    ...metaValues(meta, ["article:published_time", "og:article:published_time", "article:published"]),
    ...metaValues(meta, ["citation_publication_date", "citation_date", "citation_online_date"]),
    ...ld.dates,
    ...metaValues(meta, ["dc.date", "dc.date.issued", "dcterms.date", "dcterms.created", "dcterms.issued"]),
    ...metaValues(meta, ["parsely-pub-date", "sailthru.date", "pubdate", "publishdate", "publish-date", "publish_date", "date", "datepublished"]),
  ];
  let publishedAt: string | null = null;
  for (const source of dateSources) {
    publishedAt = parseDate(source);
    if (publishedAt) break;
  }
  publishedAt ??= articleTime(scan, articles);

  const baseTag = firstTag(scan.tags, "base", (tag) => !!tag.attrs.href);
  const base = absoluteHttpUrl(baseTag?.attrs.href, pageUrl) ?? pageUrl;
  const canonicalTag = firstTag(
    scan.tags,
    "link",
    (tag) => !!tag.attrs.href?.trim() && (tag.attrs.rel ?? "").toLowerCase().split(/\s+/).includes("canonical"),
  );
  const canonicalUrl =
    absoluteHttpUrl(canonicalTag?.attrs.href, base) ??
    metaValues(meta, ["og:url"]).map((value) => absoluteHttpUrl(value, base)).find((url) => url !== null) ??
    null;

  const htmlTag = firstTag(scan.tags, "html");
  const lang =
    [htmlTag?.attrs.lang, htmlTag?.attrs["xml:lang"], ...metaValues(meta, ["og:locale", "http-equiv:content-language", "dc.language", "citation_language"])]
      .map(normalizeLang)
      .find((value) => value !== null) ?? null;

  const minutes = content.count.words / WORDS_PER_MINUTE + content.count.cjk / CJK_CHARACTERS_PER_MINUTE;
  const readable = content.effectiveWords >= MIN_READING_WORDS;

  return {
    title,
    description,
    author,
    siteName,
    publishedAt,
    canonicalUrl,
    lang,
    type: firstMeta(meta, ["og:type"], MAX_TYPE)?.toLowerCase() ?? null,
    wordCount: readable ? content.count.words + content.count.cjk : null,
    readingMinutes: readable ? Math.max(1, Math.round(minutes)) : null,
    excerpt: excerptOf(content),
    keywords: collectKeywords([
      ...metaValues(meta, ["article:tag"]),
      ...ld.keywords,
      ...metaValues(meta, ["news_keywords", "keywords", "citation_keywords", "dc.subject"]),
    ]),
    blocked: false,
  };
}

/**
 * Reads everything Index shows about a page from its HTML. `pageUrl` is the
 * address the HTML came from (after redirects); relative URLs resolve
 * against it. Never throws: unreadable input gives empty metadata.
 */
export function extractMetadata(html: string, pageUrl: string): PageMetadata {
  try {
    return extract(typeof html === "string" ? html : "", typeof pageUrl === "string" ? pageUrl : "");
  } catch {
    return emptyMetadata();
  }
}

// ─── Files without HTML ─────────────────────────────────────────────────────

/** Data, code and feed formats, whose file names are machine names, never titles. Office documents and SVG images are not among them. */
const MACHINE_TYPES = /^(?:application|text)\/(?:[\w.-]*\+)?(?:json|javascript|ecmascript|css|xml|wasm)$|^font\//i;

/** Path segments that name an action or a folder rather than a document. */
const GENERIC_SEGMENTS = new Set([
  "download", "downloads", "file", "files", "view", "viewer", "pdf", "pdfs", "index", "document", "documents", "doc",
  "attachment", "attachments", "get", "open", "content", "fulltext", "full", "render", "export", "raw", "blob",
  "show", "print", "preview", "item", "items", "media", "asset", "assets", "static", "upload", "uploads", "default",
  "main", "home", "page", "paper", "papers", "article", "articles", "epdf", "abs",
]);

const ARXIV_ID = /^\d{4}\.\d{4,5}(?:v\d+)?$/;
/** A file extension: one to five characters, at least one of them a letter (so "2401.01234" keeps its digits). */
const EXTENSION = /\.(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]{1,5}$/;

function isMeaningfulWord(word: string): boolean {
  if ((word.match(/\p{L}/gu) ?? []).length < 3) return false;
  if (GENERIC_SEGMENTS.has(word.toLowerCase())) return false;
  return !(/\d/.test(word) && /^[0-9a-f]{8,}$/i.test(word)); // hashes and ids
}

function titleFromPath(pathname: string): string | null {
  const segment = pathname.split("/").filter(Boolean).pop();
  if (!segment) return null;
  let name: string;
  try {
    name = decodeURIComponent(segment);
  } catch {
    return null; // malformed escapes: nothing readable to offer
  }
  name = name.replace(EXTENSION, "").trim();
  if (ARXIV_ID.test(name)) return name;
  const words = name.split(/[\s_\-+.,]+/).filter(Boolean);
  if (!words.some(isMeaningfulWord)) return null;
  // Lowercase words are capitalized; anything already cased ("iOS", "GPT") is the author's choice.
  const title = words.map((word) => (/\p{Lu}/u.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1))).join(" ");
  return cleanText(title, MAX_TITLE);
}

/**
 * What can honestly be said about a non-HTML resource (a PDF, an image)
 * from its URL alone: a readable title from the file name
 * ("attention-is-all-you-need.pdf" → "Attention Is All You Need"; arXiv
 * ids stay as they are). Nothing else is guessed. Never throws.
 */
export function metadataFromUrl(url: string, contentType: string | null): Partial<PageMetadata> {
  try {
    const mime = (contentType ?? "").split(";")[0]?.trim() ?? "";
    if (MACHINE_TYPES.test(mime)) return {};
    const title = titleFromPath(new URL(url).pathname);
    return title ? { title } : {};
  } catch {
    return {};
  }
}
