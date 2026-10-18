import type { Metadata } from "next";

import { CollectionList } from "@/components/collections/CollectionList";
import { NewCollectionForm } from "@/components/collections/NewCollectionForm";
import { PageHeading } from "@/components/library/PageHeading";
import { EmptyState } from "@/components/ui/EmptyState";
import { getCollectionSummaries } from "@/lib/server/queries";

export const metadata: Metadata = { title: "Collections" };

export default async function CollectionsPage() {
  const collections = await getCollectionSummaries();

  return (
    <>
      <PageHeading title="Collections" subtitle="Reading lists and research projects you put together yourself." />
      <NewCollectionForm />
      <div className="mt-10">
        {collections.length > 0 ? (
          <CollectionList collections={collections} now={new Date()} />
        ) : (
          <EmptyState title="No collections yet.">
            Collections are for your own reading lists — “The Future of Money”, “Things Worth Revisiting”. Add
            articles to them from any article&apos;s page.
          </EmptyState>
        )}
      </div>
    </>
  );
}
