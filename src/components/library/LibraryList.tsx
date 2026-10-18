"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { addLinkToCollection, removeLinkFromCollection } from "@/lib/actions/collections";
import { retryLinkProcessing, setLinkStatus } from "@/lib/actions/links";
import { cx } from "@/lib/cx";
import { displayTitle, pluralize } from "@/lib/format";
import { filtersToSearchParams, hasActiveFilters, PAGE_SIZE, presetToParam } from "@/lib/library-query";
import {
  READING_STATUS_LABEL,
  type LibraryPreset,
  type LinkListItem,
  type LinkPage,
  type ReadingStatus,
} from "@/lib/types";
import { settle } from "./action-result";
import { isInteractiveTarget, isShortcutEvent, shortcutKey } from "./keyboard";
import { clearedFilters, useLibrary } from "./LibraryProvider";
import { LinkRow, rowId, rowTitleId } from "./LinkRow";
import { ShortcutsHelp } from "./ShortcutsHelp";
import { isProcessing, useProcessingPoll } from "./useProcessingPoll";

/** Wait for a burst of items to finish processing before refreshing the page once. */
const REFRESH_DELAY_MS = 800;

const NEXT_STATUS: Record<ReadingStatus, ReadingStatus> = {
  unread: "reading",
  reading: "finished",
  finished: "unread",
};

/**
 * A local copy of an item (an optimistic change or a poll result), tagged
 * with the server page it was made against: once the server sends a newer
 * page that includes the item, the server's copy wins again.
 */
interface Patch {
  item: LinkListItem;
  page: LinkPage;
}

export interface LibraryListProps {
  preset: LibraryPreset;
  /** Identifies the view (preset + filters); paging and selection reset when it changes. */
  viewKey: string;
  /** The first page, rendered on the server. */
  initialPage: LinkPage;
  /** The server render time (ISO), so relative dates read the same on server and client. */
  now: string;
  /** Shown when the view has no items and no filters are active. */
  emptyState: { title: string; body?: ReactNode };
  /** Collection id when rows offer "Remove" from that collection. */
  removeFromCollection: string | null;
  /** Label items without categories "Unsorted" (redundant on the Unsorted page). */
  showUnsorted: boolean;
}

function withEntry<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(set);
  next.add(value);
  return next;
}

function withoutEntry<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(set);
  next.delete(value);
  return next;
}

/**
 * The list itself: server-rendered first page, "Show more" paging, links
 * saved a moment ago, live updates for links still being processed,
 * optimistic status and favorite changes, and keyboard navigation.
 */
export function LibraryList({
  preset,
  viewKey,
  initialPage,
  now,
  emptyState,
  removeFromCollection,
  showUnsorted,
}: LibraryListProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { filters, navigate, isPending, canAdd, added, revealRequest } = useLibrary();
  const nowDate = useMemo(() => new Date(now), [now]);

  const [view, setView] = useState(viewKey);
  const [extra, setExtra] = useState<LinkListItem[]>([]);
  const [exhausted, setExhausted] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [patches, setPatches] = useState<ReadonlyMap<string, Patch>>(() => new Map());
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(() => new Set());
  const [stalled, setStalled] = useState<ReadonlySet<string>>(() => new Set());
  const [retrying, setRetrying] = useState<ReadonlySet<string>>(() => new Set());
  const [statusKeys, setStatusKeys] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [selection, setSelection] = useState<{ id: string; index: number } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  // A new search or filter is a new list: start paging and selection over.
  if (view !== viewKey) {
    setView(viewKey);
    setExtra([]);
    setExhausted(false);
    setLoadError(null);
    setSelection(null);
  }

  const serverIds = useMemo(() => new Set(initialPage.items.map((item) => item.id)), [initialPage]);

  const items = useMemo(() => {
    const seen = new Set<string>();
    const list: LinkListItem[] = [];
    const include = (item: LinkListItem) => {
      if (seen.has(item.id) || hiddenIds.has(item.id)) return;
      seen.add(item.id);
      const patch = patches.get(item.id);
      list.push(patch && (patch.page === initialPage || !serverIds.has(item.id)) ? patch.item : item);
    };
    for (const item of added) if (!serverIds.has(item.id)) include(item);
    for (const item of initialPage.items) include(item);
    for (const item of extra) include(item);
    return list;
  }, [added, initialPage, serverIds, extra, patches, hiddenIds]);

  // Latest values for callbacks that run after an await or from document listeners.
  const pageRef = useRef(initialPage);
  const itemsRef = useRef(items);
  useEffect(() => {
    pageRef.current = initialPage;
    itemsRef.current = items;
  });

  const setItem = useCallback((item: LinkListItem) => {
    setPatches((current) => new Map(current).set(item.id, { item, page: pageRef.current }));
  }, []);

  const updateItem = useCallback(
    (linkId: string, change: (item: LinkListItem) => LinkListItem) => {
      const current = itemsRef.current.find((item) => item.id === linkId);
      if (current) setItem(change(current));
    },
    [setItem],
  );

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      router.refresh();
    }, REFRESH_DELAY_MS);
  }, [router]);
  useEffect(() => {
    const pending = refreshTimer;
    return () => {
      if (pending.current) clearTimeout(pending.current);
    };
  }, []);

  const processingIds = useMemo(
    () => items.filter((item) => isProcessing(item) && !stalled.has(item.id)).map((item) => item.id),
    [items, stalled],
  );
  const { forget } = useProcessingPoll(processingIds, {
    onUpdate: (item, source) => {
      setItem(item);
      if (isProcessing(item)) return;
      setAnnouncement(`Details ready for ${displayTitle(item)}.`);
      // Refresh so the sidebar shows new categories. A retry is a server action,
      // which refreshes the page by itself.
      if (source === "poll") scheduleRefresh();
    },
    onMissing: (linkId) => setHiddenIds((current) => withEntry(current, linkId)),
    onStalled: (linkId) => setStalled((current) => withEntry(current, linkId)),
  });

  // A link pasted again: show its current state and highlight its row if it's
  // in the list (without scrolling away from the field the user is typing in).
  useEffect(() => {
    if (!revealRequest) return;
    const { item } = revealRequest;
    setItem(item);
    const index = itemsRef.current.findIndex((entry) => entry.id === item.id);
    if (index !== -1) setSelection({ id: item.id, index });
  }, [revealRequest, setItem]);

  async function retry(item: LinkListItem) {
    setRetrying((current) => withEntry(current, item.id));
    const result = await settle(retryLinkProcessing(item.id));
    setRetrying((current) => withoutEntry(current, item.id));
    if (!result.ok) {
      toast(result.error, { tone: "error" });
      return;
    }
    forget(item.id);
    setStalled((current) => withoutEntry(current, item.id));
    setItem(result.data);
  }

  function bumpStatusKey(linkId: string) {
    setStatusKeys((current) => new Map(current).set(linkId, (current.get(linkId) ?? 0) + 1));
  }

  function cycleStatus(item: LinkListItem) {
    const previous = item.status;
    const next = NEXT_STATUS[previous];
    setItem({ ...item, status: next });
    // Remount the row's status menu so its own optimistic state can't mask this change.
    bumpStatusKey(item.id);
    setAnnouncement(`Marked as ${READING_STATUS_LABEL[next]}.`);
    void settle(setLinkStatus(item.id, next)).then((result) => {
      if (result.ok) return;
      updateItem(item.id, (current) => ({ ...current, status: previous }));
      bumpStatusKey(item.id);
      toast(result.error, { tone: "error" });
    });
  }

  /** Goes through the row's own star button, so the keyboard and the mouse share one code path. */
  function toggleFavorite(linkId: string) {
    document.getElementById(rowId(linkId))?.querySelector<HTMLButtonElement>("[data-favorite] button")?.click();
  }

  async function remove(item: LinkListItem, collectionId: string) {
    setHiddenIds((current) => withEntry(current, item.id));
    const result = await settle(removeLinkFromCollection(item.id, collectionId));
    if (!result.ok) {
      setHiddenIds((current) => withoutEntry(current, item.id));
      toast(result.error, { tone: "error" });
      return;
    }
    toast("Removed from this collection.", {
      action: { label: "Undo", onAction: () => void undoRemove(item.id, collectionId) },
    });
  }

  async function undoRemove(linkId: string, collectionId: string) {
    const result = await settle(addLinkToCollection(linkId, collectionId));
    if (!result.ok) {
      toast(result.error, { tone: "error" });
      return;
    }
    setHiddenIds((current) => withoutEntry(current, linkId));
  }

  const loadedCount = initialPage.items.length + extra.filter((item) => !serverIds.has(item.id)).length;
  const hasMore = !exhausted && loadedCount < initialPage.total;

  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    setLoadError(null);
    const params = filtersToSearchParams(filters);
    params.set("view", presetToParam(preset));
    params.set("offset", String(loadedCount));
    try {
      const response = await fetch(`/api/links?${params.toString()}`, {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error(`Status ${response.status}`);
      const page = (await response.json()) as Partial<LinkPage>;
      const more = Array.isArray(page.items) ? page.items : [];
      setExtra((current) => [...current, ...more]);
      if (more.length < PAGE_SIZE) setExhausted(true);
      if (more.length > 0) setAnnouncement(`Showing ${pluralize(loadedCount + more.length, "item")}.`);
    } catch {
      setLoadError("Couldn't load more. Try again.");
    } finally {
      setLoadingMore(false);
    }
  }

  function focusRow(linkId: string) {
    document.getElementById(rowTitleId(linkId))?.focus({ preventScroll: true });
    document.getElementById(rowId(linkId))?.scrollIntoView({ block: "nearest" });
  }

  function onShortcut(event: KeyboardEvent) {
    const key = shortcutKey(event);
    if (key === "?") {
      event.preventDefault();
      setHelpOpen(true);
      return;
    }

    const index = selection ? items.findIndex((item) => item.id === selection.id) : -1;
    if (key === "j" || key === "k") {
      if (items.length === 0) return;
      event.preventDefault();
      const step = key === "j" ? 1 : -1;
      let next = 0;
      if (index >= 0) next = index + step;
      // The selected row has left the list: carry on from where it was.
      else if (selection) next = step > 0 ? selection.index : selection.index - 1;
      next = Math.min(Math.max(next, 0), items.length - 1);
      const target = items[next];
      if (!target) return;
      setSelection({ id: target.id, index: next });
      focusRow(target.id);
      return;
    }

    const current = index >= 0 ? items[index] : undefined;
    if (!current) return;
    if (key === "o" || (key === "Enter" && !isInteractiveTarget(event.target))) {
      event.preventDefault();
      router.push(`/item/${current.id}`);
    } else if (key === "f") {
      event.preventDefault();
      toggleFavorite(current.id);
    } else if (key === "s") {
      event.preventDefault();
      cycleStatus(current);
    }
  }

  const shortcutRef = useRef(onShortcut);
  useEffect(() => {
    shortcutRef.current = onShortcut;
  });
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isShortcutEvent(event)) shortcutRef.current(event);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const filtered = hasActiveFilters(filters);
  const collectionId = removeFromCollection;

  let results: ReactNode = null;
  if (filters.q && items.length > 0) {
    results = (
      <p className="mb-3 text-sm text-muted">
        {pluralize(initialPage.total, "result")} for “{filters.q}”
      </p>
    );
  } else if (filtered && items.length === 0) {
    results = <p className="sr-only">No matches.</p>;
  }

  return (
    <div aria-busy={isPending || undefined} className={cx("transition-opacity duration-200", isPending && "opacity-60")}>
      <div aria-live="polite">{results}</div>

      {items.length === 0 ? (
        filtered ? (
          <EmptyState
            title={filters.q ? `No matches for “${filters.q}”.` : "Nothing matches these filters."}
            action={
              <Button size="sm" onClick={() => navigate(clearedFilters(filters))}>
                Clear filters
              </Button>
            }
          >
            {filters.q ? "Try a broader term, or clear the filters." : "Try fewer filters, or clear them."}
          </EmptyState>
        ) : (
          <EmptyState title={emptyState.title}>{emptyState.body}</EmptyState>
        )
      ) : (
        <ul className="border-b border-rule">
          {items.map((item, index) => (
            <LinkRow
              key={item.id}
              item={item}
              now={nowDate}
              selected={selection?.id === item.id}
              stalled={stalled.has(item.id)}
              retrying={retrying.has(item.id)}
              showUnsorted={showUnsorted}
              statusKey={statusKeys.get(item.id) ?? 0}
              onStatusChange={(status) => updateItem(item.id, (current) => ({ ...current, status }))}
              onFavoriteChange={(isFavorite) => {
                updateItem(item.id, (current) => ({ ...current, isFavorite }));
                setAnnouncement(isFavorite ? "Added to favorites." : "Removed from favorites.");
              }}
              onRetry={() => void retry(item)}
              onRemove={collectionId ? () => void remove(item, collectionId) : undefined}
              onKeyboardFocus={() => setSelection({ id: item.id, index })}
            />
          ))}
        </ul>
      )}

      {hasMore && items.length > 0 ? (
        <div className="mt-8 flex items-center gap-4">
          <Button size="sm" onClick={() => void loadMore()} aria-busy={loadingMore || undefined}>
            {loadingMore ? "Loading…" : "Show more"}
          </Button>
          <span className="tabular text-xs text-faint">
            {loadedCount.toLocaleString("en-US")} of {initialPage.total.toLocaleString("en-US")}
          </span>
        </div>
      ) : null}
      {loadError ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {loadError}
        </p>
      ) : null}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} canAdd={canAdd} />
    </div>
  );
}
