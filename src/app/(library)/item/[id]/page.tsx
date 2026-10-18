import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/item/BackLink";
import { CategoriesSection } from "@/components/item/CategoriesSection";
import { CollectionsSection } from "@/components/item/CollectionsSection";
import { processingPhase } from "@/components/item/item-format";
import { ItemDetails } from "@/components/item/ItemDetails";
import { ItemHeader } from "@/components/item/ItemHeader";
import { NotesSection } from "@/components/item/NotesSection";
import { RelatedReads } from "@/components/item/RelatedReads";
import { TagsSection } from "@/components/item/TagsSection";
import { displayTitle } from "@/lib/format";
import { getCategorySummaries, getCollectionSummaries, getLinkDetail, getRelatedLinks } from "@/lib/server/queries";
import { isUuid } from "@/lib/validate";

interface ItemPageProps {
  params: Promise<{ id: string }>;
}

/** Ids are stored lowercase; an address typed in capitals still finds the item. */
function linkIdFrom(id: string): string | null {
  return isUuid(id) ? id.toLowerCase() : null;
}

export async function generateMetadata({ params }: ItemPageProps): Promise<Metadata> {
  const { id } = await params;
  const linkId = linkIdFrom(id);
  const link = linkId ? await getLinkDetail(linkId) : null;
  return { title: link ? displayTitle(link) : "Not found" };
}

export default async function ItemPage({ params }: ItemPageProps) {
  const { id } = await params;
  const linkId = linkIdFrom(id);
  if (!linkId) notFound();

  const [link, related, categories, collections] = await Promise.all([
    getLinkDetail(linkId),
    getRelatedLinks(linkId),
    getCategorySummaries(),
    getCollectionSummaries(),
  ]);
  if (!link) notFound();

  return (
    <article>
      <BackLink />
      {/* Only what each client part needs crosses to the browser (notes, for one, can be long). */}
      <ItemHeader
        link={{
          id: link.id,
          url: link.url,
          domain: link.domain,
          title: link.title,
          description: link.description,
          author: link.author,
          siteName: link.siteName,
          publishedAt: link.publishedAt,
          readingMinutes: link.readingMinutes,
          status: link.status,
          isFavorite: link.isFavorite,
          metadataStatus: link.metadataStatus,
          classificationStatus: link.classificationStatus,
          metadataError: link.metadataError,
        }}
      />

      <div className="mt-12">
        <CategoriesSection
          linkId={link.id}
          categories={link.categories}
          allCategories={categories.map(({ id: categoryId, name, slug }) => ({ id: categoryId, name, slug }))}
          sorting={processingPhase(link) !== "idle"}
        />
        <TagsSection linkId={link.id} tags={link.tags} />
        <CollectionsSection
          linkId={link.id}
          collections={link.collections}
          suggested={link.suggestedCollections}
          allCollections={collections.map(({ id: collectionId, name }) => ({ id: collectionId, name }))}
        />
        <NotesSection linkId={link.id} notes={link.notes} />
        <ItemDetails link={link} />
        <RelatedReads related={related} />
      </div>
    </article>
  );
}
