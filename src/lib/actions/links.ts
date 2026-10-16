"use server";

/**
 * CONTRACT STUB — signatures are final; bodies are implemented by the server layer.
 * Every action re-checks the session, validates its input, never throws to the
 * client, and returns ActionResult.
 */
import type {
  ActionResult,
  LinkDetailsPatch,
  LinkListItem,
  ReadingStatus,
  SaveLinkResult,
  TagRef,
} from "@/lib/types";

/**
 * Validates and normalizes the URL, saves it (or finds the existing copy) and
 * returns at once; fetching metadata and categorizing continue in the
 * background via next/server `after()`. The returned item has
 * metadataStatus "pending" for new links.
 */
export async function saveLink(_rawUrl: string): Promise<ActionResult<SaveLinkResult>> {
  throw new Error("not implemented");
}

export async function updateLinkDetails(_linkId: string, _patch: LinkDetailsPatch): Promise<ActionResult<LinkListItem>> {
  throw new Error("not implemented");
}

export async function setLinkStatus(_linkId: string, _status: ReadingStatus): Promise<ActionResult> {
  throw new Error("not implemented");
}

export async function setLinkFavorite(_linkId: string, _favorite: boolean): Promise<ActionResult> {
  throw new Error("not implemented");
}

export async function deleteLink(_linkId: string): Promise<ActionResult> {
  throw new Error("not implemented");
}

/**
 * Re-runs fetching and categorizing for one link and waits for it to finish
 * (used by "Try again" and by clients whose background processing stalled).
 */
export async function retryLinkProcessing(_linkId: string): Promise<ActionResult<LinkListItem>> {
  throw new Error("not implemented");
}

/** Replaces the link's categories with these names (creating any that don't exist). */
export async function setLinkCategories(_linkId: string, _names: string[]): Promise<ActionResult<LinkListItem>> {
  throw new Error("not implemented");
}

export async function addLinkTag(_linkId: string, _name: string): Promise<ActionResult<TagRef>> {
  throw new Error("not implemented");
}

export async function removeLinkTag(_linkId: string, _tagId: string): Promise<ActionResult> {
  throw new Error("not implemented");
}
