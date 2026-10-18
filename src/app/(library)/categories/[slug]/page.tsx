import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LibraryView } from "@/components/library/LibraryView";
import { PageHeading } from "@/components/library/PageHeading";
import { pluralize } from "@/lib/format";
import { getCategoryBySlug } from "@/lib/server/queries";

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Pick<CategoryPageProps, "params">): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  return { title: category?.name ?? "Not found" };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  return (
    <LibraryView
      preset={{ kind: "category", categoryId: category.id }}
      searchParams={query}
      heading={
        <PageHeading
          label="Category"
          title={category.name}
          subtitle={
            <>
              {pluralize(category.linkCount, "saved", "saved")} ·{" "}
              <Link href="/categories" className="link">
                Manage categories
              </Link>
            </>
          }
        />
      }
      hideFilters={["category"]}
      emptyState={{ title: "Nothing here yet.", body: "Items filed under this category will appear here." }}
    />
  );
}
