import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LibraryView } from "@/components/library/LibraryView";
import { PageHeading } from "@/components/library/PageHeading";
import { getTagBySlug } from "@/lib/server/queries";

interface TagPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Pick<TagPageProps, "params">): Promise<Metadata> {
  const { slug } = await params;
  const tag = await getTagBySlug(slug);
  return { title: tag?.name ?? "Not found" };
}

export default async function TagPage({ params, searchParams }: TagPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const tag = await getTagBySlug(slug);
  if (!tag) notFound();

  return (
    <LibraryView
      preset={{ kind: "tag", tagId: tag.id }}
      searchParams={query}
      heading={<PageHeading label="Tag" title={tag.name} />}
      emptyState={{ title: "Nothing here yet.", body: "Items with this tag will appear here." }}
    />
  );
}
