"use server";

/** CONTRACT STUB — signatures are final; bodies are implemented by the server layer. */
import type { ActionResult, CollectionRef } from "@/lib/types";

export async function createCollection(_name: string, _description?: string): Promise<ActionResult<CollectionRef>> {
  throw new Error("not implemented");
}

export async function updateCollection(
  _collectionId: string,
  _patch: { name?: string; description?: string },
): Promise<ActionResult<CollectionRef>> {
  throw new Error("not implemented");
}

/** Deletes the collection only; the links in it stay in the library. */
export async function deleteCollection(_collectionId: string): Promise<ActionResult> {
  throw new Error("not implemented");
}

export async function addLinkToCollection(_linkId: string, _collectionId: string): Promise<ActionResult> {
  throw new Error("not implemented");
}

export async function removeLinkFromCollection(_linkId: string, _collectionId: string): Promise<ActionResult> {
  throw new Error("not implemented");
}

/** Hides an AI collection suggestion on this link without adding it. */
export async function dismissCollectionSuggestion(_linkId: string, _collectionId: string): Promise<ActionResult> {
  throw new Error("not implemented");
}
