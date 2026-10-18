"use client";

import Link from "next/link";
import { Fragment, useEffect, useOptimistic, useRef, useState, useTransition } from "react";

import { settle } from "@/components/library/action-result";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { setLinkCategories } from "@/lib/actions/links";
import type { CategoryRef } from "@/lib/types";
import { CategoryEditor, type CategoryChoice } from "./CategoryEditor";
import { byName } from "./item-format";
import { Dot, ItemSection } from "./ItemSection";

export interface CategoriesSectionProps {
  linkId: string;
  categories: CategoryRef[];
  /** Every category in the library, suggested while editing. */
  allCategories: CategoryRef[];
  /** Categorizing hasn't finished yet. */
  sorting: boolean;
}

function sameSlugs(a: readonly { slug: string }[], b: readonly { slug: string }[]): boolean {
  if (a.length !== b.length) return false;
  const slugs = new Set(a.map((entry) => entry.slug));
  return b.every((entry) => slugs.has(entry.slug));
}

/** The item's categories as links, with an inline editor; saving shows the new set at once. */
export function CategoriesSection({ linkId, categories, allCategories, sorting }: CategoriesSectionProps) {
  const { toast } = useToast();
  const [shown, setShown] = useOptimistic(categories);
  const [editing, setEditing] = useState(false);
  const [, startSaving] = useTransition();
  const editRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (editing || !returnFocus.current) return;
    returnFocus.current = false;
    editRef.current?.focus();
  }, [editing]);

  function close() {
    returnFocus.current = true;
    setEditing(false);
  }

  function save(chosen: CategoryChoice[]) {
    close();
    if (sameSlugs(chosen, shown)) return;
    const next: CategoryRef[] = chosen
      .map((choice) => allCategories.find((category) => category.slug === choice.slug) ?? { id: `new:${choice.slug}`, ...choice })
      .sort(byName);
    startSaving(async () => {
      setShown(next);
      const result = await settle(
        setLinkCategories(
          linkId,
          chosen.map((choice) => choice.name),
        ),
      );
      if (!result.ok) toast(result.error, { tone: "error" });
    });
  }

  return (
    <ItemSection
      id="item-categories"
      title="Categories"
      actions={
        editing ? null : (
          <Button ref={editRef} variant="quiet" size="sm" className="text-xs" onClick={() => setEditing(true)} aria-label="Edit categories">
            Edit
          </Button>
        )
      }
    >
      {editing ? (
        <CategoryEditor
          initial={shown.map(({ name, slug }) => ({ name, slug }))}
          suggestions={allCategories}
          onSave={save}
          onCancel={close}
        />
      ) : shown.length > 0 ? (
        <p className="break-words text-base text-ink">
          {shown.map((category, index) => (
            <Fragment key={category.id}>
              {index > 0 ? <Dot /> : null}
              <Link href={`/categories/${category.slug}`} prefetch={false} className="link">
                {category.name}
              </Link>
            </Fragment>
          ))}
        </p>
      ) : sorting ? (
        <p className="animate-pulse-soft text-sm text-faint">Sorting…</p>
      ) : (
        <p className="text-base">
          <Link href="/unsorted" prefetch={false} className="text-faint transition-colors hover:text-ink">
            Unsorted
          </Link>
        </p>
      )}
    </ItemSection>
  );
}
