import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Note } from "@/lib/types";
import { applyNoteChange, isSaveShortcut, isUnsavedNote, noteEditedDate, unsavedNote } from "./notes-model";

function note(id: string, body: string, createdAt = "2026-03-03T10:00:00Z"): Note {
  return { id, linkId: "link", body, createdAt, updatedAt: createdAt };
}

describe("applyNoteChange", () => {
  const notes = [note("b", "Second"), note("a", "First")];

  it("puts a new note first", () => {
    const fresh = note("c", "Third");
    assert.deepEqual(
      applyNoteChange(notes, { type: "add", note: fresh }).map((entry) => entry.id),
      ["c", "b", "a"],
    );
  });

  it("edits a note in place", () => {
    const edited = applyNoteChange(notes, { type: "edit", id: "a", body: "Revised", at: "2026-03-05T00:00:00Z" });
    assert.deepEqual(
      edited.map((entry) => [entry.id, entry.body, entry.updatedAt]),
      [
        ["b", "Second", "2026-03-03T10:00:00Z"],
        ["a", "Revised", "2026-03-05T00:00:00Z"],
      ],
    );
  });

  it("removes a note", () => {
    assert.deepEqual(
      applyNoteChange(notes, { type: "remove", id: "b" }).map((entry) => entry.id),
      ["a"],
    );
  });
});

describe("unsavedNote", () => {
  it("is marked as not yet saved", () => {
    const draft = unsavedNote("link", "Hello", new Date("2026-03-03T10:00:00Z"));
    assert.equal(draft.body, "Hello");
    assert.equal(draft.createdAt, "2026-03-03T10:00:00.000Z");
    assert.ok(isUnsavedNote(draft));
    assert.ok(!isUnsavedNote(note("6f1c1f0e-1111-4c1d-9e2a-000000000000", "Saved")));
  });
});

describe("isSaveShortcut", () => {
  const key = (overrides: Partial<{ key: string; metaKey: boolean; ctrlKey: boolean; isComposing: boolean }>) => ({
    key: overrides.key ?? "Enter",
    metaKey: overrides.metaKey ?? false,
    ctrlKey: overrides.ctrlKey ?? false,
    nativeEvent: { isComposing: overrides.isComposing ?? false },
  });

  it("accepts ⌘+Enter and Ctrl+Enter only", () => {
    assert.ok(isSaveShortcut(key({ metaKey: true })));
    assert.ok(isSaveShortcut(key({ ctrlKey: true })));
    assert.ok(!isSaveShortcut(key({})));
    assert.ok(!isSaveShortcut(key({ key: "s", metaKey: true })));
    assert.ok(!isSaveShortcut(key({ metaKey: true, isComposing: true })));
  });
});

describe("noteEditedDate", () => {
  it("names the edit day only when it is a later day", () => {
    assert.equal(noteEditedDate({ createdAt: "2026-03-03T10:00:00Z", updatedAt: "2026-03-03T18:00:00Z" }), "");
    assert.equal(noteEditedDate({ createdAt: "2026-03-03T10:00:00Z", updatedAt: "2026-03-05T09:00:00Z" }), "5 Mar 2026");
  });
});
