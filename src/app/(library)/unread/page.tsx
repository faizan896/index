import type { Metadata } from "next";

import { LibraryView } from "@/components/library/LibraryView";
import { PageHeading } from "@/components/library/PageHeading";

export const metadata: Metadata = { title: "Unread" };

export default async function UnreadPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <LibraryView
      preset={{ kind: "status", status: "unread" }}
      searchParams={await searchParams}
      heading={<PageHeading title="Unread" subtitle="Saved, not yet started." />}
      hideFilters={["status"]}
      emptyState={{ title: "Nothing unread." }}
    />
  );
}
