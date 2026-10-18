import type { Metadata } from "next";

import { LibraryView } from "@/components/library/LibraryView";
import { PageHeading } from "@/components/library/PageHeading";

export const metadata: Metadata = { title: "Finished" };

export default async function FinishedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <LibraryView
      preset={{ kind: "status", status: "finished" }}
      searchParams={await searchParams}
      heading={<PageHeading title="Finished" subtitle="Read to the end." />}
      hideFilters={["status"]}
      emptyState={{ title: "Nothing finished yet.", body: "Items you mark as Finished collect here." }}
    />
  );
}
