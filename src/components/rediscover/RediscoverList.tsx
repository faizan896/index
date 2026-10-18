import Link from "next/link";

import { FavoriteButton } from "@/components/link/FavoriteButton";
import { StatusMenu } from "@/components/link/StatusMenu";
import { ArrowUpRightIcon } from "@/components/ui/Icons";
import { displaySource, displayTitle, formatAge, formatDate, formatReadingTime } from "@/lib/format";
import type { RediscoverPick } from "@/lib/types";

/** Why a pick is on the page, in one quiet line. */
function reason(pick: RediscoverPick, now: Date): string {
  switch (pick.kind) {
    case "forgotten": {
      const saved = `Saved ${formatAge(pick.link.createdAt, now)} ago`;
      return pick.link.status === "unread" ? `${saved} · still unread` : saved;
    }
    case "favorite":
      return "One of your favorites";
    case "random":
      return "From the archive";
  }
}

function Dot() {
  return (
    <span aria-hidden="true" className="mx-1.5 text-faint">
      ·
    </span>
  );
}

function Pick({ pick, now }: { pick: RediscoverPick; now: Date }) {
  const { link } = pick;
  const titleId = `pick-${link.id}`;
  const description = link.description?.trim();
  const readingTime = formatReadingTime(link.readingMinutes);

  return (
    <li className="border-t border-rule py-9 sm:py-10">
      <article aria-labelledby={titleId}>
        <p className="label">{reason(pick, now)}</p>
        <h2 id={titleId} className="mt-3 font-serif text-[1.625rem] leading-8 tracking-[-0.012em] text-ink">
          <Link href={`/item/${link.id}`} prefetch={false} className="title-link break-words">
            {displayTitle(link)}
          </Link>
        </h2>
        <p className="mt-2 break-words text-sm text-muted">
          <span title={link.domain}>{displaySource(link)}</span>
          {readingTime ? (
            <>
              <Dot />
              <span className="whitespace-nowrap">{readingTime}</span>
            </>
          ) : null}
          <span className="sr-only">, saved {formatDate(link.createdAt)}</span>
        </p>
        {description ? (
          <p className="mt-3 line-clamp-3 max-w-prose break-words text-base text-muted">{description}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="-my-1.5 inline-flex items-center gap-0.5 py-1.5 text-muted transition-colors hover:text-ink"
          >
            Open original
            <ArrowUpRightIcon className="size-3 text-faint" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <StatusMenu linkId={link.id} status={link.status} className="-my-1.5 py-1.5" />
          <FavoriteButton linkId={link.id} isFavorite={link.isFavorite} className="-my-1.5 py-1.5" />
        </div>
      </article>
    </li>
  );
}

export interface RediscoverListProps {
  picks: RediscoverPick[];
  /** "Now" for the "Saved 14 months ago" line, from the server render. */
  now: Date;
}

/** The day's picks: calm blocks divided by hairlines, each saying why it's here. */
export function RediscoverList({ picks, now }: RediscoverListProps) {
  return (
    <ul className="border-b border-rule">
      {picks.map((pick) => (
        <Pick key={`${pick.kind}-${pick.link.id}`} pick={pick} now={now} />
      ))}
    </ul>
  );
}
