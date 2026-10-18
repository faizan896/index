"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/Button";
import { FieldLabel, TextInput } from "@/components/ui/Field";

export interface CollectionFormValues {
  name: string;
  description: string;
}

export interface CollectionFormProps {
  /** Accessible name of the form, e.g. "New collection". */
  label: string;
  initial?: CollectionFormValues;
  submitLabel: string;
  pendingLabel: string;
  /** Saves the values; resolves to an error message, or null once saved. */
  onSubmit: (values: CollectionFormValues) => Promise<string | null>;
  onCancel: () => void;
}

/** Name and optional description for a collection. Enter saves; Escape cancels. */
export function CollectionForm({
  label,
  initial,
  submitLabel,
  pendingLabel,
  onSubmit,
  onCancel,
}: CollectionFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);
  const nameId = useId();
  const descriptionId = useId();
  const errorId = useId();

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!name.trim()) {
      setError("Name the collection first.");
      nameRef.current?.focus();
      return;
    }
    setError(null);
    startTransition(async () => {
      const message = await onSubmit({ name, description });
      if (message) setError(message);
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Escape" || pending) return;
    event.preventDefault();
    event.stopPropagation();
    onCancel();
  }

  return (
    <form aria-label={label} onSubmit={submit} onKeyDown={onKeyDown} noValidate>
      <FieldLabel htmlFor={nameId}>Name</FieldLabel>
      <TextInput
        ref={nameRef}
        id={nameId}
        name="name"
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          if (error) setError(null);
        }}
        maxLength={120}
        autoComplete="off"
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
      />

      <div className="mt-5">
        <FieldLabel htmlFor={descriptionId} hint="Optional">
          Description
        </FieldLabel>
        <TextInput
          id={descriptionId}
          name="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={1000}
          autoComplete="off"
          placeholder="What this collection is for"
        />
      </div>

      <div className="mt-5 flex items-center gap-2">
        <Button type="submit" variant="primary" size="sm" pending={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
        <Button variant="quiet" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <p id={errorId} aria-live="polite" className="mt-2 min-h-5 text-sm text-danger">
        {error}
      </p>
    </form>
  );
}
