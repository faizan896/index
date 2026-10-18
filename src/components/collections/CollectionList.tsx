import Link from "next/link";

import { formatDate, formatRelativeDate, pluralize } from "@/lib/format";
import type { CollectionSummary } from "@/lib/types";

/** "Today" reads "updated today" mid-sentence; dates and "3 days ago" are unchanged. */
function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

export interface CollectionListProps {
  collections: CollectionSummary[];
  /** "Now" for relative dates, from the server render. */
  now: Date;
}

/** The collections, most recently changed first: hairline-divided names, descriptions and counts. */
export function CollectionList({ collections, now }: CollectionListProps) {
  return (
    <ul className="border-b border-rule">
      {collections.map((collection) => (
        <li key={collection.id} className="border-t border-rule py-6">
          <h2 className="font-serif text-[1.375rem] leading-7 tracking-[-0.01em] text-ink">
            <Link href={`/collections/${collection.id}`} className="title-link break-words">
              {collection.name}
            </Link>
          </h2>
          {collection.description ? (
            <p className="mt-1.5 line-clamp-3 whitespace-pre-line break-words text-sm text-muted">
              {collection.description}
            </p>
          ) : null}
          <p className="tabular mt-2 text-sm text-faint">
            {pluralize(collection.linkCount, "item")} · updated{" "}
            <time dateTime={collection.updatedAt} title={formatDate(collection.updatedAt)}>
              {lowerFirst(formatRelativeDate(collection.updatedAt, now))}
            </time>
          </p>
        </li>
      ))}
    </ul>
  );
}
