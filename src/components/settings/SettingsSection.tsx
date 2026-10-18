import type { ReactNode } from "react";

export interface SettingsSectionProps {
  /** Unique on the page; the heading is `${id}-heading`. */
  id: string;
  title: string;
  /** A short, muted explanation under the heading. */
  description?: ReactNode;
  children?: ReactNode;
}

/** One block of the Settings page: a hairline above, a small uppercase heading, a line of copy, then controls. */
export function SettingsSection({ id, title, description, children }: SettingsSectionProps) {
  const headingId = `${id}-heading`;
  return (
    <section id={id} aria-labelledby={headingId} className="border-t border-rule py-8">
      <h2 id={headingId} className="label">
        {title}
      </h2>
      {description ? <div className="mt-2 max-w-prose text-sm text-muted">{description}</div> : null}
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}
