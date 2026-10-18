import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

export interface PageHeadingProps {
  title: ReactNode;
  /** A small uppercase label above the title, e.g. "Tag". */
  label?: ReactNode;
  /** One quiet line below the title. */
  subtitle?: ReactNode;
  /** "hero" for the library's front page; "display" everywhere else. */
  size?: "hero" | "display";
}

/** The serif heading block at the top of a list page. */
export function PageHeading({ title, label, subtitle, size = "display" }: PageHeadingProps) {
  return (
    <header>
      {label ? <p className="label mb-2">{label}</p> : null}
      <h1
        className={cx(
          "break-words font-serif font-normal tracking-[-0.012em] text-ink",
          size === "hero" ? "text-display sm:text-hero" : "text-display",
        )}
      >
        {title}
      </h1>
      {subtitle ? <p className="mt-2 text-sm text-muted">{subtitle}</p> : null}
    </header>
  );
}
