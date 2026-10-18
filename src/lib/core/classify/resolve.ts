/**
 * From the classifier's raw answer to what gets applied: categories and tags
 * matched against the library (see taxonomy.ts) and collection suggestions
 * turned into ids. Suggestions are only ever shown; nothing is added to a
 * collection without the user.
 */
import type { RawClassification } from "./parse";
import { resolveCategories, resolveTags } from "./taxonomy";
import type { ResolvedTerm, Term } from "./taxonomy";

export interface ClassificationOutcome {
  categories: ResolvedTerm[];
  tags: ResolvedTerm[];
  /** Suggested collections, at most two. */
  collectionIds: string[];
}

const MAX_SUGGESTED_COLLECTIONS = 2;

function collectionKey(name: string): string {
  return name.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Case-insensitive exact name matches only: a wrong suggestion is worse than none. */
function matchCollections(proposed: readonly string[], collections: ReadonlyArray<{ id: string; name: string }>): string[] {
  const byName = new Map<string, string>();
  for (const collection of collections) {
    const key = collectionKey(collection.name);
    if (key && !byName.has(key)) byName.set(key, collection.id);
  }

  const ids: string[] = [];
  for (const name of proposed) {
    if (ids.length >= MAX_SUGGESTED_COLLECTIONS) break;
    const id = byName.get(collectionKey(name));
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function resolveClassification(
  raw: RawClassification,
  context: { existingCategories: Term[]; existingTags: Term[]; collections: Array<{ id: string; name: string }> },
): ClassificationOutcome {
  const categories = resolveCategories(raw.categories, context.existingCategories);
  const tags = resolveTags(raw.tags, context.existingTags, { exclude: categories.map((category) => category.name) });
  return { categories, tags, collectionIds: matchCollections(raw.collections, context.collections) };
}
