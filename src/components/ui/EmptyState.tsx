import type { ReactNode } from "react";

/** A quiet, typographic empty state: a serif line, a sentence, maybe one action. */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="border-t border-rule py-16 sm:py-20">
      <p className="font-serif text-title text-ink">{title}</p>
      {children ? <div className="mt-2 max-w-md text-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
