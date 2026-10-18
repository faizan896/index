"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

export interface NavLinkProps {
  href: string;
  children: ReactNode;
  /** A faint count on the right; hidden when zero. */
  count?: number;
  /** "prefix" also marks the link active on pages below it (/collections/…). */
  match?: "exact" | "prefix";
  onNavigate?: () => void;
  className?: string;
}

/** A sidebar link that knows when it is the current page. */
export function NavLink({ href, children, count, match = "exact", onNavigate, className }: NavLinkProps) {
  const pathname = usePathname();
  const active = pathname === href || (match === "prefix" && pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex items-baseline justify-between gap-3 transition-colors",
        active ? "font-medium text-ink" : "text-muted hover:text-ink",
        className,
      )}
    >
      <span className="min-w-0 truncate">{children}</span>
      {count ? (
        <span className="tabular shrink-0 text-xs font-normal text-faint">{count.toLocaleString("en-US")}</span>
      ) : null}
    </Link>
  );
}
