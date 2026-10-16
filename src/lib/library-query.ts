/**
 * The library's URL state.
 *
 * Search, filters and sort live in the query string so that every view is
 * linkable, survives a reload and works with the back button. This module is
 * the single place that reads and writes that state; both the filter controls
 * (client) and the page loaders (server) go through it.
 */
import type { LibraryPreset, LinkQuery, ReadingStatus, SavedWithin, SortKey } from "./types";

export const PAGE_SIZE = 50;
export const MAX_QUERY_LENGTH = 200;

const STATUSES: readonly ReadingStatus[] = ["unread", "reading", "finished"];
const SORTS: readonly SortKey[] = ["recent", "oldest", "alpha", "published", "relevance"];
const SAVED: readonly SavedWithin[] = ["week", "month", "year", "older"];

export const SAVED_WITHIN_LABEL: Record<SavedWithin, string> = {
  week: "Past week",
  month: "Past month",
  year: "Past year",
  older: "Over a year ago",
};

/** The user-adjustable part of a list view, exactly as the URL carries it. */
export interface LibraryFilters {
  /** Free-text search, trimmed; "" when absent. */
  q: string;
  status: ReadingStatus | null;
  favorite: boolean;
  /** Category slug. */
  category: string | null;
  /** Source domain, e.g. "stratechery.com". */
  source: string | null;
  saved: SavedWithin | null;
  /** Null means "the default for this view" (see effectiveSort). */
  sort: SortKey | null;
}

export const EMPTY_FILTERS: LibraryFilters = {
  q: "",
  status: null,
  favorite: false,
  category: null,
  source: null,
  saved: null,
  sort: null,
};

type ParamsInput = URLSearchParams | Record<string, string | string[] | undefined>;

function getParam(params: ParamsInput, key: string): string | null {
  if (params instanceof URLSearchParams) return params.get(key);
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value != null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DOMAIN = /^[a-z0-9.-]{1,255}$/;

/** Reads filters from a query string, discarding anything malformed. */
export function readFilters(params: ParamsInput): LibraryFilters {
  const q = (getParam(params, "q") ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
  const category = (getParam(params, "category") ?? "").toLowerCase();
  const source = (getParam(params, "source") ?? "").toLowerCase();
  return {
    q,
    status: oneOf(getParam(params, "status"), STATUSES),
    favorite: getParam(params, "fav") === "1",
    category: SLUG.test(category) && category.length <= 80 ? category : null,
    source: DOMAIN.test(source) && !source.startsWith(".") ? source : null,
    saved: oneOf(getParam(params, "saved"), SAVED),
    sort: oneOf(getParam(params, "sort"), SORTS),
  };
}

/** Writes filters back to a query string, omitting defaults so URLs stay short. */
export function filtersToSearchParams(filters: LibraryFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.favorite) params.set("fav", "1");
  if (filters.category) params.set("category", filters.category);
  if (filters.source) params.set("source", filters.source);
  if (filters.saved) params.set("saved", filters.saved);
  if (filters.sort && filters.sort !== defaultSort(filters)) params.set("sort", filters.sort);
  return params;
}

/** "?q=…&status=…" or "" — ready to append to a pathname. */
export function filtersToQueryString(filters: LibraryFilters): string {
  const query = filtersToSearchParams(filters).toString();
  return query ? `?${query}` : "";
}

export function hasActiveFilters(filters: LibraryFilters): boolean {
  return Boolean(
    filters.q || filters.status || filters.favorite || filters.category || filters.source || filters.saved,
  );
}

/** Searching sorts by relevance unless the user picked an order. */
export function defaultSort(filters: Pick<LibraryFilters, "q">): SortKey {
  return filters.q ? "relevance" : "recent";
}

export function effectiveSort(filters: LibraryFilters): SortKey {
  if (filters.sort === "relevance" && !filters.q) return "recent";
  return filters.sort ?? defaultSort(filters);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The saved-date window for a preset, as ISO timestamps (half-open: from ≤ t < to). */
export function savedWithinRange(
  saved: SavedWithin | null,
  now: Date = new Date(),
): { from: string | null; to: string | null } {
  const at = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();
  switch (saved) {
    case "week":
      return { from: at(7), to: null };
    case "month":
      return { from: at(30), to: null };
    case "year":
      return { from: at(365), to: null };
    case "older":
      return { from: null, to: at(365) };
    default:
      return { from: null, to: null };
  }
}

export interface QueryContext {
  /** The id for filters.category, looked up by the caller; null if unknown. */
  categoryId: string | null;
  offset?: number;
  limit?: number;
  now?: Date;
}

/**
 * Combines the route's fixed preset with the URL filters into one query.
 * A preset always wins over a conflicting filter (the Unread page stays
 * unread whatever the query string says).
 */
export function buildLinkQuery(preset: LibraryPreset, filters: LibraryFilters, context: QueryContext): LinkQuery {
  const range = savedWithinRange(filters.saved, context.now);
  const query: LinkQuery = {
    q: filters.q || null,
    status: filters.status,
    favorite: filters.favorite ? true : null,
    categoryId: filters.category ? context.categoryId : null,
    tagId: null,
    collectionId: null,
    domain: filters.source,
    unsorted: false,
    savedFrom: range.from,
    savedTo: range.to,
    sort: effectiveSort(filters),
    limit: Math.min(Math.max(context.limit ?? PAGE_SIZE, 1), 200),
    offset: Math.max(context.offset ?? 0, 0),
  };

  switch (preset.kind) {
    case "status":
      query.status = preset.status;
      break;
    case "favorites":
      query.favorite = true;
      break;
    case "unsorted":
      query.unsorted = true;
      query.categoryId = null;
      break;
    case "category":
      query.categoryId = preset.categoryId;
      break;
    case "tag":
      query.tagId = preset.tagId;
      break;
    case "collection":
      query.collectionId = preset.collectionId;
      break;
    case "all":
      break;
  }

  // A category filter naming a category that does not exist matches nothing,
  // rather than silently matching everything.
  if (filters.category && !context.categoryId && preset.kind !== "category" && preset.kind !== "unsorted") {
    query.categoryId = "00000000-0000-0000-0000-000000000000";
  }

  return query;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Serializes a preset for the `view` parameter of GET /api/links (used by "Show more"). */
export function presetToParam(preset: LibraryPreset): string {
  switch (preset.kind) {
    case "all":
    case "favorites":
    case "unsorted":
      return preset.kind;
    case "status":
      return preset.status;
    case "category":
      return `category:${preset.categoryId}`;
    case "tag":
      return `tag:${preset.tagId}`;
    case "collection":
      return `collection:${preset.collectionId}`;
  }
}

/** Parses the `view` parameter; anything unrecognized means "all". */
export function presetFromParam(value: string | null | undefined): LibraryPreset {
  if (!value) return { kind: "all" };
  if (value === "favorites" || value === "unsorted") return { kind: value };
  if ((STATUSES as readonly string[]).includes(value)) return { kind: "status", status: value as ReadingStatus };
  const [kind, id] = value.split(":", 2);
  if (id && UUID.test(id)) {
    if (kind === "category") return { kind: "category", categoryId: id };
    if (kind === "tag") return { kind: "tag", tagId: id };
    if (kind === "collection") return { kind: "collection", collectionId: id };
  }
  return { kind: "all" };
}
