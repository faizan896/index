"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/Button";

/** Shown when a library page fails to load (the sidebar stays). */
export default function LibraryError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function retry() {
    // Re-run the server components as well as re-rendering this segment.
    startTransition(() => {
      router.refresh();
      reset();
    });
  }

  return (
    <div role="alert" className="py-16">
      <p className="font-serif text-title text-ink">Something went wrong loading your library.</p>
      <p className="mt-2 text-sm text-muted">It is usually a passing problem.</p>
      <Button className="mt-6" size="sm" pending={pending} onClick={retry}>
        Try again
      </Button>
    </div>
  );
}
