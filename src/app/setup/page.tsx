import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSupabaseConfig, isAiConfigured } from "@/lib/server/env";

export const metadata: Metadata = { title: "Setup" };
export const dynamic = "force-dynamic";

/** Shown instead of a crash when the deployment is missing its configuration. */
export default function SetupPage() {
  if (getSupabaseConfig()) redirect("/");

  return (
    <main className="mx-auto max-w-xl px-4 py-24 sm:px-6">
      <p className="font-serif text-hero">Index</p>
      <h1 className="mt-10 font-serif text-title">Almost there.</h1>
      <p className="mt-3 text-muted">
        This deployment doesn&apos;t have its Supabase settings yet. Add these environment variables, then
        redeploy (or restart the dev server):
      </p>
      <dl className="mt-8 divide-y divide-rule border-y border-rule text-sm">
        <div className="py-3">
          <dt className="font-mono text-ink">NEXT_PUBLIC_SUPABASE_URL</dt>
          <dd className="mt-1 text-muted">Your project URL, from Supabase → Project Settings → API.</dd>
        </div>
        <div className="py-3">
          <dt className="font-mono text-ink">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</dt>
          <dd className="mt-1 text-muted">The publishable (or anon) key from the same page. Never the secret key.</dd>
        </div>
        <div className="py-3">
          <dt className="font-mono text-ink">ANTHROPIC_API_KEY</dt>
          <dd className="mt-1 text-muted">
            Optional. Enables automatic categorization.{" "}
            {isAiConfigured() ? "Already set." : "Without it, links are saved as Unsorted."}
          </dd>
        </div>
      </dl>
      <p className="mt-8 text-sm text-muted">The README in the repository walks through every step.</p>
    </main>
  );
}
