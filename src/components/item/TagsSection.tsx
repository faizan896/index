"use client";

import Link from "next/link";
import { useId, useOptimistic, useRef, useState, useTransition, type KeyboardEvent } from "react";

import { settle } from "@/components/library/action-result";
import { TextInput } from "@/components/ui/Field";
import { CloseIcon } from "@/components/ui/Icons";
import { useToast } from "@/components/ui/Toast";
import { addLinkTag, removeLinkTag } from "@/lib/actions/links";
import { validateManualTerm } from "@/lib/core/classify/taxonomy";
import type { TagRef } from "@/lib/types";
import { byName, splitNames } from "./item-format";
import { ItemSection } from "./ItemSection";

type TagChange = { type: "add"; tags: TagRef[] } | { type: "remove"; id: string };

function applyTagChange(current: TagRef[], change: TagChange): TagRef[] {
  if (change.type === "remove") return current.filter((tag) => tag.id !== change.id);
  const known = new Set(current.map((tag) => tag.slug));
  return [...current, ...change.tags.filter((tag) => !known.has(tag.slug))].sort(byName);
}

/** Tags added here but not yet confirmed by the server. */
function isUnsaved(tag: TagRef): boolean {
  return tag.id.startsWith("new:");
}

/** The item's tags as links with a small × each, and a field that adds tags (Enter; commas for several). */
export function TagsSection({ linkId, tags }: { linkId: string; tags: TagRef[] }) {
  const { toast } = useToast();
  const [shown, changeTags] = useOptimistic(tags, applyTagChange);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startSaving] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const inputId = `${id}-input`;
  const errorId = `${id}-error`;

  function add() {
    const fresh: TagRef[] = [];
    for (const raw of splitNames(draft)) {
      const term = validateManualTerm(raw);
      if (!term.ok) {
        setError(term.error);
        return;
      }
      if (shown.some((tag) => tag.slug === term.slug) || fresh.some((tag) => tag.slug === term.slug)) continue;
      fresh.push({ id: `new:${term.slug}`, name: term.name, slug: term.slug });
    }
    setDraft("");
    setError(null);
    if (fresh.length === 0) return;

    startSaving(async () => {
      changeTags({ type: "add", tags: fresh });
      const failed: string[] = [];
      for (const tag of fresh) {
        const result = await settle(addLinkTag(linkId, tag.name));
        if (!result.ok) {
          failed.push(tag.name);
          toast(result.error, { tone: "error" });
        }
      }
      // Give back what didn't save, unless something new has been typed meanwhile.
      if (failed.length) setDraft((current) => current || failed.join(", "));
    });
  }

  function remove(tag: TagRef) {
    // The × being pressed disappears; keep the keyboard in the section.
    inputRef.current?.focus();
    startSaving(async () => {
      changeTags({ type: "remove", id: tag.id });
      const result = await settle(removeLinkTag(linkId, tag.id));
      if (!result.ok) toast(result.error, { tone: "error" });
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      add();
    } else if (event.key === "Escape" && (draft || error)) {
      event.preventDefault();
      setDraft("");
      setError(null);
    }
  }

  return (
    <ItemSection id="item-tags" title="Tags">
      {shown.length > 0 ? (
        <ul className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          {shown.map((tag) => (
            <li key={tag.id} className="inline-flex max-w-full items-center text-base">
              <Link href={`/tags/${tag.slug}`} prefetch={false} className="link min-w-0 break-words text-ink">
                {tag.name}
              </Link>
              {isUnsaved(tag) ? (
                <span aria-hidden="true" className="inline-block size-7" />
              ) : (
                <button
                  type="button"
                  onClick={() => remove(tag)}
                  aria-label={`Remove tag ${tag.name}`}
                  title="Remove tag"
                  className="inline-flex size-7 shrink-0 items-center justify-center text-faint transition-colors hover:text-ink"
                >
                  <CloseIcon className="size-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="max-w-xs">
        <label htmlFor={inputId} className="sr-only">
          Add tag
        </label>
        <TextInput
          ref={inputRef}
          id={inputId}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          onKeyDown={onKeyDown}
          placeholder="Add tag…"
          autoComplete="off"
          autoCapitalize="none"
          enterKeyHint="done"
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
      </div>
    </ItemSection>
  );
}
