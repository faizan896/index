/**
 * Database rows (snake_case, JSON columns) → domain types (camelCase).
 * Defensive by design: JSON from aggregate columns is validated field by
 * field, so a surprising shape degrades to an empty list rather than a crash.
 */
import type {
  CategoryRef,
  CategorySummary,
  CollectionRef,
  CollectionSummary,
  LibraryStats,
  LinkDetail,
  LinkListItem,
  Note,
  ProcessingStatus,
  ReadingStatus,
  RediscoverKind,
  RediscoverPick,
  RelatedLink,
  SourceSummary,
} from "@/lib/types";
import type { Database, Json, ListLinksRow } from "./database.types";

type Functions = Database["public"]["Functions"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

const READING: readonly string[] = ["unread", "reading", "finished"];
const PROCESSING: readonly string[] = ["pending", "processing", "done", "failed", "skipped"];

function readingStatus(value: unknown): ReadingStatus {
  return typeof value === "string" && READING.includes(value) ? (value as ReadingStatus) : "unread";
}

function processingStatus(value: unknown): ProcessingStatus {
  return typeof value === "string" && PROCESSING.includes(value) ? (value as ProcessingStatus) : "pending";
}

/** [{id, name, slug}] JSON → refs; skips malformed entries. */
export function mapTermList(value: Json | unknown): CategoryRef[] {
  if (!Array.isArray(value)) return [];
  const refs: CategoryRef[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const id = str(entry.id);
    const name = str(entry.name);
    const slug = str(entry.slug);
    if (id && name && slug) refs.push({ id, name, slug });
  }
  return refs;
}

function mapRefList(value: unknown): CollectionRef[] {
  if (!Array.isArray(value)) return [];
  const refs: CollectionRef[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const id = str(entry.id);
    const name = str(entry.name);
    if (id && name) refs.push({ id, name });
  }
  return refs;
}

export function mapListRow(row: ListLinksRow): LinkListItem {
  return {
    id: row.id,
    url: row.url,
    domain: row.domain,
    title: row.title,
    description: row.description,
    author: row.author,
    siteName: row.site_name,
    publishedAt: row.published_at,
    readingMinutes: row.reading_minutes,
    status: readingStatus(row.status),
    isFavorite: Boolean(row.is_favorite),
    createdAt: row.created_at,
    metadataStatus: processingStatus(row.metadata_status),
    classificationStatus: processingStatus(row.classification_status),
    categories: mapTermList(row.categories),
    tags: mapTermList(row.tags),
  };
}

export function mapStats(value: Json | unknown): LibraryStats {
  const record = isRecord(value) ? value : {};
  const count = (key: string) => Math.max(0, Math.trunc(num(record[key]) ?? 0));
  return {
    total: count("total"),
    unread: count("unread"),
    reading: count("reading"),
    finished: count("finished"),
    favorites: count("favorites"),
    unsorted: count("unsorted"),
    pending: count("pending"),
    categories: count("categories"),
    collections: count("collections"),
  };
}

export function mapCategorySummary(row: Functions["category_summaries"]["Returns"][number]): CategorySummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    linkCount: num(row.link_count) ?? 0,
    createdAt: row.created_at,
  };
}

export function mapCollectionSummary(row: Functions["collection_summaries"]["Returns"][number]): CollectionSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    linkCount: num(row.link_count) ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSourceSummary(row: Functions["source_summaries"]["Returns"][number]): SourceSummary {
  return { domain: row.domain, siteName: row.site_name, linkCount: num(row.link_count) ?? 0 };
}

export function mapRelated(row: Functions["related_links"]["Returns"][number]): RelatedLink {
  return {
    id: row.id,
    url: row.url,
    domain: row.domain,
    title: row.title,
    siteName: row.site_name,
    status: readingStatus(row.status),
    createdAt: row.created_at,
    score: num(row.score) ?? 0,
    sharedCategories: Array.isArray(row.shared_categories) ? row.shared_categories.filter((n) => typeof n === "string") : [],
    sharedTags: Array.isArray(row.shared_tags) ? row.shared_tags.filter((n) => typeof n === "string") : [],
  };
}

const KINDS: readonly string[] = ["forgotten", "favorite", "random"];

export function mapRediscover(row: Functions["rediscover"]["Returns"][number]): RediscoverPick | null {
  if (!KINDS.includes(row.kind)) return null;
  return {
    kind: row.kind as RediscoverKind,
    link: {
      id: row.id,
      url: row.url,
      domain: row.domain,
      title: row.title,
      description: row.description,
      author: row.author,
      siteName: row.site_name,
      readingMinutes: row.reading_minutes,
      status: readingStatus(row.status),
      isFavorite: Boolean(row.is_favorite),
      createdAt: row.created_at,
    },
  };
}

export function mapNote(row: { id: string; link_id: string; body: string; created_at: string; updated_at: string }): Note {
  return { id: row.id, linkId: row.link_id, body: row.body, createdAt: row.created_at, updatedAt: row.updated_at };
}

function mapNoteJson(value: unknown): Note[] {
  if (!Array.isArray(value)) return [];
  const notes: Note[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const id = str(entry.id);
    const linkId = str(entry.link_id);
    const body = str(entry.body);
    const createdAt = str(entry.created_at);
    if (id && linkId && body !== null && createdAt) {
      notes.push({ id, linkId, body, createdAt, updatedAt: str(entry.updated_at) ?? createdAt });
    }
  }
  return notes;
}

/** The jsonb from link_detail() → LinkDetail, or null when absent/malformed. */
export function mapLinkDetail(value: Json | unknown): LinkDetail | null {
  if (!isRecord(value) || !isRecord(value.link)) return null;
  const link = value.link;
  const id = str(link.id);
  const url = str(link.url);
  const domain = str(link.domain);
  const createdAt = str(link.created_at);
  if (!id || !url || !domain || !createdAt) return null;
  return {
    id,
    url,
    domain,
    title: str(link.title),
    description: str(link.description),
    author: str(link.author),
    siteName: str(link.site_name),
    publishedAt: str(link.published_at),
    readingMinutes: num(link.reading_minutes),
    status: readingStatus(link.status),
    isFavorite: link.is_favorite === true,
    createdAt,
    metadataStatus: processingStatus(link.metadata_status),
    classificationStatus: processingStatus(link.classification_status),
    categories: mapTermList(value.categories),
    tags: mapTermList(value.tags),
    canonicalUrl: str(link.canonical_url),
    resolvedUrl: str(link.resolved_url),
    contentType: str(link.content_type),
    lang: str(link.lang),
    wordCount: num(link.word_count),
    metadataError: str(link.metadata_error),
    classificationError: str(link.classification_error),
    statusChangedAt: str(link.status_changed_at),
    finishedAt: str(link.finished_at),
    favoritedAt: str(link.favorited_at),
    updatedAt: str(link.updated_at) ?? createdAt,
    notes: mapNoteJson(value.notes),
    collections: mapRefList(value.collections),
    suggestedCollections: mapRefList(value.suggested_collections),
  };
}
