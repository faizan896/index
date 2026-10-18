/**
 * Slugs: the lowercase key that identifies a category or tag by name.
 * "Venture Capital" → "venture-capital", "R&D" → "r-and-d".
 *
 * The database enforces one category per (user, slug), so two spellings that
 * slugify the same are the same category.
 */

const MAX_SLUG_LENGTH = 80;

export function slugify(name: string): string {
  const ascii = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\+\+/g, " plus plus ")
    .replace(/\+/g, " plus ")
    .replace(/#/g, " sharp ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const slug = ascii.slice(0, MAX_SLUG_LENGTH).replace(/-+$/, "");
  if (slug) return slug;

  // Names with no Latin letters or digits (e.g. "建築") still need a stable key.
  const codepoints = [...name.trim()]
    .slice(0, 12)
    .map((char) => char.codePointAt(0)!.toString(16))
    .join("-");
  return codepoints ? `u-${codepoints}`.slice(0, MAX_SLUG_LENGTH).replace(/-+$/, "") : "";
}
