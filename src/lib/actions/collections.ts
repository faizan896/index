"use server";

import { revalidatePath } from "next/cache";

import { dbFailure, fail, getActionContext, NOT_FOUND, ok, SIGNED_OUT } from "@/lib/server/action-context";
import type { ActionResult, CollectionRef } from "@/lib/types";
import { isUuid, optionalLine, optionalText } from "@/lib/validate";

const MISSING = "That collection no longer exists.";
const DUPLICATE_NAME = "You already have a collection with that name.";

export async function createCollection(name: string, description?: string): Promise<ActionResult<CollectionRef>> {
  const cleanName = optionalLine(name, 120);
  if (!cleanName) return fail("Name the collection first.");
  const cleanDescription = optionalText(description ?? "", 1000) ?? null;

  const context = await getActionContext();
  if (!context) return fail(SIGNED_OUT);

  const { data, error } = await context.supabase
    .from("collections")
    .insert({ name: cleanName, description: cleanDescription })
    .select("id, name")
    .single();
  if (error) return error.code === "23505" ? fail(DUPLICATE_NAME) : dbFailure("createCollection", error, "Couldn't create the collection.");
  revalidatePath("/", "layout");
  return ok(data);
}

export async function updateCollection(
  collectionId: string,
  patch: { name?: string; description?: string },
): Promise<ActionResult<CollectionRef>> {
  if (!isUuid(collectionId) || typeof patch !== "object" || patch === null) return fail(MISSING);
  const update: { name?: string; description?: string | null } = {};
  if (patch.name !== undefined) {
    const cleanName = optionalLine(patch.name, 120);
    if (!cleanName) return fail("A collection needs a name.");
    update.name = cleanName;
  }
  if (patch.description !== undefined) update.description = optionalText(patch.description, 1000) ?? null;
  if (Object.keys(update).length === 0) return fail("Nothing to save.");

  const context = await getActionContext();
  if (!context) return fail(SIGNED_OUT);

  const { data, error } = await context.supabase
    .from("collections")
    .update(update)
    .eq("id", collectionId)
    .select("id, name")
    .maybeSingle();
  if (error) return error.code === "23505" ? fail(DUPLICATE_NAME) : dbFailure("updateCollection", error, "Couldn't save the collection.");
  if (!data) return fail(MISSING);
  revalidatePath("/", "layout");
  return ok(data);
}

/** Deletes the collection only; the links in it stay in the library. */
export async function deleteCollection(collectionId: string): Promise<ActionResult> {
  if (!isUuid(collectionId)) return fail(MISSING);
  const context = await getActionContext();
  if (!context) return fail(SIGNED_OUT);

  const { error } = await context.supabase.from("collections").delete().eq("id", collectionId);
  if (error) return dbFailure("deleteCollection", error, "Couldn't delete the collection.");
  revalidatePath("/", "layout");
  return ok();
}

/** Drops one id from a link's AI collection suggestions. */
async function forgetSuggestion(
  supabase: NonNullable<Awaited<ReturnType<typeof getActionContext>>>["supabase"],
  linkId: string,
  collectionId: string,
): Promise<{ found: boolean; error: unknown }> {
  const { data, error } = await supabase.from("saved_links").select("suggested_collection_ids").eq("id", linkId).maybeSingle();
  if (error) return { found: false, error };
  if (!data) return { found: false, error: null };
  const remaining = (data.suggested_collection_ids ?? []).filter((id) => id !== collectionId);
  if (remaining.length !== (data.suggested_collection_ids ?? []).length) {
    const result = await supabase.from("saved_links").update({ suggested_collection_ids: remaining }).eq("id", linkId);
    if (result.error) return { found: true, error: result.error };
  }
  return { found: true, error: null };
}

export async function addLinkToCollection(linkId: string, collectionId: string): Promise<ActionResult> {
  if (!isUuid(linkId)) return fail(NOT_FOUND);
  if (!isUuid(collectionId)) return fail(MISSING);
  const context = await getActionContext();
  if (!context) return fail(SIGNED_OUT);

  const { error } = await context.supabase
    .from("collection_links")
    .upsert({ link_id: linkId, collection_id: collectionId }, { onConflict: "collection_id,link_id", ignoreDuplicates: true });
  if (error) {
    // The composite foreign keys reject ids that aren't this user's.
    if (error.code === "23503") return fail("That item or collection no longer exists.");
    return dbFailure("addLinkToCollection", error, "Couldn't add it to the collection.");
  }
  await forgetSuggestion(context.supabase, linkId, collectionId);
  // Touch the collection so lists sort by recent activity.
  await context.supabase.from("collections").update({ updated_at: new Date().toISOString() }).eq("id", collectionId);
  revalidatePath("/", "layout");
  return ok();
}

export async function removeLinkFromCollection(linkId: string, collectionId: string): Promise<ActionResult> {
  if (!isUuid(linkId) || !isUuid(collectionId)) return fail(NOT_FOUND);
  const context = await getActionContext();
  if (!context) return fail(SIGNED_OUT);

  const { error } = await context.supabase.from("collection_links").delete().eq("link_id", linkId).eq("collection_id", collectionId);
  if (error) return dbFailure("removeLinkFromCollection", error, "Couldn't remove it from the collection.");
  revalidatePath("/", "layout");
  return ok();
}

/** Hides an AI collection suggestion on this link without adding it. */
export async function dismissCollectionSuggestion(linkId: string, collectionId: string): Promise<ActionResult> {
  if (!isUuid(linkId) || !isUuid(collectionId)) return fail(NOT_FOUND);
  const context = await getActionContext();
  if (!context) return fail(SIGNED_OUT);

  const result = await forgetSuggestion(context.supabase, linkId, collectionId);
  if (result.error) return dbFailure("dismissCollectionSuggestion", result.error);
  if (!result.found) return fail(NOT_FOUND);
  revalidatePath(`/item/${linkId}`);
  return ok();
}
