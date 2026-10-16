"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { validateManualTerm } from "@/lib/core/classify/taxonomy";
import { parseUserUrl } from "@/lib/core/url";
import { dbFailure, fail, getActionContext, NOT_FOUND, ok, SIGNED_OUT } from "@/lib/server/action-context";
import type { SavedLinkRow } from "@/lib/server/database.types";
import { loadListItem } from "@/lib/server/items";
import { processLink } from "@/lib/server/process";
import type { ServerSupabase } from "@/lib/server/supabase";
import type {
  ActionResult,
  LinkDetailsPatch,
  LinkListItem,
  ReadingStatus,
  SaveLinkResult,
  TagRef,
} from "@/lib/types";
import { isReadingStatus, isUuid, optionalLine, optionalText, parseDateInput } from "@/lib/validate";

const MAX_CATEGORIES_PER_LINK = 10;
const GENERIC = "That didn't work. Please try again.";

function refreshLibrary(): void {
  revalidatePath("/", "layout");
}

/**
 * Validates and normalizes the URL, saves it (or finds the existing copy) and
 * returns at once; fetching metadata and categorizing continue in the
 * background via `after()`. New links come back with metadataStatus "pending".
 */
export async function saveLink(rawUrl: string): Promise<ActionResult<SaveLinkResult>> {
  if (typeof rawUrl !== "string") return fail("Paste a link to save it.");
  const parsed = parseUserUrl(rawUrl);
  if (!parsed.ok) return fail(parsed.error);

  const context = await getActionContext();
  if (!context) return fail(SIGNED_OUT);
  const { supabase } = context;

  const { data, error } = await supabase.rpc("save_link", {
    p_url: parsed.url,
    p_normalized_url: parsed.normalized,
    p_domain: parsed.domain,
    p_title: null,
  });
  const saved = data?.[0];
  if (error || !saved) return dbFailure("saveLink", error, "Index couldn't save that link. Please try again.");

  let link: LinkListItem | null;
  try {
    link = await loadListItem(supabase, saved.link_id);
  } catch (loadError) {
    return dbFailure("saveLink: load", loadError, "Saved, but Index couldn't show it yet. Refresh to see it.");
  }
  if (!link) return fail("Index couldn't save that link. Please try again.");

  if (!saved.duplicate) {
    after(() => processLink(supabase, saved.link_id));
    refreshLibrary();
  } else if (link.metadataStatus === "failed" || link.metadataStatus === "pending" || link.classificationStatus === "pending") {
    // Pasting a link again is a natural way to say "try that one again".
    after(() => processLink(supabase, saved.link_id));
  }
  return ok({ link, duplicate: saved.duplicate });
}

const DETAIL_LIMITS = { title: 500, author: 300, siteName: 200, description: 2000 } as const;

export async function updateLinkDetails(linkId: string, patch: LinkDetailsPatch): Promise<ActionResult<LinkListItem>> {
  if (!isUuid(linkId) || typeof patch !== "object" || patch === null) return fail(NOT_FOUND);

  const update: Partial<SavedLinkRow> = {};
  const title = optionalLine(patch.title, DETAIL_LIMITS.title);
  const author = optionalLine(patch.author, DETAIL_LIMITS.author);
  const siteName = optionalLine(patch.siteName, DETAIL_LIMITS.siteName);
  const description = optionalText(patch.description, DETAIL_LIMITS.description);
  if (title !== undefined) update.title = title;
  if (author !== undefined) update.author = author;
  if (siteName !== undefined) update.site_name = siteName;
  if (description !== undefined) update.description = description;
  if (typeof patch.publishedAt === "string") {
    const published = parseDateInput(patch.publishedAt);
    if (published === "invalid") return fail("Use a real date for the publication date.");
    update.published_at = published;
  }
  if (Object.keys(update).length === 0) return fail("Nothing to save.");

  const context = await getActionContext();
  if (!context) return fail(SIGNED_OUT);
  const { supabase } = context;

  const { data, error } = await supabase.from("saved_links").update(update).eq("id", linkId).select("id").maybeSingle();
  if (error) return dbFailure("updateLinkDetails", error);
  if (!data) return fail(NOT_FOUND);

  try {
    const link = await loadListItem(supabase, linkId);
    if (!link) return fail(NOT_FOUND);
    refreshLibrary();
    return ok(link);
  } catch (loadError) {
    return dbFailure("updateLinkDetails: load", loadError);
  }
}

export async function setLinkStatus(linkId: string, status: ReadingStatus): Promise<ActionResult> {
  if (!isUuid(linkId)) return fail(NOT_FOUND);
  if (!isReadingStatus(status)) return fail("That isn't a reading status.");
  const context = await getActionContext();
  if (!context) return fail(SIGNED_OUT);

  const { data, error } = await context.supabase.from("saved_links").update({ status }).eq("id", linkId).select("id").maybeSingle();
  if (error) return dbFailure("setLinkStatus", error, "Couldn't update the reading status.");
  if (!data) return fail(NOT_FOUND);
  refreshLibrary();
  return ok();
}

export async function setLinkFavorite(linkId: string, favorite: boolean): Promise<ActionResult> {
  if (!isUuid(linkId)) return fail(NOT_FOUND);
  if (typeof favorite !== "boolean") return fail(GENERIC);
  const context = await getActionContext();
  if (!context) return fail(SIGNED_OUT);

  const { data, error } = await context.supabase
    .from("saved_links")
    .update({ is_favorite: favorite })
    .eq("id", linkId)
    .select("id")
    .maybeSingle();
  if (error) return dbFailure("setLinkFavorite", error, "Couldn't update favorites.");
  if (!data) return fail(NOT_FOUND);
  refreshLibrary();
  return ok();
}

export async function deleteLink(linkId: string): Promise<ActionResult> {
  if (!isUuid(linkId)) return fail(NOT_FOUND);
  const context = await getActionContext();
  if (!context) return fail(SIGNED_OUT);

  const { data: tags } = await context.supabase.from("link_tags").select("tag_id").eq("link_id", linkId);
  const { error } = await context.supabase.from("saved_links").delete().eq("id", linkId);
  if (error) return dbFailure("deleteLink", error, "Couldn't delete this item.");
  await removeOrphanTags(
    context.supabase,
    (tags ?? []).map((row) => row.tag_id),
  );
  refreshLibrary();
  return ok();
}

/**
 * Re-runs fetching and categorizing for one link and waits for it (used by
 * "Try again", and by clients whose background processing stalled).
 */
export async function retryLinkProcessing(linkId: string): Promise<ActionResult<LinkListItem>> {
  if (!isUuid(linkId)) return fail(NOT_FOUND);
  const context = await getActionContext();
  if (!context) return fail(SIGNED_OUT);

  await processLink(context.supabase, linkId, { force: true });
  try {
    const link = await loadListItem(context.supabase, linkId);
    if (!link) return fail(NOT_FOUND);
    refreshLibrary();
    return ok(link);
  } catch (error) {
    return dbFailure("retryLinkProcessing", error);
  }
}

/** Replaces the link's categories with these names (creating any that don't exist). */
export async function setLinkCategories(linkId: string, names: string[]): Promise<ActionResult<LinkListItem>> {
  if (!isUuid(linkId)) return fail(NOT_FOUND);
  if (!Array.isArray(names)) return fail(GENERIC);

  const categories = new Map<string, { name: string; slug: string }>();
  for (const raw of names) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const term = validateManualTerm(raw);
    if (!term.ok) return fail(term.error);
    if (!categories.has(term.slug)) categories.set(term.slug, { name: term.name, slug: term.slug });
  }
  if (categories.size > MAX_CATEGORIES_PER_LINK) return fail(`Use at most ${MAX_CATEGORIES_PER_LINK} categories per item.`);

  const context = await getActionContext();
  if (!context) return fail(SIGNED_OUT);
  const { supabase } = context;

  const { error } = await supabase.rpc("set_link_categories", {
    p_link_id: linkId,
    p_categories: [...categories.values()],
  });
  if (error) return error.code === "P0002" ? fail(NOT_FOUND) : dbFailure("setLinkCategories", error, "Couldn't save the categories.");

  try {
    const link = await loadListItem(supabase, linkId);
    if (!link) return fail(NOT_FOUND);
    refreshLibrary();
    return ok(link);
  } catch (loadError) {
    return dbFailure("setLinkCategories: load", loadError);
  }
}

export async function addLinkTag(linkId: string, name: string): Promise<ActionResult<TagRef>> {
  if (!isUuid(linkId)) return fail(NOT_FOUND);
  if (typeof name !== "string") return fail("Type a tag first.");
  const term = validateManualTerm(name);
  if (!term.ok) return fail(term.error);

  const context = await getActionContext();
  if (!context) return fail(SIGNED_OUT);

  const { data, error } = await context.supabase.rpc("add_link_tag", {
    p_link_id: linkId,
    p_name: term.name,
    p_slug: term.slug,
  });
  if (error) return error.code === "P0002" ? fail(NOT_FOUND) : dbFailure("addLinkTag", error, "Couldn't add the tag.");
  const tag = data?.[0];
  if (!tag) return fail("Couldn't add the tag.");
  refreshLibrary();
  return ok({ id: tag.id, name: tag.name, slug: tag.slug });
}

export async function removeLinkTag(linkId: string, tagId: string): Promise<ActionResult> {
  if (!isUuid(linkId) || !isUuid(tagId)) return fail(NOT_FOUND);
  const context = await getActionContext();
  if (!context) return fail(SIGNED_OUT);

  const { error } = await context.supabase.from("link_tags").delete().eq("link_id", linkId).eq("tag_id", tagId);
  if (error) return dbFailure("removeLinkTag", error, "Couldn't remove the tag.");
  await removeOrphanTags(context.supabase, [tagId]);
  refreshLibrary();
  return ok();
}

/** Tags exist only to describe links; one that describes nothing is clutter. */
async function removeOrphanTags(supabase: ServerSupabase, tagIds: string[]): Promise<void> {
  if (tagIds.length === 0) return;
  const { data: used, error } = await supabase.from("link_tags").select("tag_id").in("tag_id", tagIds);
  if (error) return;
  const usedIds = new Set((used ?? []).map((row) => row.tag_id));
  const orphans = tagIds.filter((id) => !usedIds.has(id));
  if (orphans.length) await supabase.from("tags").delete().in("id", orphans);
}
