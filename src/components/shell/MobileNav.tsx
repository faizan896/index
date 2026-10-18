"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import type { CategorySummary, LibraryStats } from "@/lib/types";
import { SidebarNav } from "./SidebarNav";
import { Wordmark } from "./Wordmark";

export interface MobileNavProps {
  categories: ReadonlyArray<Pick<CategorySummary, "id" | "name" | "slug" | "linkCount">>;
  stats: Pick<LibraryStats, "unread" | "unsorted">;
}

/**
 * Phones: a slim top bar (wordmark, "Menu") that opens the navigation as a
 * full-screen sheet. The sheet is a native modal dialog, so focus stays inside
 * it and Escape closes it; it also closes on navigation and locks page scroll.
 */
export function MobileNav({ categories, stats }: MobileNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState(pathname);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sheetId = useId();

  // Following a link closes the sheet.
  if (pathname !== path) {
    setPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }
    if (!dialog.open) dialog.showModal();
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // The sheet is phone-only; widening the window past it closes it.
  useEffect(() => {
    if (!open) return;
    const wide = window.matchMedia("(min-width: 48rem)");
    const onChange = () => {
      if (wide.matches) setOpen(false);
    };
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-rule bg-paper px-4 md:hidden">
        <Wordmark />
        <button
          ref={menuButtonRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={sheetId}
          onClick={() => setOpen(true)}
          className="-mr-1 h-8 px-1 text-sm text-muted transition-colors hover:text-ink"
        >
          Menu
        </button>
      </header>

      <dialog
        ref={dialogRef}
        id={sheetId}
        aria-label="Menu"
        onClose={() => {
          setOpen(false);
          if (!document.activeElement || document.activeElement === document.body) menuButtonRef.current?.focus();
        }}
        className="m-0 h-full max-h-none w-full max-w-none overflow-y-auto overscroll-contain border-0 bg-paper p-0 text-ink backdrop:bg-paper md:hidden"
      >
        {open ? (
          <>
            <div className="flex h-14 items-center justify-between border-b border-rule px-4">
              <Wordmark onNavigate={close} />
              <button
                ref={closeButtonRef}
                type="button"
                onClick={close}
                className="-mr-1 h-8 px-1 text-sm text-muted transition-colors hover:text-ink"
              >
                Close
              </button>
            </div>
            <div className="px-4 pb-16 pt-8">
              <SidebarNav categories={categories} stats={stats} variant="sheet" onNavigate={close} />
            </div>
          </>
        ) : null}
      </dialog>
    </>
  );
}
