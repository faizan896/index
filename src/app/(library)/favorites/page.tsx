import type { Metadata } from "next";

import { LibraryView } from "@/components/library/LibraryView";
import { PageHeading } from "@/components/library/PageHeading";

export const metadata: Metadata = { title: "Favorites" };

export default async function FavoritesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <LibraryView
      preset={{ kind: "favorites" }}
      searchParams={await searchParams}
      heading={<PageHeading title="Favorites" subtitle="The ones worth keeping close." />}
      hideFilters={["favorite"]}
      emptyState={{ title: "No favorites yet.", body: "Star an item to keep it here." }}
    />
  );
}
