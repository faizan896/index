"use client";

import type { CSSProperties } from "react";

import { Button } from "@/components/ui/Button";
import "./globals.css";

/*
 * This replaces the root layout, so next/font's variables aren't set here.
 * Point them at system faces so the design tokens' font stacks still resolve.
 */
const FONT_FALLBACKS = {
  "--font-inter": "system-ui",
  "--font-newsreader": "Georgia",
} as CSSProperties;

/** Shown when even the root layout fails. It renders its own document. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" style={FONT_FALLBACKS}>
      <body className="min-h-dvh bg-paper text-ink">
        <title>Something went wrong · Index</title>
        <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 pb-[12vh] pt-16">
          <div role="alert">
            <h1 className="font-serif text-title font-normal text-ink">Something went wrong.</h1>
            <p className="mt-2 text-sm text-muted">Index couldn&apos;t load this page. It is usually a passing problem.</p>
          </div>
          <div className="mt-6">
            <Button size="sm" onClick={() => reset()}>
              Try again
            </Button>
          </div>
        </main>
      </body>
    </html>
  );
}
