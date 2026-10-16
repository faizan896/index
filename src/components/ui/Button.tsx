import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cx } from "@/lib/cx";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a quiet pending state and disables the button. */
  pending?: boolean;
}

const VARIANT: Record<ButtonVariant, string> = {
  // Solid ink: the single primary action in a view.
  primary: "bg-ink text-paper border border-ink hover:bg-ink-soft hover:border-ink-soft",
  // Hairline outline: secondary actions.
  secondary: "bg-paper text-ink border border-rule-strong hover:border-ink",
  // Text only: tertiary actions that should nearly disappear.
  quiet: "bg-transparent text-muted border border-transparent hover:text-ink",
  danger: "bg-transparent text-danger border border-transparent hover:underline underline-offset-4",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-8 px-3.5 text-sm",
};

/** Small, rectangular, typographic. Never oversized, never pill-shaped. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", pending = false, disabled, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={cx(
        "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-control)] font-medium transition-colors duration-100",
        "disabled:cursor-default disabled:opacity-45",
        VARIANT[variant],
        variant === "quiet" || variant === "danger" ? (size === "sm" ? "h-7 px-1" : "h-8 px-1.5") : SIZE[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
