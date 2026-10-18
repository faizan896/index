"use client";

import { Fragment, useEffect, useRef, useState } from "react";

import { FavoriteButton } from "@/components/link/FavoriteButton";
import { StatusMenu } from "@/components/link/StatusMenu";
import { Button } from "@/components/ui/Button";
import { ArrowUpRightIcon } from "@/components/ui/Icons";
import { displayTitle } from "@/lib/format";
import type { LinkDetail } from "@/lib/types";
import { DeleteItem } from "./DeleteItem";
import { EditDetailsForm } from "./EditDetailsForm";
import { itemMetaParts } from "./item-format";
import { Dot } from "./ItemSection";
import { ProcessingNotice } from "./ProcessingNotice";
import { useItemProcessing } from "./useItemProcessing";

export type ItemHeaderLink = Pick<
  LinkDetail,
  | "id"
  | "url"
  | "domain"
  | "title"
  | "description"
  | "author"
  | "siteName"
  | "publishedAt"
  | "readingMinutes"
  | "status"
  | "isFavorite"
  | "metadataStatus"
  | "classificationStatus"
  | "metadataError"
>;

type EditTrigger = "actions" | "notice";

/**
 * The top of the detail page: title, meta line, description, the action row
 * and the processing notice. "Edit details" swaps all of it for an inline
 * form; leaving the form puts focus back on the button that opened it.
 */
export function ItemHeader({ link }: { link: ItemHeaderLink }) {
  const processing = useItemProcessing(link);
  const [editing, setEditing] = useState(false);
  const openedFrom = useRef<EditTrigger | null>(null);
  const actionsEditRef = useRef<HTMLButtonElement>(null);
  const noticeEditRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (editing || !openedFrom.current) return;
    const target = (openedFrom.current === "notice" ? noticeEditRef.current : null) ?? actionsEditRef.current;
    openedFrom.current = null;
    target?.focus();
  }, [editing]);

  function startEditing(from: EditTrigger) {
    openedFrom.current = from;
    setEditing(true);
  }

  const title = displayTitle(link);

  if (editing) {
    return (
      <header className="mt-8">
        <h1 className="sr-only">{title}</h1>
        <EditDetailsForm link={link} onDone={() => setEditing(false)} />
      </header>
    );
  }

  const meta = itemMetaParts(link);
  const description = link.description?.trim();
  // Once the reader has filled in a title themselves, the failure is no longer worth mentioning.
  const failed = link.metadataStatus === "failed" && !link.title?.trim();

  return (
    <header className="mt-8">
      {/* One unitless leading for every size: the display tokens' own line heights defer to it. */}
      <h1 className="text-balance break-words font-serif text-[1.875rem] leading-[1.18] font-normal tracking-[-0.012em] text-ink sm:text-display lg:text-hero">
        {title}
      </h1>
      <p className="mt-3 break-words text-sm text-muted">
        {meta.map((part, index) => (
          <Fragment key={index}>
            {index > 0 ? <Dot /> : null}
            <span>{part}</span>
          </Fragment>
        ))}
      </p>
      {description ? (
        <p className="mt-5 whitespace-pre-line break-words text-base leading-relaxed text-ink-soft">{description}</p>
      ) : null}

      <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] border border-rule-strong bg-paper px-3.5 text-sm font-medium text-ink transition-colors duration-100 hover:border-ink"
        >
          Open original
          <ArrowUpRightIcon className="size-3.5" />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        <StatusMenu linkId={link.id} status={link.status} className="h-8" />
        <FavoriteButton linkId={link.id} isFavorite={link.isFavorite} withLabel className="h-8" />
        <Button ref={actionsEditRef} variant="quiet" className="text-sm" onClick={() => startEditing("actions")}>
          Edit details
        </Button>
        <DeleteItem linkId={link.id} />
      </div>

      <ProcessingNotice
        processing={processing}
        failed={failed}
        reason={link.metadataError}
        onEdit={() => startEditing("notice")}
        editButtonRef={noticeEditRef}
      />
    </header>
  );
}
