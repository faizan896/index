import type { Metadata } from "next";

import { CategoryManager } from "@/components/categories/CategoryManager";
import { NewCategoryForm } from "@/components/categories/NewCategoryForm";
import { PageHeading } from "@/components/library/PageHeading";
import { EmptyState } from "@/components/ui/EmptyState";
import { getCategorySummaries } from "@/lib/server/queries";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const categories = await getCategorySummaries();

  return (
    <>
      <PageHeading
        title="Categories"
        subtitle="Index files new links under these automatically. Rename, merge or remove them at any time."
      />
      <NewCategoryForm existingIds={categories.map((category) => category.id)} />
      <div className="mt-8">
        {categories.length > 0 ? (
          <CategoryManager categories={categories} />
        ) : (
          <EmptyState title="No categories yet.">They appear as you save links.</EmptyState>
        )}
      </div>
    </>
  );
}
