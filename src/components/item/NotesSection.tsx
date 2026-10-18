"use client";

import { useId, useOptimistic, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";

import { settle } from "@/components/library/action-result";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { addNote } from "@/lib/actions/notes";
import type { Note } from "@/lib/types";
import { ItemSection } from "./ItemSection";
import { NoteItem } from "./NoteItem";
import { applyNoteChange, isSaveShortcut, MAX_NOTE_LENGTH, unsavedNote } from "./notes-model";
import { useAutosize } from "./useAutosize";

/** A composer ("Add a note…", ⌘/Ctrl+Enter saves) above the item's notes, newest first. */
export function NotesSection({ linkId, notes }: { linkId: string; notes: Note[] }) {
  const { toast } = useToast();
  const [shown, changeNotes] = useOptimistic(notes, applyNoteChange);
  const [draft, setDraft] = useState("");
  const [, startSaving] = useTransition();
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const composerId = useId();
  const hintId = `${composerId}-hint`;
  useAutosize(composerRef, draft);

  function add() {
    const body = draft.trim();
    if (!body) {
      composerRef.current?.focus();
      return;
    }
    setDraft("");
    startSaving(async () => {
      changeNotes({ type: "add", note: unsavedNote(linkId, body) });
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
          aria-describedby={hintId}
        />
        <div className="mt-2 flex items-center gap-3">
          <Button type="submit" size="sm" disabled={!draft.trim()}>
            Save note
          </Button>
          <span id={hintId} className="hidden text-xs text-muted sm:inline">
            ⌘ or Ctrl + Enter saves
          </span>
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
