"use client";

import { useEffect, useId, useRef } from "react";

import { Button } from "@/components/ui/Button";

interface Shortcut {
  keys: string[];
  label: string;
}

const ADD_SHORTCUTS: Shortcut[] = [
  { keys: ["N"], label: "Add a link" },
  { keys: ["⌘V"], label: "Paste a link anywhere to save it" },
];

const LIST_SHORTCUTS: Shortcut[] = [
  { keys: ["/"], label: "Search" },
  { keys: ["J", "K"], label: "Next and previous item" },
  { keys: ["Enter", "O"], label: "Open the selected item" },
  { keys: ["F"], label: "Favorite or unfavorite" },
  { keys: ["S"], label: "Change reading status" },
  { keys: ["Esc"], label: "Clear the search, or close" },
  { keys: ["?"], label: "Show these shortcuts" },
];

export interface ShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
  /** Include the add-link shortcuts (only the library page has the add field). */
  canAdd: boolean;
}

/** The "?" dialog. A native modal dialog: focus stays inside, Escape and the backdrop close it. */
export function ShortcutsHelp({ open, onClose, canAdd }: ShortcutsHelpProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const shortcuts = canAdd ? [...ADD_SHORTCUTS, ...LIST_SHORTCUTS] : LIST_SHORTCUTS;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // A click on the dialog element itself is a click on the backdrop.
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className="m-auto w-[min(26rem,calc(100%-2rem))] max-w-none rounded-[var(--radius-control)] border border-rule-strong bg-paper p-0 text-ink shadow-[0_12px_40px_-16px_rgba(0,0,0,0.25)] backdrop:bg-ink/10"
    >
      <div className="px-6 pb-6 pt-5">
        <div className="flex items-center justify-between gap-4">
          <h2 id={titleId} className="font-serif text-title">
            Keyboard shortcuts
          </h2>
          <Button variant="quiet" size="sm" onClick={() => dialogRef.current?.close()}>
            Close
          </Button>
        </div>
        <dl className="mt-4 border-t border-rule text-sm">
          {shortcuts.map((shortcut) => (
            <div key={shortcut.label} className="flex items-center justify-between gap-6 border-b border-rule py-2.5">
              <dt className="text-ink-soft">{shortcut.label}</dt>
              <dd className="flex shrink-0 items-center gap-1.5">
                {shortcut.keys.map((key) => (
                  <kbd
                    key={key}
                    className="inline-flex h-6 min-w-6 items-center justify-center rounded-[var(--radius-control)] border border-rule-strong px-1.5 font-sans text-xs text-ink"
                  >
                    {key}
                  </kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </dialog>
  );
}
