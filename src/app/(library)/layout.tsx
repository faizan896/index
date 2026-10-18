import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/AppShell";
import { getCategorySummaries, getCollectionSummaries, getLibraryStats, requireUser } from "@/lib/server/queries";

export const dynamic = "force-dynamic";
// Server actions run within the page's function; saving and "Try again" may fetch and categorize.
export const maxDuration = 60;

export default async function LibraryLayout({ children }: { children: ReactNode }) {
  await requireUser();
  // Collections load alongside so the pages that need them reuse this request's cached result.
  const [categories, stats] = await Promise.all([getCategorySummaries(), getLibraryStats(), getCollectionSummaries()]);

  return (
    <AppShell categories={categories} stats={stats}>
      {children}
    </AppShell>
  );
}
