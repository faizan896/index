import type { Metadata } from "next";

import { EmailSignInForm } from "@/components/auth/EmailSignInForm";
import { GoogleSignInForm } from "@/components/auth/GoogleSignInForm";
import { loginErrorMessage, loginNextPath } from "@/components/auth/login-params";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = loginNextPath(params.next);
  const error = loginErrorMessage(params.error);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 pb-[12vh] pt-16">
      <h1 className="font-serif text-hero font-normal italic tracking-[-0.01em] text-ink">Index</h1>
      <p className="mt-2 text-sm text-muted">A private library for everything worth reading.</p>

      {error ? (
        <p role="alert" className="mt-8 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-12">
        <GoogleSignInForm next={next} />

        <div aria-hidden="true" className="my-8 flex items-center gap-3 text-xs text-faint">
          <span className="h-px flex-1 bg-rule" />
          or
          <span className="h-px flex-1 bg-rule" />
        </div>

        <EmailSignInForm next={next} />
      </div>
    </main>
  );
}
