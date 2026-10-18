"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";

export interface InlineConfirmProps {
  /** The question, e.g. "Delete this collection? The articles stay in your library." */
  message: ReactNode;
  confirmLabel: string;
  /** Shown on the confirm button while the action runs. */
  pendingLabel: string;
  /** "danger" for deletions, "primary" for changes that keep the data (merging). */
  tone: "danger" | "primary";
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /**
   * Moves focus to the question when it appears, so a screen reader reads it
   * first. Off when the confirmation follows a choice the user is still
   * making (a select changed with the arrow keys).
   */
  autoFocus?: boolean;
}

/** A one-line confirmation that replaces a dialog: the question, then Confirm and Cancel. Escape cancels. */
export function InlineConfirm({
  message,
  confirmLabel,
  pendingLabel,
  tone,
  pending,
  onConfirm,
  onCancel,
  autoFocus = true,
}: InlineConfirmProps) {
  const messageId = useId();
  const messageRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (autoFocus) messageRef.current?.focus();
  }, [autoFocus]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || pending) return;
    event.preventDefault();
    event.stopPropagation();
    onCancel();
  }

  return (
    <div
      role="group"
      aria-labelledby={messageId}
      onKeyDown={onKeyDown}
      className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1"
    >
      <p id={messageId} ref={messageRef} tabIndex={-1} className="break-words text-sm text-ink outline-none">
        {message}
      </p>
      <div className="flex items-center gap-2">
        <Button variant={tone} size={tone === "primary" ? "sm" : "md"} pending={pending} onClick={onConfirm}>
          {pending ? pendingLabel : confirmLabel}
        </Button>
        <Button variant="quiet" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
