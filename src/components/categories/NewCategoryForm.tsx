"use client";

import { useId, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";

import { settle } from "@/components/library/action-result";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { createCategory } from "@/lib/actions/categories";

export interface NewCategoryFormProps {
  /** Ids already listed, to tell a new category from one that existed under that name. */
  existingIds: readonly string[];
}

/** One line: type a name, press Enter. */
export function NewCategoryForm({ existingIds }: NewCategoryFormProps) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const errorId = useId();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const typed = name.trim();
    if (!typed) {
      inputRef.current?.focus();
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await settle(createCategory(typed));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Clear only if the field still holds what was submitted.
      setName((current) => (current.trim() === typed ? "" : current));
      toast(
        existingIds.includes(result.data.id)
          ? `There's already a category called “${result.data.name}”.`
          : `Added “${result.data.name}”.`,
      );
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (name) {
      setName("");
      setError(null);
    } else {
      event.currentTarget.blur();
    }
  }

  return (
    <form onSubmit={submit} aria-label="New category" className="mt-8">
      <label htmlFor={inputId} className="sr-only">
        New category name
      </label>
      <div className="flex items-center gap-3 border-b border-rule transition-colors focus-within:border-ink">
        <input
          ref={inputRef}
          id={inputId}
          name="name"
          type="text"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (error) setError(null);
          }}
          onKeyDown={onKeyDown}
          maxLength={60}
          autoComplete="off"
          placeholder="New category"
          enterKeyHint="done"
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className="h-11 min-w-0 flex-1 bg-transparent text-base text-ink outline-none focus-visible:outline-none"
        />
        <Button type="submit" size="sm" pending={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      <p id={errorId} aria-live="polite" className="mt-2 min-h-5 text-sm text-danger">
        {error}
      </p>
    </form>
  );
}
