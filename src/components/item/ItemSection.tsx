import type { ReactNode } from "react";

export interface ItemSectionProps {
  /** Unique on the page; the heading is `${id}-heading`. */
  id: string;
  title: string;
  /** Quiet controls shown at the right of the heading, e.g. "Edit". */
  actions?: ReactNode;
  children: ReactNode;
}

/** One block of the detail page: a hairline above, a small uppercase heading, then the content. */
export function ItemSection({ id, title, actions, children }: ItemSectionProps) {
  const headingId = `${id}-heading`;
  return (
    <section id={id} aria-labelledby={headingId} className="border-t border-rule py-7">
      <div className="mb-3 flex min-h-7 items-center justify-between gap-4">
        <h2 id={headingId} className="label">
          {title}
        </h2>
        {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** The faint middle dot between facts on a line; hidden from screen readers. */
export function Dot() {
  return (
    <span aria-hidden="true" className="mx-1.5 text-faint">
      ·
    </span>
  );
}
