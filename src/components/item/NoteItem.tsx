"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";

import { settle } from "@/components/library/action-result";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { deleteNote, updateNote } from "@/lib/actions/notes";
import { formatDate } from "@/lib/format";
import type { Note } from "@/lib/types";
import { isSaveShortcut, isUnsavedNote, MAX_NOTE_LENGTH, noteEditedDate, type NoteChange } from "./notes-model";
import { useAutosize } from "./useAutosize";

const EMPTY_NOTE = "A note can't be empty. Delete it instead.";

type Mode = "view" | "edit" | "confirm-delete";

export interface NoteItemProps {
  note: Note;
  /** The Notes section's optimistic update; called inside this item's transitions. */
  onChange: (change: NoteChange) => void;
  /** Called as the note is deleted, so focus has somewhere to go. */
  onDeleted: () => void;
}

/**
 * One note: its text and date, with quiet Edit (in place; ⌘/Ctrl+Enter saves,
 * Escape cancels) and Delete (with an inline confirmation). Both show at once
 * and put things back, with a message, if the save fails.
 */
export function NoteItem({ note, onChange, onDeleted }: NoteItemProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("view");
  const [draft, setDraft] = useState(note.body);
  // Whether opening the editor should take focus (not when it reopens by itself after a failed save).
  const [focusEditor, setFocusEditor] = useState(true);
  const [, startSaving] = useTransition();
  const editRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<"edit" | "delete" | null>(null);
  const id = useId();
  const bodyId = `${id}-body`;
  const questionId = `${id}-question`;
  const date = formatDate(note.createdAt);
  const edited = noteEditedDate(note);

  useEffect(() => {
    if (mode === "confirm-delete") {
      cancelDeleteRef.current?.focus();
    } else if (mode === "view" && returnFocus.current) {
      (returnFocus.current === "edit" ? editRef : deleteRef).current?.focus();
      returnFocus.current = null;
    }
  }, [mode]);

  function openEditor() {
    setDraft(note.body);
    setFocusEditor(true);
    setMode("edit");
  }

  function close(from: "edit" | "delete") {
    returnFocus.current = from;
    setMode("view");
  }

  function save(text: string) {
    close("edit");
    if (text === note.body) return;
    startSaving(async () => {
      onChange({ type: "edit", id: note.id, body: text, at: new Date().toISOString() });
      const result = await settle(updateNote(note.id, text));
      if (!result.ok) {
        toast(result.error, { tone: "error" });
        // Give the words back rather than lose them; take focus only if it hasn't moved on since saving.
        const active = document.activeElement;
        setDraft(text);
        setFocusEditor(!active || active === document.body || active === editRef.current);
        setMode("edit");
      }
    });
  }

  function remove() {
    onDeleted();
    startSaving(async () => {
      onChange({ type: "remove", id: note.id });
      const result = await settle(deleteNote(note.id));
      if (!result.ok) toast(result.error, { tone: "error" });
    });
  }

  function onConfirmKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    close("delete");
  }

  if (mode === "edit") {
    return (
      <li>
        <NoteEditor
          label={date ? `Edit note from ${date}` : "Edit note"}
          initial={draft}
          autoFocus={focusEditor}
          onSave={save}
          onCancel={() => close("edit")}
        />
      </li>
    );
  }

  const unsaved = isUnsavedNote(note);

  return (
    <li>
      <p id={bodyId} className="whitespace-pre-wrap break-words text-base text-ink">
        {note.body}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 text-xs">
        <span className="tabular text-faint">
          <time dateTime={note.createdAt}>{date}</time>
          {edited ? ` · edited ${edited}` : null}
        </span>
        {unsaved ? (
          <span className="animate-pulse-soft text-faint">Saving…</span>
        ) : mode === "view" ? (
          <span className="flex items-center gap-1">
            <Button
              ref={editRef}
              variant="quiet"
              size="sm"
              className="text-xs"
              onClick={openEditor}
              aria-label={date ? `Edit note from ${date}` : "Edit note"}
            >
              Edit
            </Button>
            <Button
              ref={deleteRef}
              variant="quiet"
              size="sm"
              className="text-xs"
              onClick={() => setMode("confirm-delete")}
              aria-label={date ? `Delete note from ${date}` : "Delete note"}
            >
              Delete
            </Button>
          </span>
        ) : null}
      </div>

      {mode === "confirm-delete" ? (
        <div
          role="group"
          aria-labelledby={questionId}
          aria-describedby={bodyId}
          onKeyDown={onConfirmKeyDown}
          className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
        >
          <p id={questionId} className="text-ink-soft">
            Delete this note?
          </p>
          <span className="flex items-center gap-2">
            <Button variant="danger" size="sm" onClick={remove}>
              Delete
            </Button>
            <Button ref={cancelDeleteRef} variant="quiet" size="sm" onClick={() => close("delete")}>
              Cancel
            </Button>
          </span>
        </div>
      ) : null}
    </li>
  );
}

interface NoteEditorProps {
  label: string;
  initial: string;
  autoFocus: boolean;
  onSave: (text: string) => void;
  onCancel: () => void;
}

/** The in-place editor: a growing textarea with Save and Cancel. */
function NoteEditor({ label, initial, autoFocus, onSave, onCancel }: NoteEditorProps) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const fieldId = `${id}-field`;
  const errorId = `${id}-error`;
  useAutosize(textareaRef, value);

  useEffect(() => {
    if (!autoFocus) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    // Continue where the note ends, not at its start.
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, [autoFocus]);

  function submit() {
    const text = value.trim();
    if (!text) {
      setError(EMPTY_NOTE);
      textareaRef.current?.focus();
      return;
    }
    onSave(text);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (isSaveShortcut(event)) {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onCancel();
    }
  }

  return (
    <form onSubmit={onSubmit} aria-label={label}>
      <label htmlFor={fieldId} className="sr-only">
        {label}
      </label>
      <TextArea
        ref={textareaRef}
        id={fieldId}
        rows={3}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
        onKeyDown={onKeyDown}
        maxLength={MAX_NOTE_LENGTH}
        aria-keyshortcuts="Meta+Enter Control+Enter"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      <div aria-live="polite">
        {error ? (
          <p id={errorId} className="mt-1.5 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <Button type="submit" size="sm">
          Save
        </Button>
        <Button variant="quiet" size="sm" className="text-xs" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
