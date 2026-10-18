import Link from "next/link";

import { displaySource, displayTitle } from "@/lib/format";
import type { RelatedLink } from "@/lib/types";
import { sharedNames } from "./item-format";
import { Dot, ItemSection } from "./ItemSection";

const MAX_ROWS = 6;

/**
 * Other items that share categories or tags with this one, each with what
 * they share. Renders nothing when there are none: no empty-state noise.
 */
export function RelatedReads({ related }: { related: RelatedLink[] }) {
  const rows = related.slice(0, MAX_ROWS);
  if (rows.length === 0) return null;

  return (
    <ItemSection id="item-related" title="Related reads">
      <ul className="space-y-4">
        {rows.map((link) => {
          const shared = sharedNames(link);
          return (
            <li key={link.id} className="min-w-0">
              <Link
                href={`/item/${link.id}`}
                prefetch={false}
                className="title-link break-words font-serif text-[1.0625rem] leading-snug text-ink"
              >
                {displayTitle(link)}
              </Link>
              <p className="mt-0.5 break-words text-sm text-muted">
                <span>{displaySource(link)}</span>
                {shared.length > 0 ? (
                  <>
                    <Dot />
                    <span>shared: {shared.join(", ")}</span>
                  </>
                ) : null}
              </p>
            </li>
          );
        })}
      </ul>
    </ItemSection>
  );
}
