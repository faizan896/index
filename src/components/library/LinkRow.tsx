"use client";

import Link from "next/link";
import { Fragment, type FocusEvent, type ReactNode } from "react";

import { FavoriteButton } from "@/components/link/FavoriteButton";
import { StatusMenu } from "@/components/link/StatusMenu";
import { ArrowUpRightIcon } from "@/components/ui/Icons";
import { cx } from "@/lib/cx";
import { displaySource, displayTitle, formatDate, formatReadingTime, formatRelativeDate } from "@/lib/format";
import type { LinkListItem, ReadingStatus } from "@/lib/types";

/** DOM id of a row, for scrolling to it. */
export function rowId(linkId: string): string {
  return `link-${linkId}`;
}

/** DOM id of a row's title link, which keyboard selection focuses. */
export function rowTitleId(linkId: string): string {
  return `link-title-${linkId}`;
}

/** Descriptions longer than this are left out on phones, where they'd crowd the list. */
const LONG_DESCRIPTION = 140;

export interface LinkRowProps {
  item: LinkListItem;
  /** "Now" for relative dates: the server render time, so server and browser agree. */
  now: Date;
  /** Keyboard selection (j/k): a faint wash behind the row. */
  selected: boolean;
  /** Polling gave up while the item was still being processed. */
  stalled: boolean;
  retrying: boolean;
  /** Says "Unsorted" when the item has no categories (redundant on the Unsorted page). */
  showUnsorted: boolean;
  /** Changes when the status was changed from the keyboard, to reset the menu's local state. */
  statusKey: number;
  onStatusChange: (status: ReadingStatus) => void;
  onFavoriteChange: (isFavorite: boolean) => void;
  onRetry: () => void;
  /** Present on collection pages: removes the item from that collection. */
  onRemove?: () => void;
  /** Keyboard focus moved into the row. */
  onKeyboardFocus: () => void;
}

function isFocusVisible(target: EventTarget): boolean {
  try {
    return target instanceof Element && target.matches(":focus-visible");
  } catch {
    return false;
  }
}

/** One item in the library list: the title first, then a quiet line of facts and controls. */
export function LinkRow({
  item,
  now,
  selected,
  stalled,
  retrying,
  showUnsorted,
  statusKey,
  onStatusChange,
  onFavoriteChange,
  onRetry,
  onRemove,
  onKeyboardFocus,
}: LinkRowProps) {
  const fetching = !stalled && (item.metadataStatus === "pending" || item.metadataStatus === "processing");
  const fetchFailed = !item.title?.trim() && (stalled || item.metadataStatus === "failed");
  const classifying = item.classificationStatus === "pending" || item.classificationStatus === "processing";
  const sorting = classifying && !fetching && !stalled;
  const title = displayTitle(item);
  const description = item.description?.trim();
  const readingTime = formatReadingTime(item.readingMinutes);

  const facts: Array<{ key: string; node: ReactNode }> = [
    {
      key: "source",
      node: (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          title={item.domain}
          className="transition-colors hover:text-ink"
        >
          {displaySource(item)}
          <ArrowUpRightIcon className="ml-0.5 inline size-3 align-[-1px] text-faint" />
          <span className="sr-only"> (opens the original in a new tab)</span>
        </a>
      ),
    },
  ];

  if (item.categories.length > 0) {
    facts.push({
      key: "categories",
      node: (
        <span>
          {item.categories.map((category, index) => (
            <Fragment key={category.id}>
              {index > 0 ? ", " : null}
              <Link href={`/categories/${category.slug}`} prefetch={false} className="transition-colors hover:text-ink">
                {category.name}
              </Link>
            </Fragment>
          ))}
        </span>
      ),
    });
  } else if (sorting) {
    facts.push({ key: "categories", node: <span className="text-faint">Sorting…</span> });
  } else if (showUnsorted && !classifying) {
    facts.push({
      key: "categories",
      node: (
        <Link href="/unsorted" prefetch={false} className="text-faint transition-colors hover:text-ink">
          Unsorted
        </Link>
      ),
    });
  }

  facts.push({
    key: "saved",
    node: (
      <time dateTime={item.createdAt} title={`Saved ${formatDate(item.createdAt)}`} className="whitespace-nowrap">
        {formatRelativeDate(item.createdAt, now)}
      </time>
    ),
  });
  if (readingTime) facts.push({ key: "reading", node: <span className="whitespace-nowrap">{readingTime}</span> });

  return (
    <li
      id={rowId(item.id)}
      aria-current={selected ? "true" : undefined}
      onFocus={(event: FocusEvent<HTMLLIElement>) => {
        if (isFocusVisible(event.target)) onKeyboardFocus();
      }}
      className="relative scroll-mb-8 scroll-mt-20 border-t border-rule md:scroll-mt-8"
    >
      {selected ? <span aria-hidden="true" className="absolute inset-y-0 -inset-x-2 bg-wash sm:-inset-x-4" /> : null}
      <div className="relative flex items-start gap-4 py-5">
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-title text-ink">
            <Link id={rowTitleId(item.id)} href={`/item/${item.id}`} prefetch={false} className="title-link break-words">
              {title}
            </Link>
          </h2>

          {fetching ? <p className="mt-0.5 animate-pulse-soft text-sm text-faint">Fetching details…</p> : null}
          {fetchFailed ? (
            <p className="mt-0.5 text-sm text-muted">
              Couldn&apos;t fetch details.{" "}
              <button
                type="button"
                onClick={onRetry}
                disabled={retrying}
                aria-label={retrying ? undefined : `Try fetching details for ${title} again`}
                className="link text-ink disabled:no-underline disabled:opacity-60"
              >
                {retrying ? "Trying again…" : "Try again"}
              </button>
            </p>
          ) : null}

          {description ? (
            <p
              className={cx(
                "mt-1.5 line-clamp-2 break-words text-sm text-muted",
                description.length > LONG_DESCRIPTION && "hidden sm:block",
              )}
            >
              {description}
            </p>
          ) : null}

          <div className="mt-2 break-words text-sm leading-6 text-muted">
            {facts.map((fact, index) => (
              <Fragment key={fact.key}>
                {index > 0 ? <Separator /> : null}
                {fact.node}
              </Fragment>
            ))}
            {/* Controls start their own line on phones so the status menu opens fully on screen. */}
            <span className="block sm:inline">
              <Separator className="hidden sm:inline" />
              <StatusMenu
                key={statusKey}
                linkId={item.id}
                status={item.status}
                onChange={onStatusChange}
                className="-my-1.5 py-1.5"
              />
              {onRemove ? (
                <>
                  <Separator />
                  <button
                    type="button"
                    onClick={onRemove}
                    aria-label={`Remove ${title} from this collection`}
                    className="transition-colors hover:text-ink"
                  >
                    Remove
                  </button>
                </>
              ) : null}
            </span>
          </div>
        </div>

        <span data-favorite="" className="flex shrink-0 pt-[5px]">
          <FavoriteButton
            linkId={item.id}
            isFavorite={item.isFavorite}
            onChange={onFavoriteChange}
            className="-m-2 p-2"
          />
        </span>
      </div>
    </li>
  );
}

function Separator({ className }: { className?: string }) {
  return (
    <span className={className}>
      {" "}
      <span aria-hidden="true" className="mx-0.5 text-faint">
        ·
      </span>{" "}
    </span>
  );
}
