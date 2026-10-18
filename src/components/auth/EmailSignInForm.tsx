"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { BoxInput, FieldLabel } from "@/components/ui/Field";
import { signInWithEmail, type EmailSignInState } from "@/lib/actions/auth";

const INITIAL_STATE: EmailSignInState = { status: "idle" };

/** The magic-link form: an email field and one button, then "Check your inbox." */
export function EmailSignInForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signInWithEmail, INITIAL_STATE);
  // A result the reader has moved past (typed again, or chose "Use a different email").
  const [setAside, setSetAside] = useState<EmailSignInState | null>(null);
  const current = state === setAside ? null : state;
  const sent = current?.status === "sent";
  const error =
    current?.status === "error" ? (current.message ?? "Index couldn't send the email. Please try again.") : null;

  const inputRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLParagraphElement>(null);
  const focusInput = useRef(false);
  const inputId = useId();
  const errorId = useId();

  // Focus follows the swap between form and confirmation, so keyboard and screen-reader users keep their place.
  useEffect(() => {
    if (sent) {
      confirmationRef.current?.focus();
    } else if (focusInput.current) {
      focusInput.current = false;
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [sent]);

  if (sent) {
    return (
      <div>
        <p ref={confirmationRef} tabIndex={-1} className="text-base text-ink outline-none">
          Check your inbox.
        </p>
        <p className="mt-1 text-sm text-muted">
          We sent a sign-in link to <span className="break-all text-ink">{current.email}</span>.
        </p>
        <button
          type="button"
          onClick={() => {
            focusInput.current = true;
            setSetAside(state);
          }}
          className="link -my-1.5 mt-5 inline-block py-1.5 text-sm text-muted transition-colors hover:text-ink"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="next" value={next} />
      <FieldLabel htmlFor={inputId}>Email</FieldLabel>
      <BoxInput
        ref={inputRef}
        id={inputId}
        name="email"
        type="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        // The form resets after each submission; this keeps what was typed when there's an error.
        defaultValue={state.email ?? ""}
        readOnly={pending}
        onChange={() => {
          if (error) setSetAside(state);
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      <Button type="submit" variant="primary" pending={pending} className="mt-3 w-full">
        {pending ? "Sending…" : "Email me a sign-in link"}
      </Button>
      {error ? (
        <p id={errorId} role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}
