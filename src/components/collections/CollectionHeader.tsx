"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { InlineConfirm } from "@/components/categories/InlineConfirm";
import { settle } from "@/components/library/action-result";
import { useToast } from "@/components/ui/Toast";
import { deleteCollection, updateCollection } from "@/lib/actions/collections";
import { pluralize } from "@/lib/format";
import type { CollectionSummary } from "@/lib/types";
import { CollectionForm, type CollectionFormValues } from "./CollectionForm";

type Mode = "view" | "edit" | "delete";

const ACTION_CLASS =
  "-my-1.5 py-1.5 text-muted transition-colors hover:text-ink disabled:opacity-45 aria-expanded:text-ink";

/**
 * The top of a collection page: its name, description and size, with quiet
 * Edit and Delete actions that open in place.
 */
export function CollectionHeader({ collection }: { collection: CollectionSummary }) {
  const router = useRouter();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("view");
  const [deleting, startDelete] = useTransition();
  const editRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  // Which action to give focus back to once its form or confirmation closes.
  const returnFocus = useRef<"edit" | "delete" | null>(null);

  useEffect(() => {
    if (mode !== "view" || !returnFocus.current) return;
    (returnFocus.current === "edit" ? editRef : deleteRef).current?.focus();
    returnFocus.current = null;
  }, [mode]);

  function close(from: "edit" | "delete") {
    returnFocus.current = from;
    setMode("view");
  }

  async function save(values: CollectionFormValues): Promise<string | null> {
    const result = await settle(updateCollection(collection.id, values));
    if (!result.ok) return result.error;
    close("edit");
    toast("Saved.");
    return null;
  }

  function remove() {
    startDelete(async () => {
      const result = await settle(deleteCollection(collection.id));
      if (!result.ok) {
        toast(result.error, { tone: "error" });
        return;
      }
      toast(`Deleted “${collection.name}”. Its articles are still in your library.`);
      router.push("/collections");
    });
  }

  if (mode === "edit") {
    return (
      <header>
        <p className="label mb-4">Edit collection</p>
        <CollectionForm
          label="Edit collection"
          initial={{ name: collection.name, description: collection.description ?? "" }}
          submitLabel="Save"
          pendingLabel="Saving…"
          onSubmit={save}
          onCancel={() => close("edit")}
        />
      </header>
    );
  }

  return (
    <header>
      <p className="label mb-2">Collection</p>
      <h1 className="break-words font-serif text-display font-normal tracking-[-0.012em] text-ink">{collection.name}</h1>
      {collection.description ? (
        <p className="mt-3 max-w-prose whitespace-pre-line break-words text-base text-muted">{collection.description}</p>
      ) : null}
      <p className="tabular mt-3 text-sm text-muted">
        {pluralize(collection.linkCount, "item")}
        <span aria-hidden="true" className="mx-2 text-faint">
          ·
        </span>
        <button ref={editRef} type="button" className={ACTION_CLASS} disabled={deleting} onClick={() => setMode("edit")}>
          Edit
        </button>
        <span aria-hidden="true" className="mx-2 text-faint">
          ·
        </span>
        <button
          ref={deleteRef}
          type="button"
          className={ACTION_CLASS}
          aria-expanded={mode === "delete"}
          disabled={deleting}
          onClick={() => (mode === "delete" ? close("delete") : setMode("delete"))}
        >
          Delete collection
        </button>
      </p>
      {mode === "delete" ? (
        <InlineConfirm
          message="Delete this collection? The articles stay in your library."
          confirmLabel="Delete"
          pendingLabel="Deleting…"
          tone="danger"
          pending={deleting}
          onConfirm={remove}
          onCancel={() => close("delete")}
        />
      ) : null}
    </header>
  );
}
