import "server-only";

/**
 * The background half of saving a link: fetch the page, read its metadata,
 * categorize it, and write everything back.
 *
 * Runs after the save has already returned (via `after()`), from "Try again",
 * and from the pending-items processor after an import. It never throws: each
 * stage records its own outcome on the row (done / failed / skipped, with a
 * calm message), so a link is never lost because a site or the AI misbehaved.
 * A claim in the database stops two workers processing the same link.
 */
import { buildClassificationPrompt, classificationCacheKey, type ClassificationInput } from "@/lib/core/classify/prompt";
import { parseClassification, type RawClassification } from "@/lib/core/classify/parse";
import { resolveClassification } from "@/lib/core/classify/resolve";
import { extractMetadata, metadataFromUrl, type PageMetadata } from "@/lib/core/metadata";
import { fetchPage } from "@/lib/core/net/fetch-page";
import { normalizeUrl } from "@/lib/core/url";
import { ClassifierError, getClassifier } from "./anthropic";
import type { Json, SavedLinkRow } from "./database.types";
import { logServerError } from "./log";
import type { ServerSupabase } from "./supabase";

export interface ProcessOptions {
  /** Re-fetch even if metadata was already read, and categorize links skipped earlier. */
  force?: boolean;
}

type LinkUpdate = Partial<SavedLinkRow>;

const LIMITS = {
  url: 4096,
  title: 500,
  description: 2000,
  author: 300,
  siteName: 200,
  lang: 35,
  contentType: 200,
  excerpt: 6000,
  message: 500,
} as const;

function clip(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max).trimEnd() : trimmed;
}

function minutes(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.min(Math.max(Math.round(value), 1), 1440);
}

/**
 * A canonical URL worth recording. Pages sometimes declare their homepage as
 * canonical by mistake; trusting that would make every later save of the
 * homepage look like a duplicate of this article.
 */
function usableCanonical(candidate: string | null | undefined, link: SavedLinkRow): { url: string; normalized: string } | null {
  if (!candidate) return null;
  let canonical: URL;
  let original: URL;
  try {
    canonical = new URL(candidate);
    original = new URL(link.url);
  } catch {
    return null;
  }
  if (canonical.protocol !== "http:" && canonical.protocol !== "https:") return null;
  if ((canonical.pathname === "/" || canonical.pathname === "") && original.pathname.length > 1) return null;
  const url = canonical.toString();
  if (url.length > LIMITS.url) return null;
  return { url, normalized: normalizeUrl(url) };
}

interface MetadataOutcome {
  update: LinkUpdate;
  keywords: string[];
}

async function readPage(link: SavedLinkRow): Promise<MetadataOutcome> {
  const now = new Date().toISOString();
  const result = await fetchPage(link.url);

  if (!result.ok) {
    return {
      update: {
        metadata_status: "failed",
        metadata_error: clip(result.message, LIMITS.message),
        fetched_at: now,
        resolved_url: result.finalUrl && result.finalUrl !== link.url ? clip(result.finalUrl, LIMITS.url) : link.resolved_url,
      },
      keywords: [],
    };
  }

  const meta: Partial<PageMetadata> =
    result.html !== null ? extractMetadata(result.html, result.finalUrl) : metadataFromUrl(result.finalUrl, result.contentType);

  if (meta.blocked) {
    return {
      update: {
        metadata_status: "failed",
        metadata_error: "The site showed a bot check instead of the page.",
        fetched_at: now,
        content_type: clip(result.contentType, LIMITS.contentType),
      },
      keywords: [],
    };
  }

  const canonical = usableCanonical(meta.canonicalUrl, link);
  const resolved = result.finalUrl !== link.url ? clip(result.finalUrl, LIMITS.url) : null;

  // Fill gaps only: anything already present (typed by the user, or from an
  // import) is never overwritten by what a page claims about itself.
  return {
    update: {
      title: link.title ?? clip(meta.title, LIMITS.title),
      description: link.description ?? clip(meta.description, LIMITS.description),
      author: link.author ?? clip(meta.author, LIMITS.author),
      site_name: link.site_name ?? clip(meta.siteName, LIMITS.siteName),
      published_at: link.published_at ?? meta.publishedAt ?? null,
      reading_minutes: link.reading_minutes ?? minutes(meta.readingMinutes),
      word_count: link.word_count ?? (meta.wordCount != null && meta.wordCount >= 0 ? Math.round(meta.wordCount) : null),
      lang: link.lang ?? clip(meta.lang, LIMITS.lang),
      content_type: clip(result.contentType, LIMITS.contentType),
      content_excerpt: clip(meta.excerpt, LIMITS.excerpt) ?? link.content_excerpt,
      canonical_url: canonical && canonical.url !== link.url ? canonical.url : link.canonical_url,
      canonical_normalized_url:
        canonical && canonical.normalized !== link.normalized_url ? canonical.normalized : link.canonical_normalized_url,
      resolved_url: resolved ?? link.resolved_url,
      metadata_status: "done",
      metadata_error: null,
      fetched_at: now,
    },
    keywords: meta.keywords ?? [],
  };
}

/** Enough to categorize on: a title, a description, page text, or a wordy URL slug. */
function hasSignal(link: SavedLinkRow): boolean {
  if (link.title || link.description || link.content_excerpt) return true;
  try {
    const words = new URL(link.url).pathname.split(/[^a-zA-Z]+/).filter((word) => word.length > 2);
    return words.length >= 2;
  } catch {
    return false;
  }
}

async function readCachedClassification(
  supabase: ServerSupabase,
  cacheKey: string,
  model: string,
): Promise<RawClassification | null> {
  const { data } = await supabase
    .from("classification_cache")
    .select("result, model")
    .eq("cache_key", cacheKey)
    .maybeSingle();
  if (!data || data.model !== model) return null;
  return parseClassification(data.result);
}

async function categorize(supabase: ServerSupabase, link: SavedLinkRow, keywords: string[]): Promise<void> {
  const finish = async (status: "failed" | "skipped", message: string | null) => {
    await supabase
      .from("saved_links")
      .update({ classification_status: status, classification_error: clip(message, LIMITS.message), processing_started_at: null })
      .eq("id", link.id);
  };

  const classifier = getClassifier();
  if (!classifier) return finish("skipped", null);

  const { data: settings } = await supabase.from("user_settings").select("ai_enabled").eq("user_id", link.user_id).maybeSingle();
  if (settings && !settings.ai_enabled) return finish("skipped", null);

  if (!hasSignal(link)) return finish("skipped", "There wasn't enough information to categorize this link.");

  const [categories, tags, collections] = await Promise.all([
    supabase.from("categories").select("id, name, slug").order("name"),
    supabase.from("tags").select("id, name, slug").order("name"),
    supabase.from("collections").select("id, name, description").order("name"),
  ]);
  if (categories.error || tags.error || collections.error) {
    logServerError("categorize: load vocabulary", categories.error ?? tags.error ?? collections.error);
    return finish("failed", "Index couldn't load your categories. Try again in a moment.");
  }

  const input: ClassificationInput = {
    url: link.url,
    domain: link.domain,
    title: link.title,
    description: link.description,
    siteName: link.site_name,
    author: link.author,
    excerpt: link.content_excerpt,
    keywords,
    existingCategories: categories.data.map((category) => category.name),
    collections: collections.data.map((collection) => ({
      id: collection.id,
      name: collection.name,
      description: collection.description,
    })),
  };

  const cacheKey = classificationCacheKey(input);
  let raw = await readCachedClassification(supabase, cacheKey, classifier.model);
  if (!raw) {
    try {
      raw = await classifier.classify(buildClassificationPrompt(input));
    } catch (error) {
      if (!(error instanceof ClassifierError)) logServerError("categorize: classifier", error);
      return finish(
        "failed",
        error instanceof ClassifierError ? error.message : "Categorizing didn't work this time. Try again later.",
      );
    }
    await supabase
      .from("classification_cache")
      .upsert({ cache_key: cacheKey, model: classifier.model, result: raw as unknown as Json }, { onConflict: "user_id,cache_key" });
  }

  const outcome = resolveClassification(raw, {
    existingCategories: categories.data,
    existingTags: tags.data,
    collections: collections.data.map(({ id, name }) => ({ id, name })),
  });

  const { error } = await supabase.rpc("apply_classification", {
    p_link_id: link.id,
    p_categories: outcome.categories.map(({ name, slug }) => ({ name, slug })),
    p_tags: outcome.tags.map(({ name, slug }) => ({ name, slug })),
    p_collection_ids: outcome.collectionIds,
    p_model: classifier.model,
  });
  if (error) {
    logServerError("categorize: apply", error);
    return finish("failed", "Index couldn't save the categories. Try again in a moment.");
  }
}

/** Fetches and categorizes one link. Safe to call concurrently; never throws. */
export async function processLink(supabase: ServerSupabase, linkId: string, options: ProcessOptions = {}): Promise<void> {
  const { data: claimed, error: claimError } = await supabase.rpc("claim_link_processing", {
    p_link_id: linkId,
    p_force: options.force ?? false,
  });
  if (claimError) {
    logServerError("process: claim", claimError);
    return;
  }
  let link = claimed?.[0];
  if (!link) return; // Nothing to do, or another worker has it.

  let keywords: string[] = [];

  if (link.metadata_status === "processing") {
    try {
      const outcome = await readPage(link);
      keywords = outcome.keywords;
      const { data: updated, error } = await supabase
        .from("saved_links")
        .update(outcome.update)
        .eq("id", link.id)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (updated) link = updated;
    } catch (error) {
      logServerError("process: metadata", error);
      await supabase
        .from("saved_links")
        .update({ metadata_status: "failed", metadata_error: "Something went wrong while reading this page." })
        .eq("id", link.id);
      link = { ...link, metadata_status: "failed" };
    }
  }

  try {
    if (link.classification_status === "processing") {
      await categorize(supabase, link, keywords);
    } else {
      await supabase.from("saved_links").update({ processing_started_at: null }).eq("id", link.id);
    }
  } catch (error) {
    logServerError("process: categorize", error);
    await supabase
      .from("saved_links")
      .update({
        classification_status: "failed",
        classification_error: "Categorizing didn't work this time. Try again later.",
        processing_started_at: null,
      })
      .eq("id", link.id);
  }
}

/** Ids of links still waiting to be fetched or categorized, oldest first. */
export async function findPendingLinkIds(supabase: ServerSupabase, limit: number): Promise<{ ids: string[]; remaining: number }> {
  const staleBefore = new Date(Date.now() - 5 * 60_000).toISOString();
  const waiting = `metadata_status.eq.pending,classification_status.eq.pending,and(processing_started_at.lt."${staleBefore}",or(metadata_status.eq.processing,classification_status.eq.processing))`;
  const { data, count, error } = await supabase
    .from("saved_links")
    .select("id", { count: "exact" })
    .or(waiting)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    logServerError("process: find pending", error);
    return { ids: [], remaining: 0 };
  }
  return { ids: (data ?? []).map((row) => row.id), remaining: count ?? 0 };
}
