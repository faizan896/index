import "server-only";

/**
 * CONTRACT STUB — signatures are final; bodies are implemented by the server layer.
 *
 * Read-side loaders for server components. Each one uses the signed-in user's
 * Supabase client (row-level security applies) and is wrapped in React
 * `cache()` where a page and its layout may both ask for the same data.
 */
import type {
  CategorySummary,
  CollectionSummary,
  LibraryStats,
  LinkDetail,
  LinkPage,
  LinkQuery,
  RediscoverPick,
  RelatedLink,
  SourceSummary,
  TagRef,
  UserSettings,
} from "@/lib/types";

export interface SessionUser {
  id: string;
  email: string | null;
}

/** The signed-in user, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  throw new Error("not implemented");
}

/** The signed-in user; redirects to /login when there is none. */
export async function requireUser(): Promise<SessionUser> {
  throw new Error("not implemented");
}

export async function getLinkPage(_query: LinkQuery): Promise<LinkPage> {
  throw new Error("not implemented");
}

export async function getLibraryStats(): Promise<LibraryStats> {
  throw new Error("not implemented");
}

export async function getCategorySummaries(): Promise<CategorySummary[]> {
  throw new Error("not implemented");
}

export async function getCategoryBySlug(_slug: string): Promise<CategorySummary | null> {
  throw new Error("not implemented");
}

export async function getTagBySlug(_slug: string): Promise<TagRef | null> {
  throw new Error("not implemented");
}

export async function getCollectionSummaries(): Promise<CollectionSummary[]> {
  throw new Error("not implemented");
}

export async function getCollection(_collectionId: string): Promise<CollectionSummary | null> {
  throw new Error("not implemented");
}

/** The most-saved sources, for the Source filter. */
export async function getSourceSummaries(): Promise<SourceSummary[]> {
  throw new Error("not implemented");
}

/** Null when the link doesn't exist or isn't the user's (render notFound()). */
export async function getLinkDetail(_linkId: string): Promise<LinkDetail | null> {
  throw new Error("not implemented");
}

export async function getRelatedLinks(_linkId: string, _limit?: number): Promise<RelatedLink[]> {
  throw new Error("not implemented");
}

export async function getRediscoverPicks(_seed: string): Promise<RediscoverPick[]> {
  throw new Error("not implemented");
}

export async function getUserSettings(): Promise<UserSettings> {
  throw new Error("not implemented");
}
