"use client";

import {
  startTransition,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { settle } from "@/components/library/action-result";
import { Button } from "@/components/ui/Button";
import { FieldLabel, TextArea, TextInput } from "@/components/ui/Field";
import { updateLinkDetails } from "@/lib/actions/links";
import { toDateInputValue } from "@/lib/format";
import type { LinkDetail, LinkDetailsPatch } from "@/lib/types";
import { parseDateInput } from "@/lib/validate";

type FieldKey = "title" | "author" | "siteName" | "publishedAt" | "description";
type Values = Record<FieldKey, string>;

const FIELDS: readonly FieldKey[] = ["title", "author", "siteName", "publishedAt", "description"];
/** The server's limits (updateLinkDetails); the inputs stop there rather than failing on save. */
const MAX_LENGTH = { title: 500, author: 300, siteName: 200, description: 2000 } as const;
const BAD_DATE = "Use a real date for the publication date.";

export type EditableLink = Pick<LinkDetail, "id" | "domain" | "title" | "author" | "siteName" | "publishedAt" | "description">;

export interface EditDetailsFormProps {
  link: EditableLink;
  /** Leaves edit mode, after saving or cancelling. */
  onDone: () => void;
}

function valuesOf(link: EditableLink): Values {
  return {
    title: link.title ?? "",
    author: link.author ?? "",
    siteName: link.siteName ?? "",
    publishedAt: toDateInputValue(link.publishedAt),
    description: link.description ?? "",
  };
}

/**
 * Inline form for the details a page didn't provide (or got wrong). Sends only
 * the fields that changed; an emptied field is cleared. Escape cancels.
 */
export function EditDetailsForm({ link, onDone }: EditDetailsFormProps) {
  const [initial] = useState(() => valuesOf(link));
  const [values, setValues] = useState(initial);
  const [dateError, setDateError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startSaving] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const fieldId = (key: FieldKey) => `${id}-${key}`;
  const headingId = `${id}-heading`;
  const dateErrorId = `${id}-date-error`;

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  function change(key: FieldKey, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    if (key === "publishedAt") setDateError(null);
    setFormError(null);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    // A half-typed date reads as "" from the input; badInput tells it apart from a cleared one.
    if (dateRef.current?.validity.badInput || parseDateInput(values.publishedAt) === "invalid") {
      setDateError(BAD_DATE);
      dateRef.current?.focus();
      return;
    }

    const patch: LinkDetailsPatch = {};
    for (const key of FIELDS) {
      if (values[key] !== initial[key]) patch[key] = values[key];
    }
    if (Object.keys(patch).length === 0) {
      onDone();
      return;
    }

    startSaving(async () => {
      const result = await settle(updateLinkDetails(link.id, patch));
      if (!result.ok) {
        if (result.error === BAD_DATE) setDateError(result.error);
        else setFormError(result.error);
        return;
      }
      // Leave edit mode together with the refreshed details, not before them.
      startTransition(onDone);
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Escape" || event.nativeEvent.isComposing || pending) return;
    event.preventDefault();
    onDone();
  }

  return (
    <form onSubmit={onSubmit} onKeyDown={onKeyDown} noValidate aria-labelledby={headingId}>
      <p id={headingId} className="label">
        Edit details
      </p>

      <fieldset disabled={pending} className="mt-5 min-w-0 space-y-6">
        <div>
          <FieldLabel htmlFor={fieldId("title")}>Title</FieldLabel>
          <input
            ref={titleRef}
            id={fieldId("title")}
            type="text"
            value={values.title}
            onChange={(event) => change("title", event.target.value)}
            maxLength={MAX_LENGTH.title}
            placeholder={link.domain}
            autoComplete="off"
            className="w-full border-0 border-b border-rule bg-transparent px-0 py-1.5 font-serif text-title text-ink outline-none transition-colors focus:border-ink focus-visible:outline-none"
          />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="min-w-0">
            <FieldLabel htmlFor={fieldId("author")}>Author</FieldLabel>
            <TextInput
              id={fieldId("author")}
              value={values.author}
              onChange={(event) => change("author", event.target.value)}
              maxLength={MAX_LENGTH.author}
              autoComplete="off"
            />
          </div>
          <div className="min-w-0">
            <FieldLabel htmlFor={fieldId("siteName")}>Source</FieldLabel>
            <TextInput
              id={fieldId("siteName")}
              value={values.siteName}
              onChange={(event) => change("siteName", event.target.value)}
              maxLength={MAX_LENGTH.siteName}
              placeholder={link.domain}
              autoComplete="off"
            />
          </div>
        </div>

        <div className="sm:w-1/2 sm:pr-3">
          <FieldLabel htmlFor={fieldId("publishedAt")}>Published</FieldLabel>
          <TextInput
            ref={dateRef}
            id={fieldId("publishedAt")}
            type="date"
            min="1800-01-01"
            max="2200-12-31"
            value={values.publishedAt}
            onChange={(event) => change("publishedAt", event.target.value)}
            aria-invalid={dateError ? true : undefined}
            aria-describedby={dateError ? dateErrorId : undefined}
          />
          {dateError ? (
            <p id={dateErrorId} className="mt-1.5 text-sm text-danger">
              {dateError}
            </p>
          ) : null}
        </div>

        <div>
          <FieldLabel htmlFor={fieldId("description")}>Description</FieldLabel>
          <TextArea
            id={fieldId("description")}
            rows={4}
            value={values.description}
            onChange={(event) => change("description", event.target.value)}
            maxLength={MAX_LENGTH.description}
          />
        </div>
      </fieldset>

      <div className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button type="submit" variant="primary" size="sm" pending={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button variant="quiet" size="sm" className="text-xs" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      </div>
    </form>
  );
}
