/**
 * Reading the classifier's answer. Structured outputs make the shape
 * dependable, but the answer is still external data: everything is checked,
 * coerced to plain string lists and bounded before resolution sees it.
 */

export interface RawClassification {
  categories: string[];
  tags: string[];
  collections: string[];
}

const MAX_TEXT_LENGTH = 50_000;
const MAX_ITEM_LENGTH = 100;
const MAX_CATEGORIES = 8;
const MAX_TAGS = 16;
const MAX_COLLECTIONS = 4;

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** JSON text, a ```json fenced block, or an object with prose around it. */
function parseText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_TEXT_LENGTH) return undefined;

  const fenced = /```[a-z]*\s*\n?([\s\S]*?)```/i.exec(trimmed);
  const candidates = [fenced?.[1], trimmed];
  const open = trimmed.indexOf("{");
  const close = trimmed.lastIndexOf("}");
  if (open >= 0 && close > open) candidates.push(trimmed.slice(open, close + 1));

  for (const candidate of candidates) {
    if (candidate === undefined) continue;
    const parsed = tryJson(candidate.trim());
    // Tolerate JSON that was encoded twice.
    if (typeof parsed === "string") return tryJson(parsed);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toItem(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  // Some models wrap names: [{ "name": "Finance" }].
  if (isRecord(value) && typeof value.name === "string") return value.name;
  return null;
}

/**
 * A bounded list of trimmed, non-empty, distinct strings. A single string is
 * read as a comma-separated list. Null when the value has the wrong type.
 */
function toStringList(value: unknown, max: number): string[] | null {
  let items: unknown[];
  if (value === undefined || value === null) items = [];
  else if (Array.isArray(value)) items = value;
  else if (typeof value === "string") items = value.split(/[,;\n]/);
  else return null;

  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of items) {
    const item = toItem(entry)?.trim();
    if (!item || item.length > MAX_ITEM_LENGTH || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
    if (result.length >= max) break;
  }
  return result;
}

/**
 * Accepts the parsed JSON object or its text (a fenced ```json block is
 * fine). Returns null when it isn't a classification at all; an answer with
 * empty lists is valid and means "nothing fits".
 */
export function parseClassification(raw: unknown): RawClassification | null {
  const value = typeof raw === "string" ? parseText(raw) : raw;
  if (!isRecord(value)) return null;
  if ((value.categories === undefined || value.categories === null) && (value.tags === undefined || value.tags === null)) {
    return null;
  }

  const categories = toStringList(value.categories, MAX_CATEGORIES);
  const tags = toStringList(value.tags, MAX_TAGS);
  if (!categories || !tags) return null;
  // Collections are optional suggestions; a malformed list is simply ignored.
  const collections = toStringList(value.collections, MAX_COLLECTIONS) ?? [];

  return { categories, tags, collections };
}
