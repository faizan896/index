"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { settle } from "@/components/library/action-result";
import { Button } from "@/components/ui/Button";
import { PlusIcon } from "@/components/ui/Icons";
import { useToast } from "@/components/ui/Toast";
import { createCollection } from "@/lib/actions/collections";
import { CollectionForm, type CollectionFormValues } from "./CollectionForm";

/** "New collection": a quiet button that opens a two-field form in place. */
export function NewCollectionForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Focus returns to the button once the form closes, so keyboard users keep their place.
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (open || !restoreFocus.current) return;
    restoreFocus.current = false;
    buttonRef.current?.focus();
  }, [open]);

  function close() {
    restoreFocus.current = true;
    setOpen(false);
  }

  async function create({ name, description }: CollectionFormValues): Promise<string | null> {
    const result = await settle(createCollection(name, description));
    if (!result.ok) return result.error;
    const { id, name: created } = result.data;
    close();
    toast(`Created “${created}”.`, {
      action: { label: "Open", onAction: () => router.push(`/collections/${id}`) },
    });
    return null;
  }

  return (
    <div className="mt-8">
      {open ? (
        <div className="border-t border-rule pt-6">
          <CollectionForm
            label="New collection"
            submitLabel="Create collection"
            pendingLabel="Creating…"
            onSubmit={create}
            onCancel={close}
          />
        </div>
      ) : (
        <Button ref={buttonRef} variant="quiet" className="-ml-1.5" onClick={() => setOpen(true)}>
          <PlusIcon className="size-3.5" />
          New collection
        </Button>
      )}
    </div>
  );
}
