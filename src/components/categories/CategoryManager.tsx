"use client";

import { useRef, useState } from "react";

import type { CategorySummary } from "@/lib/types";
import { CategoryRow, type CategoryRowMode } from "./CategoryRow";

/** Every category, each with Rename, Merge into… and Delete opening in place (one at a time). */
export function CategoryManager({ categories }: { categories: CategorySummary[] }) {
  const [active, setActive] = useState<{ id: string; mode: CategoryRowMode } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  return (
    <ul ref={listRef} tabIndex={-1} aria-label="Categories" className="border-b border-rule outline-none">
      {categories.map((category) => (
        <CategoryRow
          key={category.id}
          category={category}
          others={categories.filter((other) => other.id !== category.id)}
          mode={active?.id === category.id ? active.mode : null}
          onModeChange={(mode) => setActive(mode ? { id: category.id, mode } : null)}
          onRemoved={() => {
            setActive(null);
            // The row (and the focus inside it) is gone; keep keyboard users in the list.
            listRef.current?.focus();
          }}
        />
      ))}
    </ul>
  );
}
