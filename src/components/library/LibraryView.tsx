import type { JSX, ReactNode } from "react";

import { pluralize } from "@/lib/format";
import {
  buildLinkQuery,
  effectiveSort,
  filtersToQueryString,
  hasActiveFilters,
  presetToParam,
  readFilters,
  type LibraryFilters as FilterState,
} from "@/lib/library-query";
import { getCategorySummaries, getLibraryStats, getLinkPage, getSourceSummaries } from "@/lib/server/queries";
import type { LibraryPreset, LibraryStats, SourceSummary } from "@/lib/types";
import { AddLinkForm } from "./AddLinkForm";
import { LibraryFilters } from "./LibraryFilters";
import { LibraryList } from "./LibraryList";
import { LibraryProvider, type LibraryFilterKey } from "./LibraryProvider";

export interface LibraryViewProps {
  preset: LibraryPreset;
  searchParams: Record<string, string | string[] | undefined>;
  /** The page's heading block. */
  heading: ReactNode;
  /** The add-link field (only "/"). */
  showAddLink?: boolean;
  /** The "248 saved · 36 unread · 18 categories" line. */
  showStats?: boolean;
  /** Shown when the view has no items and no filters are active. */
  emptyState?: { title: string; body?: ReactNode };
  /** Filters the route already decides. */
  hideFilters?: Array<LibraryFilterKey>;
  /** Collection pages: a quiet "Remove" on each row (needs preset.kind === "collection"). */
  rowAction?: "remove-from-collection";
}

const DEFAULT_EMPTY_STATE = { title: "Nothing here yet." };

function withoutHidden(filters: FilterState, hidden: ReadonlySet<LibraryFilterKey>): FilterState {
  return {
    ...filters,
    status: hidden.has("status") ? null : filters.status,
    favorite: hidden.has("favorite") ? false : filters.favorite,
    category: hidden.has("category") ? null : filters.category,
    source: hidden.has("source") ? null : filters.source,
    saved: hidden.has("saved") ? null : filters.saved,
  };
}

/** A just-saved link (unread, unsorted, saved now) goes on top only where it belongs, in that order. */
function acceptsNewItems(preset: LibraryPreset, filters: FilterState): boolean {
  const fits =
    preset.kind === "all" || preset.kind === "unsorted" || (preset.kind === "status" && preset.status === "unread");
  return fits && !hasActiveFilters(filters) && effectiveSort(filters) === "recent";
}

function statsLine(stats: LibraryStats): string {
  const parts = [pluralize(stats.total, "saved", "saved")];
  if (stats.unread > 0) parts.push(pluralize(stats.unread, "unread", "unread"));
  if (stats.categories > 0) parts.push(pluralize(stats.categories, "category", "categories"));
  return parts.join(" · ");
}

/**
 * The shared list view behind every list route (and collection pages):
 * heading, optional add field and stats, search and filters, then the list.
 */
export async function LibraryView({
  preset,
  searchParams,
  heading,
  showAddLink = false,
  showStats = false,
  emptyState,
  hideFilters = [],
  rowAction,
}: LibraryViewProps): Promise<JSX.Element> {
  const hidden = new Set(hideFilters);
  const filters = withoutHidden(readFilters(searchParams), hidden);
  const now = new Date();

  const categories = await getCategorySummaries();
  const categoryId = filters.category
    ? (categories.find((category) => category.slug === filters.category)?.id ?? null)
    : null;
  const query = buildLinkQuery(preset, filters, { categoryId, now });

  const [page, sources, stats] = await Promise.all([
    getLinkPage(query),
    hidden.has("source") ? Promise.resolve<SourceSummary[]>([]) : getSourceSummaries(),
    showStats ? getLibraryStats() : Promise.resolve<LibraryStats | null>(null),
  ]);

  const viewKey = `${presetToParam(preset)}${filtersToQueryString(filters)}`;
  const filtered = hasActiveFilters(filters);

  return (
    <LibraryProvider
      filters={filters}
      viewKey={viewKey}
      canAdd={showAddLink}
      acceptsNewItems={showAddLink && acceptsNewItems(preset, filters)}
    >
      {heading}
      {showAddLink ? <AddLinkForm /> : null}
      <div className="mt-10">
        {stats && stats.total > 0 ? <p className="tabular mb-5 text-sm text-muted">{statsLine(stats)}</p> : null}
        {/* Nothing to search or filter in an empty view. */}
        {page.total > 0 || filtered ? (
          <LibraryFilters
            categories={categories.map(({ slug, name }) => ({ slug, name }))}
            sources={sources}
            hidden={[...hidden]}
          />
        ) : null}
        <LibraryList
          preset={preset}
          viewKey={viewKey}
          initialPage={page}
          now={now.toISOString()}
          emptyState={emptyState ?? DEFAULT_EMPTY_STATE}
          removeFromCollection={
            rowAction === "remove-from-collection" && preset.kind === "collection" ? preset.collectionId : null
          }
          showUnsorted={preset.kind !== "unsorted"}
        />
      </div>
    </LibraryProvider>
  );
}
