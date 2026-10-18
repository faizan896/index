/**
 * Library export: the export_library() document checked and reshaped into
 * the camelCase JSON people download, and a flat CSV for spreadsheets that
 * Index's own import reads back.
 */
import { toCsv } from "@/lib/core/csv";
import { domainOf } from "@/lib/core/url";
import { READING_STATUSES, type ReadingStatus } from "@/lib/types";

export interface ExportedLink {
  url: string;
  canonicalUrl: string | null;
  title: string | null;
  description: string | null;
  author: string | null;
  siteName: string | null;
  domain: string;
  publishedAt: string | null;
  readingMinutes: number | null;
  status: ReadingStatus;
  isFavorite: boolean;
  savedAt: string;
  finishedAt: string | null;
  categories: string[];
  tags: string[];
  collections: string[];
  notes: Array<{ body: string; createdAt: string }>;
}

export interface LibraryExport {
  format: "index-library";
  version: 1;
  exportedAt: string;
  links: ExportedLink[];
  collections: Array<{ name: string; description: string | null; createdAt: string }>;
  categories: string[];
}

/** Columns of the CSV export, in order. parseBookmarksCsv recognises them. */
export const EXPORT_CSV_COLUMNS = [
  "url",
  "title",
  "author",
  "source",
  "domain",
  "published_at",
  "saved_at",
  "status",
  "favorite",
  "categories",
  "tags",
  "collections",
  "notes",
  "reading_minutes",
  "description",
] as const;

type RawObject = Record<string, unknown>;

function object(value: unknown): RawObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as RawObject) : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function names(value: unknown): string[] {
  return array(value).filter((item): item is string => text(item) !== null);
}

/** An ISO timestamp for a Postgres timestamptz ("2026-10-16T09:30:00.123456+00:00"), or null. */
function timestamp(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function readingStatus(value: unknown): ReadingStatus {
  return READING_STATUSES.find((status) => status === value) ?? "unread";
}

function minutes(value: unknown): number | null {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) && number > 0 ? Math.round(number) : null;
}

function validDate(value: Date): Date | null {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value : null;
}

function hostOf(url: string): string {
  try {
    return domainOf(new URL(url).hostname);
  } catch {
    return "";
  }
}

function exportedLink(value: unknown, fallbackTime: string): ExportedLink | null {
  const link = object(value);
  const url = link ? text(link.url) : null;
  if (!link || !url) return null;

  const savedAt = timestamp(link.saved_at) ?? timestamp(link.created_at) ?? fallbackTime;
  const notes: ExportedLink["notes"] = [];
  for (const item of array(link.notes)) {
    const note = object(item);
    const body = note ? text(note.body) : null;
    if (note && body) notes.push({ body, createdAt: timestamp(note.created_at) ?? savedAt });
  }

  return {
    url,
    canonicalUrl: text(link.canonical_url),
    title: text(link.title),
    description: text(link.description),
    author: text(link.author),
    siteName: text(link.site_name),
    domain: text(link.domain) ?? hostOf(url),
    publishedAt: timestamp(link.published_at),
    readingMinutes: minutes(link.reading_minutes),
    status: readingStatus(link.status),
    isFavorite: link.is_favorite === true,
    savedAt,
    finishedAt: timestamp(link.finished_at),
    categories: names(link.categories),
    tags: names(link.tags),
    collections: names(link.collections),
    notes,
  };
}

/**
 * The download document for the jsonb export_library() returns (snake_case
 * keys). Entries without a URL or name are left out; missing or malformed
 * fields fall back to null, empty lists or "unread". Never throws.
 */
export function buildLibraryExport(raw: unknown, exportedAt: Date): LibraryExport {
  const exportedTime = (validDate(exportedAt) ?? new Date()).toISOString();
  const root = object(raw) ?? {};

  const links: ExportedLink[] = [];
  for (const item of array(root.links)) {
    const link = exportedLink(item, exportedTime);
    if (link) links.push(link);
  }

  const collections: LibraryExport["collections"] = [];
  for (const item of array(root.collections)) {
    const collection = object(item);
    const name = collection ? text(collection.name) : null;
    if (!collection || !name) continue;
    collections.push({
      name,
      description: text(collection.description),
      createdAt: timestamp(collection.created_at) ?? exportedTime,
    });
  }

  return {
    format: "index-library",
    version: 1,
    exportedAt: exportedTime,
    links,
    collections,
    categories: names(root.categories),
  };
}

/**
 * One row per link, for spreadsheets: lists joined with "; ", notes with a
 * blank line between them, a byte-order mark so Excel reads UTF-8.
 */
export function libraryExportToCsv(doc: LibraryExport): string {
  const rows = doc.links.map((link) => [
    link.url,
    link.title,
    link.author,
    link.siteName,
    link.domain,
    link.publishedAt,
    link.savedAt,
    link.status,
    link.isFavorite ? "yes" : "no",
    link.categories.join("; "),
    link.tags.join("; "),
    link.collections.join("; "),
    link.notes.map((note) => note.body).join("\n\n"),
    link.readingMinutes,
    link.description,
  ]);
  return toCsv([EXPORT_CSV_COLUMNS, ...rows], { bom: true });
}

/** "index-library-2026-10-16.json" (UTC date). */
export function exportFilename(format: "json" | "csv", exportedAt: Date): string {
  const date = validDate(exportedAt);
  return date ? `index-library-${date.toISOString().slice(0, 10)}.${format}` : `index-library.${format}`;
}
