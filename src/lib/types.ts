/**
 * Domain types shared by the server, the UI and the tests.
 *
 * Database rows are snake_case (see server/database.types.ts); everything the
 * UI touches is camelCase and goes through the mappers in server/mappers.ts.
 */

export type ReadingStatus = "unread" | "reading" | "finished";

export const READING_STATUSES: readonly ReadingStatus[] = ["unread", "reading", "finished"];

export const READING_STATUS_LABEL: Record<ReadingStatus, string> = {
  unread: "Unread",
  reading: "Reading",
  finished: "Finished",
};

/** pending → processing → done | failed | skipped */
export type ProcessingStatus = "pending" | "processing" | "done" | "failed" | "skipped";

export type SortKey = "recent" | "oldest" | "alpha" | "published" | "relevance";

export const SORT_LABEL: Record<SortKey, string> = {
  recent: "Recently saved",
  oldest: "Oldest saved",
  alpha: "Alphabetical",
  published: "Recently published",
  relevance: "Best match",
};

export interface CategoryRef {
  id: string;
  name: string;
  slug: string;
}

export interface TagRef {
  id: string;
  name: string;
  slug: string;
}

export interface CollectionRef {
  id: string;
  name: string;
}

/** One row of the library list. */
export interface LinkListItem {
  id: string;
  url: string;
  domain: string;
  /** Null until metadata arrives (or if the site gave none). Display falls back to the domain. */
  title: string | null;
  description: string | null;
  author: string | null;
  siteName: string | null;
  /** ISO timestamp. */
  publishedAt: string | null;
  readingMinutes: number | null;
  status: ReadingStatus;
  isFavorite: boolean;
  /** ISO timestamp of when it was saved. */
  createdAt: string;
  metadataStatus: ProcessingStatus;
  classificationStatus: ProcessingStatus;
  categories: CategoryRef[];
  tags: TagRef[];
}

export interface Note {
  id: string;
  linkId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

/** Everything the detail page shows. */
export interface LinkDetail extends LinkListItem {
  canonicalUrl: string | null;
  resolvedUrl: string | null;
  contentType: string | null;
  lang: string | null;
  wordCount: number | null;
  metadataError: string | null;
  classificationError: string | null;
  statusChangedAt: string | null;
  finishedAt: string | null;
  favoritedAt: string | null;
  updatedAt: string;
  notes: Note[];
  collections: CollectionRef[];
  /** Collections the classifier suggested; never applied without the user. */
  suggestedCollections: CollectionRef[];
}

export interface RelatedLink {
  id: string;
  url: string;
  domain: string;
  title: string | null;
  siteName: string | null;
  status: ReadingStatus;
  createdAt: string;
  score: number;
  sharedCategories: string[];
  sharedTags: string[];
}

export type RediscoverKind = "forgotten" | "favorite" | "random";

export interface RediscoverPick {
  kind: RediscoverKind;
  link: Pick<
    LinkListItem,
    | "id"
    | "url"
    | "domain"
    | "title"
    | "description"
    | "author"
    | "siteName"
    | "readingMinutes"
    | "status"
    | "isFavorite"
    | "createdAt"
  >;
}

export interface LibraryStats {
  total: number;
  unread: number;
  reading: number;
  finished: number;
  favorites: number;
  unsorted: number;
  /** Links still being fetched or categorized. */
  pending: number;
  categories: number;
  collections: number;
}

export interface CategorySummary {
  id: string;
  name: string;
  slug: string;
  linkCount: number;
  createdAt: string;
}

export interface CollectionSummary {
  id: string;
  name: string;
  description: string | null;
  linkCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SourceSummary {
  domain: string;
  siteName: string | null;
  linkCount: number;
}

/** The fixed part of a list view, decided by the route rather than the URL. */
export type LibraryPreset =
  | { kind: "all" }
  | { kind: "status"; status: ReadingStatus }
  | { kind: "favorites" }
  | { kind: "unsorted" }
  | { kind: "category"; categoryId: string }
  | { kind: "tag"; tagId: string }
  | { kind: "collection"; collectionId: string };

/** Saved-date presets offered by the filter. */
export type SavedWithin = "week" | "month" | "year" | "older";

/** Everything that selects and orders a page of links. */
export interface LinkQuery {
  q: string | null;
  status: ReadingStatus | null;
  favorite: boolean | null;
  categoryId: string | null;
  tagId: string | null;
  collectionId: string | null;
  domain: string | null;
  unsorted: boolean;
  savedFrom: string | null;
  savedTo: string | null;
  sort: SortKey;
  limit: number;
  offset: number;
}

export interface LinkPage {
  items: LinkListItem[];
  total: number;
}

export interface UserSettings {
  aiEnabled: boolean;
  /** True when ANTHROPIC_API_KEY is present on the server. */
  aiConfigured: boolean;
  email: string | null;
}

/** Every server action resolves to one of these; actions never throw to the client. */
export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

export interface SaveLinkResult {
  link: LinkListItem;
  /** True when the URL was already in the library; `link` is the existing item. */
  duplicate: boolean;
}

export interface ImportSummary {
  imported: number;
  duplicates: number;
  invalid: number;
  /** Rows beyond the per-import limit, not read. */
  skipped: number;
}

export interface ProcessPendingSummary {
  processed: number;
  remaining: number;
}

/** Editable fields on the detail page. Empty strings clear a field. */
export interface LinkDetailsPatch {
  title?: string;
  author?: string;
  siteName?: string;
  description?: string;
  /** YYYY-MM-DD, or "" to clear. */
  publishedAt?: string;
}
