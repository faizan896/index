"use server";

import { revalidatePath } from "next/cache";

import { validateManualTerm } from "@/lib/core/classify/taxonomy";
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, parseBookmarksCsv, type ImportCandidate } from "@/lib/core/import";
import { dbFailure, fail, getActionContext, ok, SIGNED_OUT } from "@/lib/server/action-context";
import type { Json } from "@/lib/server/database.types";
import { findPendingLinkIds, processLink } from "@/lib/server/process";
import type { ActionResult, ImportSummary, ProcessPendingSummary } from "@/lib/types";

export async function setAiEnabled(enabled: boolean): Promise<ActionResult> {
  if (typeof enabled !== "boolean") return fail("That didn't work. Please try again.");
  const context = await getActionContext();
  if (!context) return fail(SIGNED_OUT);

  const { error } = await context.supabase
    .from("user_settings")
    .upsert({ user_id: context.user.id, ai_enabled: enabled }, { onConflict: "user_id" });
  if (error) return dbFailure("setAiEnabled", error, "Couldn't save the setting.");
  revalidatePath("/settings");
  return ok();
}

function terms(names: string[]): Array<{ name: string; slug: string }> {
  const seen = new Map<string, { name: string; slug: string }>();
  for (const name of names) {
    const term = validateManualTerm(name);
    if (term.ok && !seen.has(term.slug)) seen.set(term.slug, { name: term.name, slug: term.slug });
  }
  return [...seen.values()];
}

function toImportRow(candidate: ImportCandidate) {
  return {
    url: candidate.url,
    normalized_url: candidate.normalizedUrl,
    domain: candidate.domain,
    title: candidate.title,
    description: candidate.description,
    status: candidate.status,
    is_favorite: candidate.isFavorite,
    created_at: candidate.createdAt,
    note: candidate.note,
    categories: terms(candidate.categories),
    tags: terms(candidate.tags),
  };
}

const IMPORT_CHUNK = 500;

/** Reads the CSV in formData field "file" (max 4 MB, 5,000 rows) and imports it. */
export async function importBookmarks(formData: FormData): Promise<ActionResult<ImportSummary>> {
  const file = formData instanceof FormData ? formData.get("file") : null;
  if (!(file instanceof File) || file.size === 0) return fail("Choose a CSV file to import.");
  if (file.size > MAX_IMPORT_BYTES) return fail("That file is larger than 4 MB. Split it and import the parts.");

  const context = await getActionContext();
  if (!context) return fail(SIGNED_OUT);

  let text: string;
  try {
    text = await file.text();
  } catch {
    return fail("Index couldn't read that file.");
  }

  const parsed = parseBookmarksCsv(text, { maxRows: MAX_IMPORT_ROWS });
  if (parsed.candidates.length === 0) {
    return fail(
      parsed.invalid > 0
        ? "None of the rows had a link Index could use. The file needs a column of URLs."
        : "That file doesn't contain any links.",
    );
  }

  let imported = 0;
  let duplicates = parsed.duplicatesInFile;
  for (let start = 0; start < parsed.candidates.length; start += IMPORT_CHUNK) {
    const chunk = parsed.candidates.slice(start, start + IMPORT_CHUNK).map(toImportRow);
    const { data, error } = await context.supabase.rpc("import_links", { p_rows: chunk as unknown as Json });
    if (error) {
      if (imported > 0) revalidatePath("/", "layout");
      return dbFailure(
        "importBookmarks",
        error,
        imported > 0
          ? `Imported ${imported} links, then something went wrong. Import the file again to add the rest; existing links are skipped.`
          : "Index couldn't import that file.",
      );
    }
    const counts = (data ?? {}) as { imported?: number; duplicates?: number };
    imported += Number(counts.imported ?? 0);
    duplicates += Number(counts.duplicates ?? 0);
  }

  revalidatePath("/", "layout");
  return ok({ imported, duplicates, invalid: parsed.invalid, skipped: parsed.skipped });
}

const BATCH_SIZE = 3;

/**
 * Fetches and categorizes a few links still waiting for it (after an import,
 * or if background work was interrupted). Call repeatedly until `remaining`
 * is 0.
 */
export async function processPendingLinks(): Promise<ActionResult<ProcessPendingSummary>> {
  const context = await getActionContext();
  if (!context) return fail(SIGNED_OUT);

  const { ids } = await findPendingLinkIds(context.supabase, BATCH_SIZE);
  await Promise.all(ids.map((id) => processLink(context.supabase, id)));
  const { remaining } = await findPendingLinkIds(context.supabase, 1);

  if (ids.length) revalidatePath("/", "layout");
  return ok({ processed: ids.length, remaining });
}
