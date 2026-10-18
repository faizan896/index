import type { Metadata } from "next";

import { LibraryView } from "@/components/library/LibraryView";
import { PageHeading } from "@/components/library/PageHeading";

export const metadata: Metadata = { title: "Unsorted" };

export default async function UnsortedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <LibraryView
      preset={{ kind: "unsorted" }}
      searchParams={await searchParams}
      heading={<PageHeading title="Unsorted" subtitle="Not yet filed under a category." />}
      hideFilters={["category"]}
      emptyState={{ title: "Everything is sorted.", body: "Links without a category wait here until you or Index files them." }}
    />
  );
}
