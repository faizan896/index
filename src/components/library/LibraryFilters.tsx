"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { Select } from "@/components/ui/Field";
import { CloseIcon, SearchIcon, StarIcon } from "@/components/ui/Icons";
import { cx } from "@/lib/cx";
import {
  effectiveSort,
  filtersToQueryString,
  hasActiveFilters,
  SAVED_WITHIN_LABEL,
  type LibraryFilters as FilterState,
} from "@/lib/library-query";
import {
  READING_STATUS_LABEL,
  READING_STATUSES,
  SORT_LABEL,
  type ReadingStatus,
  type SavedWithin,
  type SortKey,
  type SourceSummary,
} from "@/lib/types";
import { isShortcutEvent } from "./keyboard";
import { clearedFilters, useLibrary, type LibraryFilterKey } from "./LibraryProvider";

const SEARCH_DELAY_MS = 250;
const MAX_SOURCES = 40;
const BROWSE_SORTS: readonly SortKey[] = ["recent", "oldest", "alpha", "published"];
const SAVED_OPTIONS = Object.keys(SAVED_WITHIN_LABEL) as SavedWithin[];

/** Inline selects size to their current option where supported, and never outgrow a phone. */
const SELECT_CLASS = "max-w-[11rem] truncate [field-sizing:content] sm:max-w-[14rem]";

export interface LibraryFiltersProps {
  categories: ReadonlyArray<{ slug: string; name: string }>;
  sources: readonly SourceSummary[];
  /** Filters the route already decides (e.g. Status on /unread). */
  hidden: readonly LibraryFilterKey[];
}

/**
 * Search plus a quiet row of filters. Everything lives in the URL: each
 * change replaces the query string, and the server renders the new list.
 */
export function LibraryFilters({ categories, sources, hidden }: LibraryFiltersProps) {
  // Controls show (and build on) the latest requested filters; the search
  // field follows the rendered ones.
  const { filters: rendered, targetFilters: filters, navigate } = useLibrary();
  const [q, setQ] = useState(rendered.q);
  const [syncedQ, setSyncedQ] = useState(rendered.q);
  const [focused, setFocused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchId = useId();
  const rowId = useId();

  // Follow the URL when it changes from elsewhere (back button, "Clear"),
  // but never overwrite what the user is in the middle of typing.
  if (rendered.q !== syncedQ) {
    setSyncedQ(rendered.q);
    if (!focused) setQ(rendered.q);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || !isShortcutEvent(event)) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const pending = timer;
    return () => {
      if (pending.current) clearTimeout(pending.current);
    };
  }, []);

  function cancelPendingSearch() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  function apply(patch: Partial<FilterState>, query: string = q) {
    cancelPendingSearch();
    const next: FilterState = { ...filters, ...patch, q: query.replace(/\s+/g, " ").trim() };
    if (!next.q && next.sort === "relevance") next.sort = null;
    if (filtersToQueryString(next) !== filtersToQueryString(filters)) navigate(next);
  }

  function onQueryChange(value: string) {
    setQ(value);
    cancelPendingSearch();
    timer.current = setTimeout(() => apply({}, value), SEARCH_DELAY_MS);
  }

  function onSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (q) {
      setQ("");
      apply({}, "");
    } else {
      event.currentTarget.blur();
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    apply({});
  }

  function clearAll() {
    cancelPendingSearch();
    setQ("");
    navigate(clearedFilters(filters));
  }

  const shows = (key: LibraryFilterKey) => !hidden.includes(key);
  const active = hasActiveFilters(filters);
  const sort = effectiveSort(filters);
  const sorts = filters.q ? [...BROWSE_SORTS, "relevance" as const] : BROWSE_SORTS;

  const categoryOptions = [...categories];
  if (filters.category && !categoryOptions.some((category) => category.slug === filters.category)) {
    categoryOptions.push({ slug: filters.category, name: filters.category });
  }
  const sourceOptions = sources.slice(0, MAX_SOURCES);
  if (filters.source && !sourceOptions.some((source) => source.domain === filters.source)) {
    sourceOptions.push({ domain: filters.source, siteName: null, linkCount: 0 });
  }

  const showCategory = shows("category") && categoryOptions.length > 0;
  const showSource = shows("source") && (sourceOptions.length > 1 || Boolean(filters.source));
  const rowVisible = expanded || active;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-3">
        <form role="search" onSubmit={onSubmit} className="min-w-0 flex-1">
          <label htmlFor={searchId} className="sr-only">
            Search your library
          </label>
          <div className="flex items-center gap-2.5 border-b border-rule transition-colors focus-within:border-ink">
            <SearchIcon className="size-4 shrink-0 text-faint" />
            <input
              ref={inputRef}
              id={searchId}
              type="search"
              placeholder="Search your library"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="search"
              value={q}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={onSearchKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              className="h-10 min-w-0 flex-1 bg-transparent text-[1rem] text-ink outline-none focus-visible:outline-none sm:text-base"
            />
            {q ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQ("");
                  apply({}, "");
                  inputRef.current?.focus();
                }}
                className="-mr-1.5 inline-flex size-8 shrink-0 items-center justify-center text-faint transition-colors hover:text-ink"
              >
                <CloseIcon className="size-3.5" />
              </button>
            ) : null}
          </div>
        </form>
        {active ? null : (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={rowId}
            onClick={() => setExpanded((open) => !open)}
            className="h-8 shrink-0 text-sm text-muted transition-colors hover:text-ink sm:hidden"
          >
            {expanded ? "Hide filters" : "Filters"}
          </button>
        )}
      </div>

      <div
        id={rowId}
        className={cx("mt-3 flex-wrap items-center gap-x-5 gap-y-1", rowVisible ? "flex" : "hidden sm:flex")}
      >
        {shows("status") ? (
          <Select
            inline
            aria-label="Reading status"
            value={filters.status ?? ""}
            onChange={(event) => apply({ status: (event.target.value || null) as ReadingStatus | null })}
            className={SELECT_CLASS}
          >
            <option value="">All statuses</option>
            {READING_STATUSES.map((status) => (
              <option key={status} value={status}>
                {READING_STATUS_LABEL[status]}
              </option>
            ))}
          </Select>
        ) : null}

        {showCategory ? (
          <Select
            inline
            aria-label="Category"
            value={filters.category ?? ""}
            onChange={(event) => apply({ category: event.target.value || null })}
            className={SELECT_CLASS}
          >
            <option value="">All categories</option>
            {categoryOptions.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name}
              </option>
            ))}
          </Select>
        ) : null}

        {showSource ? (
          <Select
            inline
            aria-label="Source"
            value={filters.source ?? ""}
            onChange={(event) => apply({ source: event.target.value || null })}
            className={SELECT_CLASS}
          >
            <option value="">All sources</option>
            {sourceOptions.map((source) => (
              <option key={source.domain} value={source.domain}>
                {source.siteName?.trim() || source.domain}
                {source.linkCount > 0 ? ` (${source.linkCount.toLocaleString("en-US")})` : ""}
              </option>
            ))}
          </Select>
        ) : null}

        {shows("saved") ? (
          <Select
            inline
            aria-label="Date saved"
            value={filters.saved ?? ""}
            onChange={(event) => apply({ saved: (event.target.value || null) as SavedWithin | null })}
            className={SELECT_CLASS}
          >
            <option value="">Any time</option>
            {SAVED_OPTIONS.map((saved) => (
              <option key={saved} value={saved}>
                {SAVED_WITHIN_LABEL[saved]}
              </option>
            ))}
          </Select>
        ) : null}

        {shows("favorite") ? (
          <button
            type="button"
            aria-pressed={filters.favorite}
            onClick={() => apply({ favorite: !filters.favorite })}
            className={cx(
              "inline-flex h-7 items-center gap-1.5 text-sm transition-colors",
              filters.favorite ? "text-ink" : "text-muted hover:text-ink",
            )}
          >
            <StarIcon filled={filters.favorite} className="size-3.5" />
            Favorites
          </button>
        ) : null}

        {active ? (
          <button type="button" onClick={clearAll} className="h-7 text-sm text-muted transition-colors hover:text-ink">
            Clear
          </button>
        ) : null}

        <span className="sm:ml-auto">
          <Select
            inline
            aria-label="Sort"
            value={sort}
            onChange={(event) => apply({ sort: event.target.value as SortKey })}
            className={SELECT_CLASS}
          >
            {sorts.map((key) => (
              <option key={key} value={key}>
                {SORT_LABEL[key]}
              </option>
            ))}
          </Select>
        </span>
      </div>
    </div>
  );
}
