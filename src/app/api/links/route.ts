import type { NextRequest } from "next/server";

import { buildLinkQuery, PAGE_SIZE, presetFromParam, readFilters } from "@/lib/library-query";
import { apiClient, json } from "@/lib/server/api";
import { logServerError } from "@/lib/server/log";
import { mapListRow } from "@/lib/server/mappers";
import type { LinkPage } from "@/lib/types";

export const dynamic = "force-dynamic";

/** One page of a list view, for "Show more". Same parameters as the page URL plus view and offset. */
export async function GET(request: NextRequest) {
  const auth = await apiClient();
  if ("response" in auth) return auth.response;
  const { supabase } = auth;

  const params = request.nextUrl.searchParams;
  const filters = readFilters(params);
  const preset = presetFromParam(params.get("view"));
  const offset = Math.min(Math.max(Number.parseInt(params.get("offset") ?? "0", 10) || 0, 0), 100_000);

  let categoryId: string | null = null;
  if (filters.category) {
    const { data } = await supabase.from("categories").select("id").eq("slug", filters.category).maybeSingle();
    categoryId = data?.id ?? null;
  }

  const query = buildLinkQuery(preset, filters, { categoryId, offset, limit: PAGE_SIZE });
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
  if (error) {
    logServerError("api: list links", error);
    return json({ error: "Could not load more items." }, 500);
  }

  const rows = data ?? [];
  const page: LinkPage = {
    items: rows.map(mapListRow),
    total: rows.length ? Number(rows[0]?.total_count ?? 0) : offset,
  };
  return json(page);
}
