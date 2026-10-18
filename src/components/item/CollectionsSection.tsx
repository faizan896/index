"use client";

import Link from "next/link";
import {
  startTransition,
  useEffect,
  useId,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { settle } from "@/components/library/action-result";
import { Button } from "@/components/ui/Button";
import { Select, TextInput } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import {
  addLinkToCollection,
  createCollection,
  dismissCollectionSuggestion,
  removeLinkFromCollection,
} from "@/lib/actions/collections";
import type { ActionResult, CollectionRef } from "@/lib/types";
import { byName } from "./item-format";
import { ItemSection } from "./ItemSection";

/** The select's value for "New collection…". Never a collection id (those are UUIDs). */
const NEW_COLLECTION = "new";

interface Membership {
  collections: CollectionRef[];
  suggested: CollectionRef[];
}

type MembershipChange =
  | { type: "add"; collection: CollectionRef }
  | { type: "remove"; id: string }
  | { type: "dismiss"; id: string };

function applyChange(current: Membership, change: MembershipChange): Membership {
  switch (change.type) {
    case "add":
      return {
        collections: current.collections.some((collection) => collection.id === change.collection.id)
          ? current.collections
          : [...current.collections, change.collection].sort(byName),
        suggested: current.suggested.filter((collection) => collection.id !== change.collection.id),
      };
    case "remove":
      return { ...current, collections: current.collections.filter((collection) => collection.id !== change.id) };
    case "dismiss":
      return { ...current, suggested: current.suggested.filter((collection) => collection.id !== change.id) };
  }
}

export interface CollectionsSectionProps {
  linkId: string;
  collections: CollectionRef[];
  /** The classifier's suggestions; shown as questions, never applied without the reader. */
  suggested: CollectionRef[];
  /** Every collection in the library. */
  allCollections: CollectionRef[];
}

/**
 * The collections this item is in (each removable), a quiet "Add to
 * collection" select with inline "New collection…", and any AI suggestions
 * as one line each: "Might belong in: …  Add · Dismiss".
 */
export function CollectionsSection({ linkId, collections, suggested, allCollections }: CollectionsSectionProps) {
  const { toast } = useToast();
  const [shown, change] = useOptimistic<Membership, MembershipChange>({ collections, suggested }, applyChange);
  const [, startSaving] = useTransition();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createPending, startCreate] = useTransition();
  const selectRef = useRef<HTMLSelectElement>(null);
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef(false);
  const id = useId();
  const nameId = `${id}-name`;
  const errorId = `${id}-error`;

  const memberIds = new Set(shown.collections.map((collection) => collection.id));
  const others = allCollections.filter((collection) => !memberIds.has(collection.id));

  function focusAddControl() {
    (selectRef.current ?? newButtonRef.current)?.focus();
  }

  useEffect(() => {
    if (creating) {
      nameRef.current?.focus();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      focusAddControl();
    }
  }, [creating]);

  function run(update: MembershipChange, action: () => Promise<ActionResult>) {
    startSaving(async () => {
      change(update);
      const result = await settle(action());
      if (!result.ok) toast(result.error, { tone: "error" });
    });
  }

  function add(collection: CollectionRef) {
    run({ type: "add", collection }, () => addLinkToCollection(linkId, collection.id));
  }

  function remove(collection: CollectionRef) {
    focusAddControl();
    run({ type: "remove", id: collection.id }, () => removeLinkFromCollection(linkId, collection.id));
  }

  function dismiss(collection: CollectionRef) {
    focusAddControl();
    run({ type: "dismiss", id: collection.id }, () => dismissCollectionSuggestion(linkId, collection.id));
  }

  function acceptSuggestion(collection: CollectionRef) {
    focusAddControl();
    add(collection);
  }

  function onSelect(event: ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;
    if (value === NEW_COLLECTION) {
      openCreate();
      return;
    }
    const collection = others.find((entry) => entry.id === value);
    if (collection) add(collection);
  }

  function openCreate() {
    setName("");
    setCreateError(null);
    setCreating(true);
  }

  function closeCreate() {
    returnFocus.current = true;
    setCreating(false);
  }

  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createPending) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setCreateError("Name the collection first.");
      nameRef.current?.focus();
      return;
    }
    startCreate(async () => {
      const created = await settle(createCollection(trimmed));
      if (!created.ok) {
        setCreateError(created.error);
        return;
      }
      const added = await settle(addLinkToCollection(linkId, created.data.id));
      if (!added.ok) toast(added.error, { tone: "error" });
      // Close together with the refreshed list, so the new collection doesn't blink in late.
      startTransition(closeCreate);
    });
  }

  function onNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Escape" || event.nativeEvent.isComposing || createPending) return;
    event.preventDefault();
    closeCreate();
  }

  return (
    <ItemSection id="item-collections" title="Collections">
      {shown.collections.length > 0 ? (
        <ul className="space-y-1">
          {shown.collections.map((collection) => (
            <li key={collection.id} className="flex items-baseline justify-between gap-4">
              <Link
                href={`/collections/${collection.id}`}
                prefetch={false}
                className="link min-w-0 break-words text-base text-ink"
              >
                {collection.name}
              </Link>
              <Button
                variant="quiet"
                size="sm"
                className="text-xs"
                onClick={() => remove(collection)}
                aria-label={`Remove from ${collection.name}`}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Not in any collection.</p>
      )}

      {shown.suggested.map((collection) => (
        <p key={collection.id} className="mt-3 flex flex-wrap items-baseline gap-x-3 text-sm text-muted">
          <span className="min-w-0 break-words">
            Might belong in: <span className="text-ink">{collection.name}</span>
          </span>
          <span className="flex items-baseline gap-2">
            <Button
              variant="quiet"
              size="sm"
              className="text-sm"
              onClick={() => acceptSuggestion(collection)}
              aria-label={`Add to ${collection.name}`}
            >
              Add
            </Button>
            <Button
              variant="quiet"
              size="sm"
              className="text-sm"
              onClick={() => dismiss(collection)}
              aria-label={`Dismiss suggestion ${collection.name}`}
            >
              Dismiss
            </Button>
          </span>
        </p>
      ))}

      <div className="mt-4">
        {creating ? (
          <form onSubmit={onCreate} aria-label="New collection" className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <label htmlFor={nameId} className="sr-only">
              Name of the new collection
            </label>
            <div className="min-w-0 flex-1 basis-56">
              <TextInput
                ref={nameRef}
                id={nameId}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setCreateError(null);
                }}
                onKeyDown={onNameKeyDown}
                placeholder="Collection name"
                maxLength={120}
                autoComplete="off"
                enterKeyHint="done"
                readOnly={createPending}
                aria-invalid={createError ? true : undefined}
                aria-describedby={createError ? errorId : undefined}
              />
            </div>
            <Button type="submit" size="sm" pending={createPending}>
              {createPending ? "Creating…" : "Create"}
            </Button>
            <Button variant="quiet" size="sm" className="text-xs" onClick={closeCreate} disabled={createPending}>
              Cancel
            </Button>
            {createError ? (
              <p id={errorId} role="alert" className="basis-full text-sm text-danger">
                {createError}
              </p>
            ) : null}
          </form>
        ) : others.length > 0 ? (
          // A native select sizes itself to its longest option; the cap keeps long names from widening the page.
          <Select ref={selectRef} inline value="" onChange={onSelect} aria-label="Add to collection" className="max-w-56">
            <option value="" disabled>
              Add to collection…
            </option>
            {others.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
              </option>
            ))}
            <option value={NEW_COLLECTION}>New collection…</option>
          </Select>
        ) : (
          <Button ref={newButtonRef} variant="quiet" size="sm" className="text-sm" onClick={openCreate}>
            New collection…
          </Button>
        )}
      </div>
    </ItemSection>
  );
}
