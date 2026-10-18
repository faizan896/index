import type { Metadata } from "next";

import { LibraryView } from "@/components/library/LibraryView";
import { PageHeading } from "@/components/library/PageHeading";

export const metadata: Metadata = { title: "Reading" };

export default async function ReadingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <LibraryView
      preset={{ kind: "status", status: "reading" }}
      searchParams={await searchParams}
      heading={<PageHeading title="Reading" subtitle="Started, not yet finished." />}
      hideFilters={["status"]}
      emptyState={{ title: "Nothing in progress.", body: "Set an item to Reading to keep it here while you read." }}
    />
  );
}
