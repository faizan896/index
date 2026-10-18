/**
 * Rediscover's seed: the same seed always draws the same picks, so the page
 * is stable within a day and "Show me others" is an ordinary, repeatable link.
 */

/** Short and URL-safe; anything else in `?s=` is ignored. */
const SEED_PATTERN = /^[a-z0-9-]{1,64}$/i;

/** The seed from the `s` search param, or null when it is missing or malformed. */
export function readSeed(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  const seed = raw.trim();
  return SEED_PATTERN.test(seed) ? seed : null;
}

/** Today's seed, "YYYY-MM-DD" in UTC: the picks change once a day. */
export function dailySeed(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** The seed after `seed`: a 32-bit FNV-1a hash in base 36. Deterministic, so rendering stays pure. */
export function nextSeed(seed: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const next = hash.toString(36);
  // A hash equal to its input would make "Show me others" a dead end.
  return next === seed ? `${next}-1` : next;
}
