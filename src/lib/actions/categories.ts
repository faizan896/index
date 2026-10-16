"use server";

import { revalidatePath } from "next/cache";

import { validateManualTerm } from "@/lib/core/classify/taxonomy";
import { dbFailure, fail, getActionContext, ok, SIGNED_OUT } from "@/lib/server/action-context";
import type { ActionResult, CategoryRef } from "@/lib/types";
import { isUuid } from "@/lib/validate";

const MISSING = "That category no longer exists.";

/** Creates a category (or returns the existing one with the same name). */
export async function createCategory(name: string): Promise<ActionResult<CategoryRef>> {
  if (typeof name !== "string") return fail("Name the category first.");
  const term = validateManualTerm(name);
  if (!term.ok) return fail(term.error);

  const context = await getActionContext();
  if (!context) return fail(SIGNED_OUT);
  const { supabase } = context;

  const existing = await supabase.from("categories").select("id, name, slug").eq("slug", term.slug).maybeSingle();
  if (existing.error) return dbFailure("createCategory: lookup", existing.error);
  if (existing.data) return ok(existing.data);

  const { data, error } = await supabase
    .from("categories")
    .insert({ name: term.name, slug: term.slug, created_by: "user" })
    .select("id, name, slug")
    .single();
  if (error) {
    // Created concurrently: return the winner.
    if (error.code === "23505") {
      const again = await supabase.from("categories").select("id, name, slug").eq("slug", term.slug).maybeSingle();
      if (again.data) return ok(again.data);
    }
    return dbFailure("createCategory", error, "Couldn't create the category.");
  }
  revalidatePath("/", "layout");
  return ok(data);
}

/** Renames; if another category already has that name, fails with a message suggesting merge. */
export async function renameCategory(categoryId: string, name: string): Promise<ActionResult<CategoryRef>> {
  if (!isUuid(categoryId)) return fail(MISSING);
  if (typeof name !== "string") return fail("Give the category a name.");
  const term = validateManualTerm(name);
  if (!term.ok) return fail(term.error);

  const context = await getActionContext();
  if (!context) return fail(SIGNED_OUT);
  const { supabase } = context;

  const clash = await supabase.from("categories").select("id, name").eq("slug", term.slug).neq("id", categoryId).maybeSingle();
  if (clash.error) return dbFailure("renameCategory: lookup", clash.error);
  if (clash.data) return fail(`There's already a category called “${clash.data.name}”. Merge the two instead.`);

  const { data, error } = await supabase
    .from("categories")
    .update({ name: term.name, slug: term.slug })
    .eq("id", categoryId)
    .select("id, name, slug")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return fail("There's already a category with that name. Merge the two instead.");
    return dbFailure("renameCategory", error, "Couldn't rename the category.");
  }
  if (!data) return fail(MISSING);
  revalidatePath("/", "layout");
  return ok(data);
}

/** Moves every link from source into target, then removes source. */
export async function mergeCategories(sourceId: string, targetId: string): Promise<ActionResult> {
  if (!isUuid(sourceId) || !isUuid(targetId)) return fail(MISSING);
  if (sourceId === targetId) return fail("Choose a different category to merge into.");

  const context = await getActionContext();
  if (!context) return fail(SIGNED_OUT);

  const { error } = await context.supabase.rpc("merge_categories", { p_source_id: sourceId, p_target_id: targetId });
  if (error) return error.code === "P0002" ? fail(MISSING) : dbFailure("mergeCategories", error, "Couldn't merge the categories.");
  revalidatePath("/", "layout");
  return ok();
}

/** Removes the category; its links stay in the library (Unsorted if they had no other category). */
export async function deleteCategory(categoryId: string): Promise<ActionResult> {
  if (!isUuid(categoryId)) return fail(MISSING);
  const context = await getActionContext();
  if (!context) return fail(SIGNED_OUT);

  const { error } = await context.supabase.from("categories").delete().eq("id", categoryId);
  if (error) return dbFailure("deleteCategory", error, "Couldn't delete the category.");
  revalidatePath("/", "layout");
  return ok();
}
