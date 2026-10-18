"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, useTransition, type ReactNode } from "react";

import { EMPTY_FILTERS, filtersToQueryString, type LibraryFilters } from "@/lib/library-query";
import type { LinkListItem } from "@/lib/types";

/** Filters a view can hide because its route already decides them. */
export type LibraryFilterKey = "status" | "favorite" | "category" | "source" | "saved";

/** A request to point at a row (a link that was pasted again). `seq` makes repeats distinct. */
export interface RevealRequest {
  item: LinkListItem;
  seq: number;
}

interface LibraryContextValue {
  /** The filters the current page was rendered with. */
  filters: LibraryFilters;
  /**
   * The filters the controls should show: the latest requested change while
   * it loads, otherwise the rendered filters. Changes build on these, so two
   * quick changes in a row don't undo each other.
   */
  targetFilters: LibraryFilters;
  /** True while a filter change is loading. */
  isPending: boolean;
  /** Replaces the URL's filters (re-rendering the server page) inside a transition. */
  navigate: (next: LibraryFilters) => void;
  /** Whether this view has the add-link form (its shortcuts are listed in help). */
  canAdd: boolean;
  /** Whether a just-saved link belongs at the top of this view as it is filtered and sorted. */
  acceptsNewItems: boolean;
  /** Links saved during this visit, newest first; the list shows them until the server catches up. */
  added: readonly LinkListItem[];
  addItem: (item: LinkListItem) => void;
  revealRequest: RevealRequest | null;
  reveal: (item: LinkListItem) => void;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

interface LocalState {
  viewKey: string;
  added: LinkListItem[];
  revealRequest: RevealRequest | null;
}

export interface LibraryProviderProps {
  filters: LibraryFilters;
  /** Identifies the view (preset + filters); local additions are dropped when it changes. */
  viewKey: string;
  canAdd: boolean;
  acceptsNewItems: boolean;
  children: ReactNode;
}

/** Shares URL filter state and freshly saved links between the add form, the filters and the list. */
export function LibraryProvider({ filters, viewKey, canAdd, acceptsNewItems, children }: LibraryProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [local, setLocal] = useState<LocalState>({ viewKey, added: [], revealRequest: null });
  const [requested, setRequested] = useState<LibraryFilters | null>(null);

  // A different view has its own server data; anything added locally is already in it.
  if (local.viewKey !== viewKey) {
    setLocal({ viewKey, added: [], revealRequest: null });
  }
  // The navigation finished (or was superseded): the rendered filters are the truth again.
  if (!isPending && requested !== null) {
    setRequested(null);
  }

  const navigate = useCallback(
    (next: LibraryFilters) => {
      setRequested(next);
      startTransition(() => {
        router.replace(`${pathname}${filtersToQueryString(next)}`, { scroll: false });
      });
    },
    [router, pathname],
  );

  const addItem = useCallback((item: LinkListItem) => {
    setLocal((state) => ({ ...state, added: [item, ...state.added.filter((entry) => entry.id !== item.id)] }));
  }, []);

  const reveal = useCallback((item: LinkListItem) => {
    setLocal((state) => ({ ...state, revealRequest: { item, seq: (state.revealRequest?.seq ?? 0) + 1 } }));
  }, []);

  const value = useMemo<LibraryContextValue>(
    () => ({
      filters,
      targetFilters: requested ?? filters,
      isPending,
      navigate,
      canAdd,
      acceptsNewItems,
      added: local.added,
      addItem,
      revealRequest: local.revealRequest,
      reveal,
    }),
    [filters, requested, isPending, navigate, canAdd, acceptsNewItems, local.added, addItem, local.revealRequest, reveal],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryContextValue {
  const value = useContext(LibraryContext);
  if (!value) throw new Error("useLibrary must be used inside <LibraryProvider>");
  return value;
}

/** The filters with everything cleared; an explicit sort order is kept (it isn't a filter). */
export function clearedFilters(filters: LibraryFilters): LibraryFilters {
  return { ...EMPTY_FILTERS, sort: filters.sort === "relevance" ? null : filters.sort };
}
