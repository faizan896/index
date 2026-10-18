"use client";

import { useId, useOptimistic, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";

import { settle } from "@/components/library/action-result";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { addNote } from "@/lib/actions/notes";
import type { Note } from "@/lib/types";
import { ItemSection } from "./ItemSection";
import { NoteItem, type NoteChange } from "./NoteItem";
import { useAutosize } from "./useAutosize";

/** The server's limit (addNote/updateNote). */
export const MAX_NOTE_LENGTH = 20_000;

function applyNoteChange(current: Note[], change: NoteChange): Note[] {
  switch (change.type) {
    case "add":
      return [change.note, ...current];
    case "edit":
      return current.map((note) => (note.id === change.id ? { ...note, body: change.body, updatedAt: change.at } : note));
    case "remove":
      return current.filter((note) => note.id !== change.id);
  }
}

/** True for ⌘+Enter / Ctrl+Enter, the "save this text" shortcut in note fields. */
export function isSaveShortcut(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  return event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing;
}

/** A composer ("Add a note…", ⌘/Ctrl+Enter saves) above the item's notes, newest first. */
export function NotesSection({ linkId, notes }: { linkId: string; notes: Note[] }) {
  const { toast } = useToast();
  const [shown, changeNotes] = useOptimistic(notes, applyNoteChange);
  const [draft, setDraft] = useState("");
  const [, startSaving] = useTransition();
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const composerId = useId();
  useAutosize(composerRef, draft);

  function add() {
    const body = draft.trim();
    if (!body) {
      composerRef.current?.focus();
      return;
    }
    setDraft("");
    startSaving(async () => {
      const now = new Date().toISOString();
      changeNotes({ type: "add", note: { id: `new:${now}`, linkId, body, createdAt: now, updatedAt: now } });
      const result = await settle(addNote(linkId, body));
      if (!result.ok) {
        toast(result.error, { tone: "error" });
        // Give the words back, unless a new note has been started meanwhile.
        setDraft((current) => current || body);
      }
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    add();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!isSaveShortcut(event)) return;
    event.preventDefault();
    add();
  }

  return (
    <ItemSection id="item-notes" title="Notes">
      <form onSubmit={onSubmit} aria-label="Add a note">
        <label htmlFor={composerId} className="sr-only">
          Add a note
        </label>
        <TextArea
          ref={composerRef}
          id={composerId}
          rows={3}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Add a note…"
          maxLength={MAX_NOTE_LENGTH}
          aria-keyshortcuts="Meta+Enter Control+Enter"
        />
        <div className="mt-2 flex items-center gap-3">
          <Button type="submit" size="sm" disabled={!draft.trim()}>
            Save note
          </Button>
          <span className="hidden text-xs text-muted sm:inline">⌘ or Ctrl + Enter</span>
        </div>
      </form>

      {shown.length > 0 ? (
        <ol aria-label="Notes, newest first" className="mt-8 space-y-7">
          {shown.map((note) => (
            <NoteItem key={note.id} note={note} onChange={changeNotes} onDeleted={() => composerRef.current?.focus()} />
          ))}
        </ol>
      ) : null}
    </ItemSection>
  );
}
