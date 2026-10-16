import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

import { cx } from "@/lib/cx";
import { ChevronDownIcon } from "./Icons";

/** A single-line input with a hairline bottom rule rather than a box. */
export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cx(
        "h-9 w-full border-0 border-b border-rule bg-transparent px-0 text-base text-ink outline-none transition-colors",
        "focus:border-ink focus-visible:outline-none aria-[invalid=true]:border-danger",
        className,
      )}
      {...rest}
    />
  );
});

/** A boxed input for forms where a bottom rule alone would be ambiguous. */
export const BoxInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function BoxInput(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cx(
        "h-9 w-full rounded-[var(--radius-control)] border border-rule-strong bg-paper px-2.5 text-sm text-ink outline-none transition-colors",
        "focus:border-ink focus-visible:outline-none aria-[invalid=true]:border-danger",
        className,
      )}
      {...rest}
    />
  );
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea(
  { className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cx(
        "block w-full resize-y rounded-[var(--radius-control)] border border-rule-strong bg-paper px-3 py-2 text-base leading-relaxed text-ink outline-none transition-colors",
        "focus:border-ink focus-visible:outline-none",
        className,
      )}
      {...rest}
    />
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Renders as quiet inline text ("Sort: Recent ▾") instead of a boxed control. */
  inline?: boolean;
}

/**
 * Native select, styled down to text and a caret. Native keeps it fast,
 * accessible and right on phones.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, inline = false, children, ...rest },
  ref,
) {
  return (
    <span className={cx("relative inline-flex items-center", inline ? "" : "w-full")}>
      <select
        ref={ref}
        className={cx(
          "w-full appearance-none bg-transparent pr-5 text-ink outline-none",
          inline
            ? "h-7 border-0 pl-0 text-sm text-muted hover:text-ink focus-visible:text-ink"
            : "h-9 rounded-[var(--radius-control)] border border-rule-strong pl-2.5 text-sm focus:border-ink",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-1 size-3 text-faint" />
    </span>
  );
});

export function FieldLabel({ htmlFor, children, hint }: { htmlFor: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-3">
      <span className="label">{children}</span>
      {hint ? <span className="text-xs text-faint">{hint}</span> : null}
    </label>
  );
}
