import type { Metadata } from "next";

import { LibraryView } from "@/components/library/LibraryView";
import { PageHeading } from "@/components/library/PageHeading";

export const metadata: Metadata = { title: "Your Library" };

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <LibraryView
      preset={{ kind: "all" }}
      searchParams={await searchParams}
      heading={<PageHeading title="Your Library" size="hero" />}
      showAddLink
      showStats
      emptyState={{
        title: "Nothing saved yet.",
        body: "Paste a link above to start your library. Index fetches the title and files it under the right subject.",
      }}
    />
  );
}
