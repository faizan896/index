"use server";

/** CONTRACT STUB — signatures are final; bodies are implemented by the server layer. */
import type { ActionResult, CategoryRef } from "@/lib/types";

/** Creates a category (or returns the existing one with the same name). */
export async function createCategory(_name: string): Promise<ActionResult<CategoryRef>> {
  throw new Error("not implemented");
}

/** Renames; if another category already has that name, fails with a message suggesting merge. */
export async function renameCategory(_categoryId: string, _name: string): Promise<ActionResult<CategoryRef>> {
  throw new Error("not implemented");
}

/** Moves every link from source into target, then removes source. */
export async function mergeCategories(_sourceId: string, _targetId: string): Promise<ActionResult> {
  throw new Error("not implemented");
}

/** Removes the category; its links stay in the library (Unsorted if they had no other category). */
export async function deleteCategory(_categoryId: string): Promise<ActionResult> {
  throw new Error("not implemented");
}
