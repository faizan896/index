"use client";

import type { ReactNode, Ref } from "react";

import { asSentence } from "./item-format";
import type { ItemProcessing } from "./useItemProcessing";

export interface ProcessingNoticeProps {
  processing: ItemProcessing;
  /** Reading the page failed and nothing has been filled in by hand yet. */
  failed: boolean;
  /** Why reading the page failed (metadataError), in a sentence. */
  reason: string | null;
  onEdit: () => void;
  /** The notice's own "Edit details" button, so focus can return to it. */
  editButtonRef: Ref<HTMLButtonElement>;
}

/**
 * One quiet line about background work under the header: "Fetching
 * details…", "Sorting into categories…", or a calm note with "Try again" when
 * the page couldn't be read. Categorizing that was skipped (AI off or not
 * configured) says nothing here; the item simply shows as Unsorted.
 */
export function ProcessingNotice({ processing, failed, reason, onEdit, editButtonRef }: ProcessingNoticeProps) {
  const { phase, stalled, retrying, retry } = processing;
  let content: ReactNode = null;

  if (retrying) {
    content = <p className="animate-pulse-soft text-faint">Trying again…</p>;
  } else if (failed && phase !== "fetching") {
    const why = asSentence(reason);
    content = (
      <>
        <p className="text-muted">
          Index couldn&apos;t read this page.{why ? ` ${why}` : ""} You can add the details yourself.
        </p>
        <p className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
          <button type="button" onClick={retry} className="link text-ink">
            Try again
          </button>
          <button ref={editButtonRef} type="button" onClick={onEdit} className="link text-ink">
            Edit details
          </button>
        </p>
      </>
    );
  } else if (stalled) {
    content = (
      <p className="text-muted">
        This is taking longer than usual.{" "}
        <button type="button" onClick={retry} className="link text-ink">
          Try again
        </button>
      </p>
    );
  } else if (phase === "fetching") {
    content = <p className="animate-pulse-soft text-faint">Fetching details…</p>;
  } else if (phase === "sorting") {
    content = <p className="animate-pulse-soft text-faint">Sorting into categories…</p>;
  }

  return (
    <div aria-live="polite" className="text-sm">
      {content ? <div className="mt-6">{content}</div> : null}
    </div>
  );
}
