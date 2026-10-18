/**
 * Bookmark import: reading the CSV files that read-later services, browser
 * bookmark converters and Index itself export into links ready for the
 * import_links() database function.
 *
 * Nothing here trusts the file. Columns are recognised by their header
 * (Pocket, Raindrop.io, Instapaper, Omnivore, Readwise, Index), every cell is
 * cleaned and bounded to what the database accepts, and whatever can't be
 * understood is counted, never thrown.
 */
import { parseCsv } from "@/lib/core/csv";
import { cleanText } from "@/lib/core/text";
import { normalizeUrl, parseUserUrl } from "@/lib/core/url";
import { READING_STATUSES, type ReadingStatus } from "@/lib/types";

/** Rows read from one file; the rest are reported as skipped. */
export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

// Bounds from the database schema (saved_links, notes, categories, tags).
const MAX_TITLE_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_NOTE_LENGTH = 20000;
const MAX_TERM_LENGTH = 60;
const MAX_CATEGORIES = 10;
const MAX_TAGS = 20;

/** One link read from the file, ready for import_links(). */
export interface ImportCandidate {
  url: string;
  normalizedUrl: string;
  domain: string;
  title: string | null;
  description: string | null;
  /** Null leaves the default (unread). */
  status: ReadingStatus | null;
  isFavorite: boolean;
  /** ISO timestamp of when it was originally saved; null for "now". */
  createdAt: string | null;
  note: string | null;
  categories: string[];
  tags: string[];
}

export interface ImportParseResult {
  candidates: ImportCandidate[];
  /** Rows with no usable URL. */
  invalid: number;
  /** Rows whose normalized URL appeared earlier in the file. */
  duplicatesInFile: number;
  /** Rows beyond maxRows, not read. */
  skipped: number;
  /** Canonical names of the columns found, in a fixed order ("url", "title", "tags", …). */
  recognizedColumns: string[];
}

/** What a recognised column holds. */
export type ImportColumn =
  | "url"
  | "title"
  | "description"
  | "note"
  | "tags"
  | "categories"
  | "status"
  | "favorite"
  | "date";

const COLUMN_ORDER: readonly ImportColumn[] = [
  "url",
  "title",
  "description",
  "note",
  "tags",
  "categories",
  "status",
  "favorite",
  "date",
];

/** How a column's cells are read. */
type Reader = "url" | "text" | "note" | "list" | "folder" | "status" | "read" | "archived" | "flag" | "date";

/**
 * Header spellings, compared lowercase with everything but letters and
 * digits removed ("Time Added", "time_added" → "timeadded"). Within a column,
 * earlier spellings win when a file has several.
 */
const HEADER_ALIASES: ReadonlyArray<{ column: ImportColumn; reader: Reader; names: readonly string[] }> = [
  {
    column: "url",
    reader: "url",
    names: ["url", "link", "href", "uri", "address", "pageurl", "articleurl", "originalurl", "bookmarkurl", "website"],
  },
  { column: "title", reader: "text", names: ["title", "name", "pagetitle", "articletitle", "bookmarktitle", "headline"] },
  { column: "description", reader: "text", names: ["description", "excerpt", "summary", "selection", "desc", "abstract"] },
  {
    column: "note",
    reader: "note",
    names: ["note", "notes", "comment", "comments", "annotation", "annotations", "highlights", "highlight"],
  },
  { column: "tags", reader: "list", names: ["tags", "tag", "labels", "label", "keywords", "keyword", "documenttags", "hashtags"] },
  { column: "categories", reader: "list", names: ["categories", "category"] },
  { column: "categories", reader: "folder", names: ["folder", "folders", "collection", "folderpath", "parentfolder"] },
  { column: "status", reader: "status", names: ["status", "state", "readingstatus", "readstatus", "location"] },
  { column: "status", reader: "read", names: ["read", "isread", "hasread"] },
  { column: "status", reader: "archived", names: ["archived", "isarchived"] },
  {
    column: "favorite",
    reader: "flag",
    names: [
      "favorite", "favourite", "isfavorite", "isfavourite", "starred", "isstarred", "star", "liked", "fav", "faved",
      "favorited", "favourited",
    ],
  },
  {
    column: "date",
    reader: "date",
    names: [
      "savedat", "saved", "saveddate", "savedon", "datesaved", "timesaved", "created", "createdat", "createdon",
      "creationdate", "timeadded", "dateadded", "added", "addedat", "addedon", "adddate", "bookmarked", "bookmarkedat",
      "timestamp", "date",
    ],
  },
];

interface HeaderRule {
  column: ImportColumn;
  reader: Reader;
  rank: number;
}

const HEADER_RULES = new Map<string, HeaderRule>();
for (const { column, reader, names } of HEADER_ALIASES) {
  for (const name of names) HEADER_RULES.set(name, { column, reader, rank: HEADER_RULES.size });
}

interface Source {
  index: number;
  reader: Reader;
}

type Layout = Partial<Record<ImportColumn, Source[]>>;

function headerKey(cell: string): string {
  return cell.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function layoutFromHeader(header: readonly string[]): Layout {
  const found: Array<Source & { column: ImportColumn; rank: number }> = [];
  header.forEach((cell, index) => {
    const rule = HEADER_RULES.get(headerKey(cell));
    if (rule) found.push({ index, reader: rule.reader, column: rule.column, rank: rule.rank });
  });
  found.sort((a, b) => a.rank - b.rank || a.index - b.index);

  const layout: Layout = {};
  for (const { column, index, reader } of found) (layout[column] ??= []).push({ index, reader });
  return layout;
}

/** A cell that is nothing but a link: what a URL column looks like without a header. */
function looksLikeUrl(cell: string): boolean {
  const text = cell.trim();
  return text !== "" && !/\s/.test(text) && parseUserUrl(text).ok;
}

/** The column holding links in a data row, preferring full http(s) URLs over bare domains; -1 if none. */
function urlColumnOf(row: readonly string[]): number {
  const explicit = row.findIndex((cell) => /^\s*(?:https?:\/\/|www\.)/i.test(cell) && looksLikeUrl(cell));
  return explicit !== -1 ? explicit : row.findIndex(looksLikeUrl);
}

/**
 * Where the data starts and which column is which, from the first two
 * (non-blank) rows. A first row containing a link is data (headerless file);
 * otherwise it's the header, and if no header names the URL column, the
 * second row's links point to it.
 */
function detectLayout(rows: readonly string[][]): { layout: Layout; dataStart: number } {
  const first = rows[0] ?? [];
  const headerless = urlColumnOf(first);
  if (headerless !== -1) return { layout: { url: [{ index: headerless, reader: "url" }] }, dataStart: 0 };

  const layout = layoutFromHeader(first);
  const recognized = Object.keys(layout).length > 0;
  if (!layout.url) {
    const second = rows[1];
    const index = second ? urlColumnOf(second) : -1;
    if (index !== -1) layout.url = [{ index, reader: "url" }];
    else if (!recognized) return { layout, dataStart: 0 };
  }
  return { layout, dataStart: 1 };
}

function isBlankRow(row: readonly string[]): boolean {
  return row.every((cell) => cell.trim() === "");
}

/** Undoes the apostrophe CSV writers (Index's own included) put before text that starts like a formula. */
function unguard(value: string): string {
  return /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
}

function cellAt(row: readonly string[], index: number): string {
  return unguard(row[index] ?? "");
}

// ─── Values ─────────────────────────────────────────────────────────────────

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "x", "on", "checked", "✓", "✔"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "off", "unchecked"]);

function truthy(value: string): boolean | null {
  const key = value.trim().toLowerCase();
  if (TRUE_VALUES.has(key)) return true;
  if (FALSE_VALUES.has(key)) return false;
  return null;
}

/** Reading states as services name them; Readwise's locations and Pocket's "archive" included. */
const STATUS_SYNONYMS: Record<ReadingStatus, readonly string[]> = {
  unread: [
    "unread", "new", "later", "read later", "to read", "toread", "want to read", "queue", "queued", "inbox", "saved",
    "shortlist", "not started", "unstarted",
  ],
  reading: ["reading", "in progress", "inprogress", "started", "current", "currently reading", "now reading", "ongoing"],
  finished: ["read", "archive", "archived", "finished", "done", "complete", "completed"],
};

const STATUS_WORDS = new Map<string, ReadingStatus>();
for (const status of READING_STATUSES) {
  for (const word of STATUS_SYNONYMS[status]) STATUS_WORDS.set(word, status);
}

function statusWord(value: string): ReadingStatus | null {
  return STATUS_WORDS.get(value.trim().toLowerCase().replace(/[\s_-]+/g, " ")) ?? null;
}

function readStatus(value: string, reader: Reader): ReadingStatus | null {
  if (reader === "read" || reader === "archived") {
    const flag = truthy(value);
    if (flag === true) return "finished";
    if (flag === false) return reader === "read" ? "unread" : null;
  }
  return statusWord(value);
}

/** Folder names that are a reading state or a star rather than a subject (Instapaper, Raindrop, read-later folders). */
const FOLDER_STATUS = new Map<string, ReadingStatus>([
  ["unread", "unread"],
  ["read later", "unread"],
  ["to read", "unread"],
  ["archive", "finished"],
  ["archived", "finished"],
  ["read", "finished"],
  ["finished", "finished"],
]);
const FOLDER_FAVORITE = new Set(["starred", "favorites", "favourites", "liked"]);
const FOLDER_IGNORED = new Set(["unsorted", "uncategorized", "uncategorised", "inbox", "none"]);
/** Top-level folders browsers put every bookmark in. */
const BROWSER_ROOTS = new Set([
  "bookmarks",
  "bookmarks bar",
  "bookmarks toolbar",
  "bookmarks menu",
  "other bookmarks",
  "mobile bookmarks",
  "favorites bar",
  "favourites bar",
]);

interface Folder {
  name: string | null;
  status: ReadingStatus | null;
  favorite: boolean;
}

function readFolder(value: string): Folder {
  let name = value.trim();
  // "Bookmarks Bar/Design/Type" from a browser export → "Type".
  const segments = name.split(/\s*[/>\\]\s*/).filter(Boolean);
  if (segments.length > 0 && BROWSER_ROOTS.has((segments[0] ?? "").toLowerCase())) {
    name = segments.length > 1 ? (segments[segments.length - 1] ?? "") : "";
  }
  const key = name.toLowerCase().replace(/\s+/g, " ");
  const status = FOLDER_STATUS.get(key) ?? null;
  const favorite = FOLDER_FAVORITE.has(key);
  const isState = status !== null || favorite || FOLDER_IGNORED.has(key);
  return { name: isState || !name ? null : name, status, favorite };
}

/** "a, b; c|d", Pocket's "a|b" and Readwise's "['a', 'b']" alike. */
function splitList(value: string): string[] {
  let text = value.trim();
  if (text.startsWith("[") && text.endsWith("]")) text = text.slice(1, -1);
  return text.split(/[,;|]/);
}

const INVISIBLE = /[\u0000-\u0008\u000e-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g;
const SURROUNDING_QUOTES = /^["'“”‘’`]+|["'“”‘’`]+$/g;

function cleanTerm(raw: string, isTag: boolean): string | null {
  let name = raw.normalize("NFC").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
  name = name.replace(SURROUNDING_QUOTES, "").trim();
  // "#design" is the tag "design"; its slug would otherwise read "sharp-design".
  if (isTag) name = name.replace(/^#+/, "").trim();
  if (!name || [...name].length > MAX_TERM_LENGTH || !/[\p{L}\p{N}]/u.test(name)) return null;
  return name;
}

/** Cleaned, de-duplicated (ignoring case) and capped names. */
function collectTerms(raw: readonly string[], max: number, isTag: boolean): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const value of raw) {
    const name = cleanTerm(value, isTag);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length >= max) break;
  }
  return names;
}

const NOTE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufeff]/g;

/** Keeps the note's own line breaks; only trims and bounds it. */
function cleanNote(raw: string): string | null {
  let note = raw.toWellFormed().replace(/\r\n?/g, "\n").replace(NOTE_CONTROL, "").replace(/\n{3,}/g, "\n\n").trim();
  if (note.length > MAX_NOTE_LENGTH) {
    const code = note.charCodeAt(MAX_NOTE_LENGTH - 1);
    note = note.slice(0, code >= 0xd800 && code <= 0xdbff ? MAX_NOTE_LENGTH - 1 : MAX_NOTE_LENGTH).trimEnd();
  }
  return note || null;
}

// ─── Dates ──────────────────────────────────────────────────────────────────

/** Nothing was bookmarked before the web; earlier values are placeholders (0, 1970-01-01). */
const EARLIEST_DATE = Date.UTC(1990, 0, 1);
/** Room for clocks and time zones ahead of the server's. */
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

const ISO_DATE =
  /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:(?:T|\s+)(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?\s*(Z|UTC|GMT|[+-]\d{2}(?::?\d{2})?)?$/i;
const DAY_MONTH_YEAR =
  /^(\d{1,2})([/.-])(\d{1,2})\2(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])\.?m?\.?)?$/i;
const MONTH_NAME = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i;
const EPOCH = /^\d+(?:\.\d+)?$/;

function utcTime(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, ms = 0): number | null {
  // Years before 1000 are typos or placeholders (and Date.UTC would read 0-99 as 19xx).
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 60) {
    return null;
  }
  const time = Date.UTC(year, month - 1, day, hour, minute, Math.min(second, 59), ms);
  // Rejects dates that roll over, like 31 February.
  return new Date(time).getUTCDate() === day ? time : null;
}

/** Minutes east of UTC for "Z", "+02:00", "-0530" or "+05"; null when out of range. */
function offsetMinutes(zone: string | undefined): number | null {
  if (!zone || /^(?:z|utc|gmt)$/i.test(zone)) return 0;
  const match = /^([+-])(\d{2}):?(\d{2})?$/.exec(zone);
  if (!match) return null;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");
  if (hours > 14 || minutes > 59) return null;
  return (match[1] === "-" ? -1 : 1) * (hours * 60 + minutes);
}

function parseTime(text: string): number | null {
  if (EPOCH.test(text)) {
    const value = Number(text);
    // Ten digits are seconds (until 2286); twelve or more are milliseconds.
    return value >= 1e11 ? value : value * 1000;
  }

  const iso = ISO_DATE.exec(text);
  if (iso) {
    const [, year, month, day, hour, minute, second, fraction, zone] = iso;
    const offset = offsetMinutes(zone);
    const time = utcTime(
      Number(year),
      Number(month),
      Number(day),
      Number(hour ?? "0"),
      Number(minute ?? "0"),
      Number(second ?? "0"),
      Number((fraction ?? "").slice(0, 3).padEnd(3, "0")),
    );
    return time === null || offset === null ? null : time - offset * 60_000;
  }

  const numeric = DAY_MONTH_YEAR.exec(text);
  if (numeric) {
    const [, first, separator, second, year, hour, minute, seconds, meridiem] = numeric;
    const a = Number(first);
    const b = Number(second);
    // 16.10.2026 is day-first; 10/16/2026 is month-first unless the first number can't be a month.
    const dayFirst = separator === "." || a > 12;
    let hours = Number(hour ?? "0");
    if (meridiem) {
      if (hours < 1 || hours > 12) return null;
      hours = (hours % 12) + (meridiem.toLowerCase() === "p" ? 12 : 0);
    }
    return utcTime(Number(year), dayFirst ? b : a, dayFirst ? a : b, hours, Number(minute ?? "0"), Number(seconds ?? "0"));
  }

  // "Tue, 05 Mar 2024 10:00:00 GMT", "March 5, 2024". The year must be there:
  // V8 fills in 2001 for "March 5".
  if (MONTH_NAME.test(text) && /\b\d{4}\b/.test(text)) {
    const time = Date.parse(text);
    return Number.isFinite(time) ? time : null;
  }
  return null;
}

/**
 * When a link was saved, as an ISO timestamp. Reads ISO 8601 (with or
 * without time and offset; no offset means UTC), "YYYY-MM-DD", unix seconds
 * or milliseconds, day/month/year forms and written-out dates. Returns null
 * for anything unreadable, before 1990, or more than a day after `now`.
 */
export function parseImportDate(value: string, now: number = Date.now()): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  const time = parseTime(text);
  if (time === null || !Number.isFinite(time) || time < EARLIEST_DATE || time > now + FUTURE_TOLERANCE_MS) return null;
  return new Date(time).toISOString();
}

// ─── Rows ───────────────────────────────────────────────────────────────────

function readRow(row: readonly string[], layout: Layout, now: number): ImportCandidate | null {
  let link: { url: string; normalized: string; domain: string } | null = null;
  let rawUrl = "";
  for (const { index } of layout.url ?? []) {
    rawUrl = cellAt(row, index).trim();
    const parsed = rawUrl ? parseUserUrl(rawUrl) : null;
    if (parsed?.ok) {
      link = parsed;
      break;
    }
  }
  if (!link) return null;

  let title: string | null = null;
  for (const { index } of layout.title ?? []) {
    title = cleanText(cellAt(row, index), MAX_TITLE_LENGTH);
    if (title) break;
  }
  // Pocket and others repeat the URL as the title when the page had none.
  if (title && (title === rawUrl || title === link.url || normalizeUrl(title) === link.normalized)) title = null;

  let description: string | null = null;
  for (const { index } of layout.description ?? []) {
    description = cleanText(cellAt(row, index), MAX_DESCRIPTION_LENGTH);
    if (description) break;
  }

  const notes: string[] = [];
  for (const { index } of layout.note ?? []) {
    const note = cleanNote(cellAt(row, index));
    if (note && !notes.includes(note)) notes.push(note);
  }

  const tagNames: string[] = [];
  for (const { index } of layout.tags ?? []) tagNames.push(...splitList(cellAt(row, index)));

  const categoryNames: string[] = [];
  let folderStatus: ReadingStatus | null = null;
  let folderFavorite = false;
  for (const { index, reader } of layout.categories ?? []) {
    const value = cellAt(row, index);
    if (reader !== "folder") {
      categoryNames.push(...splitList(value));
      continue;
    }
    if (!value.trim()) continue;
    const folder = readFolder(value);
    if (folder.name) categoryNames.push(folder.name);
    folderStatus ??= folder.status;
    folderFavorite ||= folder.favorite;
  }

  let status: ReadingStatus | null = null;
  for (const { index, reader } of layout.status ?? []) {
    status = readStatus(cellAt(row, index), reader);
    if (status) break;
  }

  let createdAt: string | null = null;
  for (const { index } of layout.date ?? []) {
    createdAt = parseImportDate(cellAt(row, index), now);
    if (createdAt) break;
  }

  return {
    url: link.url,
    normalizedUrl: link.normalized,
    domain: link.domain,
    title,
    description,
    status: status ?? folderStatus,
    isFavorite: folderFavorite || (layout.favorite ?? []).some(({ index }) => truthy(cellAt(row, index)) === true),
    createdAt,
    note: notes.length ? cleanNote(notes.join("\n\n")) : null,
    categories: collectTerms(categoryNames, MAX_CATEGORIES, false),
    tags: collectTerms(tagNames, MAX_TAGS, true),
  };
}

/**
 * Reads a bookmarks CSV. Headers are matched loosely (case, spaces and
 * underscores don't matter); a file without a header works when one of its
 * columns holds links. Blank rows are ignored; at most `maxRows` rows
 * (default MAX_IMPORT_ROWS) are read. Never throws.
 */
export function parseBookmarksCsv(text: string, options?: { maxRows?: number }): ImportParseResult {
  const result: ImportParseResult = { candidates: [], invalid: 0, duplicatesInFile: 0, skipped: 0, recognizedColumns: [] };
  const rows = parseCsv(typeof text === "string" ? text : "").filter((row) => !isBlankRow(row));
  if (rows.length === 0) return result;

  const requested = options?.maxRows;
  const maxRows =
    typeof requested === "number" && Number.isFinite(requested) ? Math.max(0, Math.floor(requested)) : MAX_IMPORT_ROWS;
  const { layout, dataStart } = detectLayout(rows);
  result.recognizedColumns = COLUMN_ORDER.filter((column) => layout[column]);

  const now = Date.now();
  const seen = new Set<string>();
  for (let index = dataStart; index < rows.length; index++) {
    if (index - dataStart >= maxRows) {
      result.skipped = rows.length - index;
      break;
    }
    const candidate = readRow(rows[index] ?? [], layout, now);
    if (!candidate) result.invalid++;
    else if (seen.has(candidate.normalizedUrl)) result.duplicatesInFile++;
    else {
      seen.add(candidate.normalizedUrl);
      result.candidates.push(candidate);
    }
  }
  return result;
}
