"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { Button } from "@/components/ui/Button";
import { saveLink } from "@/lib/actions/links";
import { parseUserUrl } from "@/lib/core/url";
import { formatDate } from "@/lib/format";
import type { LinkListItem } from "@/lib/types";
import { settle } from "./action-result";
import { isEditableTarget, isModalOpen, isShortcutEvent, shortcutKey } from "./keyboard";
import { useLibrary } from "./LibraryProvider";

type Note =
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "saved-hidden"; link: LinkListItem }
  | { kind: "duplicate"; link: LinkListItem }
  | { kind: "error"; message: string };

/**
 * Pasting on the page (outside any field) saves only text that is plainly a
 * web address, so a stray word like "node.js" is never saved by accident.
 */
const EXPLICIT_URL = /^(?:https?:\/\/|www\.)\S/i;

/**
 * The add-link field: paste, press Enter, and the link appears at the top of
 * the list at once. "n" focuses it from anywhere, and pasting a link while
 * nothing is focused saves it directly.
 */
export function AddLinkForm() {
  const { acceptsNewItems, addItem, reveal } = useLibrary();
  const [value, setValue] = useState("");
  const [note, setNote] = useState<Note | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const noteId = useId();

  async function save(raw: string) {
    const text = raw.trim();
    if (!text) {
      inputRef.current?.focus();
      return;
    }
    const parsed = parseUserUrl(text);
    if (!parsed.ok) {
      setNote({ kind: "error", message: parsed.error });
      return;
    }

    setNote({ kind: "saving" });
    const result = await settle(saveLink(text));
    if (!result.ok) {
      setNote({ kind: "error", message: result.error });
      return;
    }

    const { link, duplicate } = result.data;
    // Clear the field only if it still holds what was saved (another link may be on its way in).
    setValue((current) => (current.trim() === text ? "" : current));
    if (duplicate) {
      reveal(link);
      setNote({ kind: "duplicate", link });
    } else if (acceptsNewItems) {
      addItem(link);
      setNote({ kind: "saved" });
    } else {
      setNote({ kind: "saved-hidden", link });
    }
  }

  // Document listeners always call the latest `save` without re-subscribing.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isShortcutEvent(event) || shortcutKey(event) !== "n") return;
      event.preventDefault();
      inputRef.current?.focus();
    }

    function onPaste(event: ClipboardEvent) {
      if (event.defaultPrevented || isEditableTarget(event.target) || isModalOpen()) return;
      const text = event.clipboardData?.getData("text/plain").trim() ?? "";
      if (!EXPLICIT_URL.test(text)) return;
      const parsed = parseUserUrl(text);
      if (!parsed.ok) return;
      event.preventDefault();
      setValue(parsed.url);
      void saveRef.current(parsed.url);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("paste", onPaste);
    };
  }, []);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save(value);
  }

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (value) {
      setValue("");
      setNote(null);
    } else {
      event.currentTarget.blur();
    }
  }

  const showHint = note === null || note.kind === "saved";

  return (
    <form onSubmit={onSubmit} className="mt-8" aria-label="Save a link">
      <label htmlFor={inputId} className="sr-only">
        Link to save
      </label>
      <div className="flex items-center gap-3 border-b border-rule transition-colors focus-within:border-ink">
        <input
          ref={inputRef}
          id={inputId}
          name="url"
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder="Paste a link to save something…"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (note && note.kind !== "saving") setNote(null);
          }}
          onKeyDown={onInputKeyDown}
          aria-describedby={noteId}
          aria-invalid={note?.kind === "error" || undefined}
          className="h-12 min-w-0 flex-1 bg-transparent text-[1.0625rem] text-ink outline-none focus-visible:outline-none"
        />
        <Button type="submit" size="sm" variant="secondary">
          Save
        </Button>
      </div>
      <div className="mt-2 min-h-5">
        <div id={noteId} aria-live="polite" className="text-sm">
          <NoteText note={note} />
        </div>
        {showHint ? (
          <p className="hidden text-xs text-faint md:block">Press N to add · / to search · ? for shortcuts</p>
        ) : null}
      </div>
    </form>
  );
}

function NoteText({ note }: { note: Note | null }) {
  if (!note) return null;
  switch (note.kind) {
    case "saving":
      return <p className="text-muted">Saving…</p>;
    case "saved":
      return <p className="sr-only">Saved.</p>;
    case "saved-hidden":
      return (
        <p className="text-muted">
          Saved. The current filters hide it.{" "}
          <Link href={`/item/${note.link.id}`} className="link text-ink">
            Open
          </Link>
        </p>
      );
    case "duplicate":
      return (
        <p className="text-muted">
          Already in your library — saved {formatDate(note.link.createdAt)}.{" "}
          <Link href={`/item/${note.link.id}`} className="link text-ink">
            Open
          </Link>
        </p>
      );
    case "error":
      return <p className="text-danger">{note.message}</p>;
  }
}
