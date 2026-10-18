import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CollectionHeader } from "@/components/collections/CollectionHeader";
import { LibraryView } from "@/components/library/LibraryView";
import { getCollection } from "@/lib/server/queries";
import { isUuid } from "@/lib/validate";

interface CollectionPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Ids are stored lowercase; an address typed in capitals still finds the collection. */
async function findCollection(id: string) {
  return isUuid(id) ? getCollection(id.toLowerCase()) : null;
}

export async function generateMetadata({ params }: Pick<CollectionPageProps, "params">): Promise<Metadata> {
  const { id } = await params;
  const collection = await findCollection(id);
  return { title: collection?.name ?? "Not found" };
}

export default async function CollectionPage({ params, searchParams }: CollectionPageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const collection = await findCollection(id);
  if (!collection) notFound();

  return (
    <LibraryView
      preset={{ kind: "collection", collectionId: collection.id }}
      searchParams={query}
      heading={<CollectionHeader collection={collection} />}
      rowAction="remove-from-collection"
      emptyState={{ title: "This collection is empty.", body: "Open any article and choose Add to collection." }}
    />
  );
}
