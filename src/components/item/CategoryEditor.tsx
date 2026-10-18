"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";
import { CloseIcon } from "@/components/ui/Icons";
import { validateManualTerm } from "@/lib/core/classify/taxonomy";
import { splitNames } from "./item-format";

/** The server's limit (setLinkCategories). */
const MAX_CATEGORIES = 10;

export interface CategoryChoice {
  name: string;
  slug: string;
}

export interface CategoryEditorProps {
  initial: CategoryChoice[];
  /** Every category in the library: offered while typing, and their spelling is reused. */
  suggestions: readonly CategoryChoice[];
  onSave: (chosen: CategoryChoice[]) => void;
  onCancel: () => void;
}

/**
 * Chooses an item's categories: the current ones as removable chips, and one
 * field that takes a name (or several, comma-separated) with the library's
 * categories as suggestions. Enter adds; Enter on an empty field saves;
 * Backspace on an empty field removes the last chip; Escape cancels.
 */
export function CategoryEditor({ initial, suggestions, onSave, onCancel }: CategoryEditorProps) {
  const [chosen, setChosen] = useState(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const inputId = `${id}-input`;
  const listId = `${id}-list`;
  const noteId = `${id}-note`;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /** Adds what's typed to the chips. Returns the new list, or null (with a message) if a name won't do. */
  function commitDraft(): CategoryChoice[] | null {
    const next = [...chosen];
    for (const raw of splitNames(draft)) {
      const term = validateManualTerm(raw);
      if (!term.ok) {
        setError(term.error);
        return null;
      }
      if (next.some((choice) => choice.slug === term.slug)) continue;
      // "payments" typed for an existing "Payments" keeps the library's spelling.
      next.push(suggestions.find((category) => category.slug === term.slug) ?? { name: term.name, slug: term.slug });
    }
    if (next.length > MAX_CATEGORIES) {
      setError(`Use at most ${MAX_CATEGORIES} categories per item.`);
      return null;
    }
    setChosen(next);
    setDraft("");
    setError(null);
    return next;
  }

  function remove(slug: string) {
    setChosen((current) => current.filter((choice) => choice.slug !== slug));
    setError(null);
    inputRef.current?.focus();
  }

  function save() {
    const next = draft.trim() ? commitDraft() : chosen;
    if (next) onSave(next);
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      if (draft.trim()) commitDraft();
      else save();
    } else if (event.key === "," && draft.trim()) {
      event.preventDefault();
      commitDraft();
    } else if (event.key === "Backspace" && draft === "" && chosen.length > 0) {
      event.preventDefault();
      setChosen((current) => current.slice(0, -1));
      setError(null);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    onCancel();
  }

  const chosenSlugs = new Set(chosen.map((choice) => choice.slug));

  return (
    <div onKeyDown={onKeyDown}>
      {chosen.length > 0 ? (
        <ul aria-label="Chosen categories" className="mb-3 flex flex-wrap gap-2">
          {chosen.map((choice) => (
            <li
              key={choice.slug}
              className="inline-flex h-7 max-w-full items-center rounded-[var(--radius-control)] border border-rule-strong pl-2 text-sm text-ink"
            >
              <span className="truncate">{choice.name}</span>
              <button
                type="button"
                onClick={() => remove(choice.slug)}
                aria-label={`Remove ${choice.name}`}
                className="inline-flex size-7 shrink-0 items-center justify-center text-faint transition-colors hover:text-ink"
              >
                <CloseIcon className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-muted">No categories. Saving leaves this item unsorted.</p>
      )}

      <label htmlFor={inputId} className="sr-only">
        Add categories
      </label>
      <TextInput
        ref={inputRef}
        id={inputId}
        list={listId}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        onKeyDown={onInputKeyDown}
        placeholder="Add categories, separated by commas"
        autoComplete="off"
        enterKeyHint="done"
        aria-invalid={error ? true : undefined}
        aria-describedby={noteId}
      />
      <datalist id={listId}>
        {suggestions
          .filter((category) => !chosenSlugs.has(category.slug))
          .map((category) => (
            <option key={category.slug} value={category.name} />
          ))}
      </datalist>
      <p id={noteId} aria-live="polite" className={error ? "mt-1.5 text-sm text-danger" : "mt-1.5 text-xs text-muted"}>
        {error ?? "Enter adds a category. Enter on an empty field saves."}
      </p>

      <div className="mt-4 flex items-center gap-3">
        <Button variant="primary" size="sm" onClick={save}>
          Save
        </Button>
        <Button variant="quiet" size="sm" className="text-xs" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
