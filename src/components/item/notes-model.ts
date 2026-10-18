/**
 * Pure pieces of the Notes section: the optimistic list changes, the save
 * shortcut, and how a note's date line reads.
 */
import { formatDate } from "@/lib/format";
import type { Note } from "@/lib/types";

/** The server's limit (addNote/updateNote). */
export const MAX_NOTE_LENGTH = 20_000;

/** Prefix of ids given to notes shown before the server has saved them. */
const UNSAVED_PREFIX = "new:";

export type NoteChange =
  | { type: "add"; note: Note }
  | { type: "edit"; id: string; body: string; at: string }
  | { type: "remove"; id: string };

/** Applies one optimistic change to the list (newest first). */
export function applyNoteChange(current: Note[], change: NoteChange): Note[] {
  switch (change.type) {
    case "add":
      return [change.note, ...current.filter((note) => note.id !== change.note.id)];
    case "edit":
      return current.map((note) => (note.id === change.id ? { ...note, body: change.body, updatedAt: change.at } : note));
    case "remove":
      return current.filter((note) => note.id !== change.id);
  }
}

/** A note shown at once while it is being saved; it can't be edited or deleted yet. */
export function unsavedNote(linkId: string, body: string, now: Date = new Date()): Note {
  const at = now.toISOString();
  return { id: `${UNSAVED_PREFIX}${at}`, linkId, body, createdAt: at, updatedAt: at };
}

export function isUnsavedNote(note: Pick<Note, "id">): boolean {
  return note.id.startsWith(UNSAVED_PREFIX);
}

/** True for ⌘+Enter / Ctrl+Enter, the "save this text" shortcut in note fields. */
export function isSaveShortcut(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  nativeEvent: { isComposing: boolean };
}): boolean {
  return event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing;
}

/** "3 Mar 2026", plus "· edited 5 Mar 2026" once it was changed on a later day. */
export function noteDateLine(note: Pick<Note, "createdAt" | "updatedAt">): string {
  const created = formatDate(note.createdAt);
  const updated = formatDate(note.updatedAt);
  return updated && updated !== created ? `${created} · edited ${updated}` : created;
}
