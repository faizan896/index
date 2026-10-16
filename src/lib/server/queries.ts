import "server-only";

/**
 * Read-side loaders for server components. Each one uses the signed-in
 * user's Supabase client, so row-level security applies, and is wrapped in
 * React `cache()` so a layout and its page share one query per request.
 */
import { redirect } from "next/navigation";
import { cache } from "react";

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
import { isUuid } from "@/lib/validate";
import { isAiConfigured, isEmailAllowed } from "./env";
import {
  mapCategorySummary,
  mapCollectionSummary,
  mapLinkDetail,
  mapListRow,
  mapRediscover,
  mapRelated,
  mapSourceSummary,
  mapStats,
} from "./mappers";
import { createSupabaseServerClient } from "./supabase";

export interface SessionUser {
  id: string;
  email: string | null;
}

/** Thrown when a query fails; the route's error boundary shows a calm message. */
export class QueryError extends Error {
  constructor(what: string, cause: { message: string; code?: string } | null) {
    super(`Could not load ${what}${cause?.code ? ` (${cause.code})` : ""}.`);
    this.name = "QueryError";
  }
}

const getClient = cache(createSupabaseServerClient);

/** The signed-in user, or null. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await getClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || !isEmailAllowed(data.user.email)) return null;
  return { id: data.user.id, email: data.user.email ?? null };
});

/** The signed-in user; redirects to /login when there is none. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function getLinkPage(query: LinkQuery): Promise<LinkPage> {
  const supabase = await getClient();
  const { data, error } = await supabase.rpc("list_links", {
    p_query: query.q,
    p_status: query.status,
    p_favorite: query.favorite,
    p_category_id: query.categoryId,
    p_tag_id: query.tagId,
    p_collection_id: query.collectionId,
    p_domain: query.domain,
    p_unsorted: query.unsorted,
    p_saved_from: query.savedFrom,
    p_saved_to: query.savedTo,
    p_sort: query.sort,
    p_limit: query.limit,
    p_offset: query.offset,
  });
  if (error) throw new QueryError("your library", error);
  const rows = data ?? [];
  const total = rows.length ? Number(rows[0]?.total_count ?? rows.length) : 0;
  // total_count is a window over all matches; past the last page it's unknown, so fall back to the offset.
  return { items: rows.map(mapListRow), total: rows.length ? total : query.offset > 0 ? query.offset : 0 };
}

export const getLibraryStats = cache(async (): Promise<LibraryStats> => {
  const supabase = await getClient();
  const { data, error } = await supabase.rpc("library_stats");
  if (error) throw new QueryError("library stats", error);
  return mapStats(data);
});

export const getCategorySummaries = cache(async (): Promise<CategorySummary[]> => {
  const supabase = await getClient();
  const { data, error } = await supabase.rpc("category_summaries");
  if (error) throw new QueryError("categories", error);
  return (data ?? []).map(mapCategorySummary);
});

export async function getCategoryBySlug(slug: string): Promise<CategorySummary | null> {
  const categories = await getCategorySummaries();
  return categories.find((category) => category.slug === slug.toLowerCase()) ?? null;
}

export const getTagBySlug = cache(async (slug: string): Promise<TagRef | null> => {
  const supabase = await getClient();
  const { data, error } = await supabase.from("tags").select("id, name, slug").eq("slug", slug.toLowerCase()).maybeSingle();
  if (error) throw new QueryError("the tag", error);
  return data ? { id: data.id, name: data.name, slug: data.slug } : null;
});

export const getCollectionSummaries = cache(async (): Promise<CollectionSummary[]> => {
  const supabase = await getClient();
  const { data, error } = await supabase.rpc("collection_summaries");
  if (error) throw new QueryError("collections", error);
  return (data ?? []).map(mapCollectionSummary);
});

export async function getCollection(collectionId: string): Promise<CollectionSummary | null> {
  if (!isUuid(collectionId)) return null;
  const collections = await getCollectionSummaries();
  return collections.find((collection) => collection.id === collectionId) ?? null;
}

/** The most-saved sources, for the Source filter. */
export const getSourceSummaries = cache(async (): Promise<SourceSummary[]> => {
  const supabase = await getClient();
  const { data, error } = await supabase.rpc("source_summaries", { p_limit: 100 });
  if (error) throw new QueryError("sources", error);
  return (data ?? []).map(mapSourceSummary);
});

/** Null when the link doesn't exist or isn't the user's (render notFound()). */
export const getLinkDetail = cache(async (linkId: string): Promise<LinkDetail | null> => {
  if (!isUuid(linkId)) return null;
  const supabase = await getClient();
  const { data, error } = await supabase.rpc("link_detail", { p_link_id: linkId });
  if (error) throw new QueryError("this item", error);
  return mapLinkDetail(data);
});

export async function getRelatedLinks(linkId: string, limit = 6): Promise<RelatedLink[]> {
  if (!isUuid(linkId)) return [];
  const supabase = await getClient();
  const { data, error } = await supabase.rpc("related_links", { p_link_id: linkId, p_limit: limit });
  // Related reads are a nicety; never let them break the page.
  if (error) return [];
  return (data ?? []).map(mapRelated);
}

export async function getRediscoverPicks(seed: string): Promise<RediscoverPick[]> {
  const supabase = await getClient();
  const { data, error } = await supabase.rpc("rediscover", { p_seed: seed.slice(0, 64) });
  if (error) throw new QueryError("your archive", error);
  return (data ?? []).map(mapRediscover).filter((pick): pick is RediscoverPick => pick !== null);
}

export const getUserSettings = cache(async (): Promise<UserSettings> => {
  const user = await requireUser();
  const supabase = await getClient();
  const { data, error } = await supabase.from("user_settings").select("ai_enabled").eq("user_id", user.id).maybeSingle();
  if (error) throw new QueryError("settings", error);
  return { aiEnabled: data?.ai_enabled ?? true, aiConfigured: isAiConfigured(), email: user.email };
});
