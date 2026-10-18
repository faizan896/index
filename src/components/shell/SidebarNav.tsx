"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";

import { cx } from "@/lib/cx";
import type { CategorySummary, LibraryStats } from "@/lib/types";
import { NavLink } from "./NavLink";

/** Categories beyond this many are folded behind "Show all". */
const VISIBLE_CATEGORIES = 12;

export interface SidebarNavProps {
  categories: ReadonlyArray<Pick<CategorySummary, "id" | "name" | "slug" | "linkCount">>;
  stats: Pick<LibraryStats, "unread" | "unsorted">;
  /** "sheet" is the phone menu: larger type and taller rows for touch. */
  variant?: "sidebar" | "sheet";
  /** Called when a link is followed (closes the phone menu). */
  onNavigate?: () => void;
}

/** The library's navigation, shared by the desktop sidebar and the phone menu. */
export function SidebarNav({ categories, stats, variant = "sidebar", onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const headingId = useId();
  const listId = useId();

  const activeIndex = categories.findIndex((category) => pathname === `/categories/${category.slug}`);
  const collapsible = categories.length > VISIBLE_CATEGORIES;
  // Never fold away the category being viewed.
  const showAll = !collapsible || expanded || activeIndex >= VISIBLE_CATEGORIES;
  const shown = showAll ? categories : categories.slice(0, VISIBLE_CATEGORIES);
  const manageActive = pathname === "/categories";

  const row = variant === "sheet" ? "py-2 text-base leading-6" : "py-[5px] text-[0.875rem] leading-5";
  const gap = variant === "sheet" ? "mt-8" : "mt-7";

  return (
    <nav aria-label="Library">
      <ul>
        <li>
          <NavLink href="/" onNavigate={onNavigate} className={row}>
            All Reads
          </NavLink>
        </li>
        <li>
          <NavLink href="/unread" count={stats.unread} onNavigate={onNavigate} className={row}>
            Unread
          </NavLink>
        </li>
        <li>
          <NavLink href="/reading" onNavigate={onNavigate} className={row}>
            Reading
          </NavLink>
        </li>
        <li>
          <NavLink href="/finished" onNavigate={onNavigate} className={row}>
            Finished
          </NavLink>
        </li>
        <li>
          <NavLink href="/favorites" onNavigate={onNavigate} className={row}>
            Favorites
          </NavLink>
        </li>
      </ul>

      <ul className={gap}>
        <li>
          <NavLink href="/collections" match="prefix" onNavigate={onNavigate} className={row}>
            Collections
          </NavLink>
        </li>
      </ul>

      <div className={variant === "sheet" ? "mt-6" : "mt-5"}>
        <div className="flex items-baseline justify-between gap-3 py-1">
          <h2 id={headingId} className="label">
            Categories
          </h2>
          <Link
            href="/categories"
            onClick={onNavigate}
            aria-current={manageActive ? "page" : undefined}
            aria-label="Manage categories"
            className={cx(
              "text-xs transition-colors",
              manageActive ? "font-medium text-ink" : "text-muted hover:text-ink",
              variant === "sheet" && "-my-2 py-2",
            )}
          >
            Manage
          </Link>
        </div>
        {categories.length === 0 && stats.unsorted === 0 ? (
          <p className="py-1 text-sm text-faint">None yet</p>
        ) : (
          <ul id={listId} aria-labelledby={headingId}>
            {shown.map((category) => (
              <li key={category.id}>
                <NavLink
                  href={`/categories/${category.slug}`}
                  count={category.linkCount}
                  onNavigate={onNavigate}
                  className={row}
                >
                  {category.name}
                </NavLink>
              </li>
            ))}
            {stats.unsorted > 0 ? (
              <li>
                <NavLink href="/unsorted" count={stats.unsorted} onNavigate={onNavigate} className={row}>
                  Unsorted
                </NavLink>
              </li>
            ) : null}
          </ul>
        )}
        {collapsible && activeIndex < VISIBLE_CATEGORIES ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => setExpanded((open) => !open)}
            className={cx("text-xs text-muted transition-colors hover:text-ink", variant === "sheet" ? "py-2" : "py-1.5")}
          >
            {expanded ? "Show fewer" : `Show all ${categories.length}`}
          </button>
        ) : null}
      </div>

      <ul className={gap}>
        <li>
          <NavLink href="/rediscover" onNavigate={onNavigate} className={row}>
            Rediscover
          </NavLink>
        </li>
        <li>
          <NavLink href="/settings" onNavigate={onNavigate} className={row}>
            Settings
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}
