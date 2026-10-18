"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { settle } from "@/components/library/action-result";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { deleteCategory, mergeCategories, renameCategory } from "@/lib/actions/categories";
import { validateManualTerm } from "@/lib/core/classify/taxonomy";
import type { CategorySummary } from "@/lib/types";
import { InlineConfirm } from "./InlineConfirm";

export type CategoryRowMode = "rename" | "merge" | "delete";

export interface CategoryRowProps {
  category: CategorySummary;
  /** Every other category: merge targets, and names a rename could collide with. */
  others: CategorySummary[];
  /** The open panel, if any. */
  mode: CategoryRowMode | null;
  onModeChange: (mode: CategoryRowMode | null) => void;
  /** The category was merged away or deleted. */
  onRemoved: () => void;
}

function count(n: number): string {
  return n.toLocaleString("en-US");
}

function mergeMessage(source: CategorySummary, target: CategorySummary): string {
  if (source.linkCount === 0) return `Remove ${source.name}? It has no items to move into ${target.name}.`;
  const items = source.linkCount === 1 ? "1 item" : `${count(source.linkCount)} items`;
  return `Move ${items} into ${target.name} and remove ${source.name}?`;
}

function deleteMessage(category: CategorySummary): string {
  if (category.linkCount === 0) return `Delete ${category.name}? It has no items.`;
  if (category.linkCount === 1) {
    return `Delete ${category.name}? Its one item stays in your library; if it has no other category, it becomes Unsorted.`;
  }
  return `Delete ${category.name}? Its ${count(category.linkCount)} items stay in your library; any with no other category become Unsorted.`;
}

/** One category: its name and size, and quiet Rename, Merge into… and Delete actions that open beneath it. */
export function CategoryRow({ category, others, mode, onModeChange, onRemoved }: CategoryRowProps) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [mergeTargetId, setMergeTargetId] = useState("");
  // Coming from a rename clash, the target is already chosen: focus goes to the question, not the select.
  const [mergePreset, setMergePreset] = useState(false);
  const renameRef = useRef<HTMLButtonElement>(null);
  const mergeRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);

  const triggers: Record<CategoryRowMode, RefObject<HTMLButtonElement | null>> = {
    rename: renameRef,
    merge: mergeRef,
    delete: deleteRef,
  };
  const mergeTarget = others.find((other) => other.id === mergeTargetId) ?? null;

  function toggle(next: CategoryRowMode) {
    if (mode === next) {
      close();
      return;
    }
    if (next === "merge") {
      setMergeTargetId("");
      setMergePreset(false);
    }
    onModeChange(next);
  }

  /** Closes the open panel and puts focus back on the action that opened it. */
  function close() {
    if (mode) triggers[mode].current?.focus();
    onModeChange(null);
  }

  function offerMerge(targetId: string) {
    setMergeTargetId(targetId);
    setMergePreset(true);
    onModeChange("merge");
  }

  function merge(target: CategorySummary) {
    startTransition(async () => {
      const result = await settle(mergeCategories(category.id, target.id));
      if (!result.ok) {
        toast(result.error, { tone: "error" });
        return;
      }
      toast(`Merged “${category.name}” into “${target.name}”.`);
      onRemoved();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await settle(deleteCategory(category.id));
      if (!result.ok) {
        toast(result.error, { tone: "error" });
        return;
      }
      toast(`Deleted “${category.name}”.`);
      onRemoved();
    });
  }

  return (
    <li className="border-t border-rule py-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
        <p className="min-w-0 break-words">
          <Link
            href={`/categories/${category.slug}`}
            prefetch={false}
            className="title-link font-serif text-title text-ink"
          >
            {category.name}
          </Link>
          <span className="tabular ml-2 text-sm text-faint">
            <span className="sr-only">, </span>
            {count(category.linkCount)}
            <span className="sr-only"> {category.linkCount === 1 ? "item" : "items"}</span>
          </span>
        </p>
        <div className="-ml-1.5 flex shrink-0 items-center gap-2 sm:-mr-1.5 sm:ml-0">
          <Button
            ref={renameRef}
            variant="quiet"
            className="aria-expanded:text-ink"
            aria-expanded={mode === "rename"}
            disabled={pending}
            onClick={() => toggle("rename")}
          >
            Rename<span className="sr-only"> {category.name}</span>
          </Button>
          {others.length > 0 ? (
            <Button
              ref={mergeRef}
              variant="quiet"
              className="aria-expanded:text-ink"
              aria-expanded={mode === "merge"}
              disabled={pending}
              onClick={() => toggle("merge")}
            >
              Merge<span className="sr-only"> {category.name}</span> into…
            </Button>
          ) : null}
          <Button
            ref={deleteRef}
            variant="quiet"
            className="aria-expanded:text-ink"
            aria-expanded={mode === "delete"}
            disabled={pending}
            onClick={() => toggle("delete")}
          >
            Delete<span className="sr-only"> {category.name}</span>
          </Button>
        </div>
      </div>

      {mode === "rename" ? (
        <RenameForm category={category} others={others} onClose={close} onMerge={offerMerge} />
      ) : null}

      {mode === "merge" ? (
        <MergePanel
          category={category}
          others={others}
          targetId={mergeTargetId}
          onTargetChange={setMergeTargetId}
          focusSelect={!mergePreset}
          pending={pending}
          onCancel={close}
        >
          {mergeTarget ? (
            <InlineConfirm
              key={mergeTarget.id}
              message={mergeMessage(category, mergeTarget)}
              confirmLabel="Merge"
              pendingLabel="Merging…"
              tone="primary"
              pending={pending}
              onConfirm={() => merge(mergeTarget)}
              onCancel={close}
              autoFocus={mergePreset}
            />
          ) : null}
        </MergePanel>
      ) : null}

      {mode === "delete" ? (
        <InlineConfirm
          message={deleteMessage(category)}
          confirmLabel="Delete"
          pendingLabel="Deleting…"
          tone="danger"
          pending={pending}
          onConfirm={remove}
          onCancel={close}
        />
      ) : null}
    </li>
  );
}

interface RenameFormProps {
  category: CategorySummary;
  others: CategorySummary[];
  /** Saved or cancelled. */
  onClose: () => void;
  /** Offered when the new name belongs to another category. */
  onMerge: (targetId: string) => void;
}

function RenameForm({ category, others, onClose, onMerge }: RenameFormProps) {
  const { toast } = useToast();
  const [draft, setDraft] = useState(category.name);
  const [problem, setProblem] = useState<{ message: string; clash: CategorySummary | null } | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const problemId = useId();

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (draft.trim() === category.name) {
      onClose();
      return;
    }
    setProblem(null);
    startTransition(async () => {
      const result = await settle(renameCategory(category.id, draft));
      if (result.ok) {
        toast(`Renamed to “${result.data.name}”.`);
        onClose();
        return;
      }
      // The server refuses names another category already has; offer the merge it suggests.
      const term = validateManualTerm(draft);
      const clash = term.ok ? (others.find((other) => other.slug === term.slug) ?? null) : null;
      setProblem({ message: result.error, clash });
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Escape" || pending) return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  }

  const clash = problem?.clash ?? null;

  return (
    <form onSubmit={submit} onKeyDown={onKeyDown} aria-label={`Rename ${category.name}`} className="mt-3">
      <label htmlFor={inputId} className="sr-only">
        New name for {category.name}
      </label>
      <div className="flex items-center gap-2 border-b border-rule transition-colors focus-within:border-ink">
        <input
          ref={inputRef}
          id={inputId}
          name="name"
          type="text"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (problem) setProblem(null);
          }}
          maxLength={60}
          autoComplete="off"
          enterKeyHint="done"
          aria-invalid={problem ? true : undefined}
          aria-describedby={problemId}
          className="h-10 min-w-0 flex-1 bg-transparent text-base text-ink outline-none focus-visible:outline-none"
        />
        <Button type="submit" variant="primary" size="sm" pending={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button variant="quiet" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
      </div>
      <div id={problemId} aria-live="polite" className="mt-2 text-sm">
        {clash ? (
          <p className="text-ink">
            There&apos;s already a category called “{clash.name}”.{" "}
            <button type="button" className="link" onClick={() => onMerge(clash.id)}>
              Merge {category.name} into {clash.name}
            </button>
          </p>
        ) : problem ? (
          <p className="text-danger">{problem.message}</p>
        ) : null}
      </div>
    </form>
  );
}

interface MergePanelProps {
  category: CategorySummary;
  others: CategorySummary[];
  targetId: string;
  onTargetChange: (targetId: string) => void;
  focusSelect: boolean;
  pending: boolean;
  onCancel: () => void;
  /** The confirmation, once a target is chosen. */
  children?: ReactNode;
}

function MergePanel({ category, others, targetId, onTargetChange, focusSelect, pending, onCancel, children }: MergePanelProps) {
  const selectRef = useRef<HTMLSelectElement>(null);
  const selectId = useId();

  useEffect(() => {
    if (focusSelect) selectRef.current?.focus();
  }, [focusSelect]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || pending) return;
    event.preventDefault();
    onCancel();
  }

  return (
    <div onKeyDown={onKeyDown} className="mt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label htmlFor={selectId} className="text-sm text-muted">
          Merge {category.name} into
        </label>
        <div className="w-full min-w-0 sm:w-64">
          <Select
            ref={selectRef}
            id={selectId}
            value={targetId}
            disabled={pending}
            onChange={(event) => onTargetChange(event.target.value)}
          >
            <option value="" disabled>
              Choose a category…
            </option>
            {others.map((other) => (
              <option key={other.id} value={other.id}>
                {other.name}
              </option>
            ))}
          </Select>
        </div>
        {targetId ? null : (
          <Button variant="quiet" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
      {children}
    </div>
  );
}
