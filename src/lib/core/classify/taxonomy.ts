/**
 * Category and tag names: cleaning what the classifier proposes, recognising
 * when two names mean the same shelf, and deciding between reusing an
 * existing category and creating a new one.
 *
 * Three strings are in play for every name:
 * - the display name ("Venture Capital"), kept as the user or model wrote it;
 * - the slug ("venture-capital", from core/slug), the database's unique key;
 * - the matching key, used only here to spot near-duplicates. "VC",
 *   "Venture Capital" and "Venture capital" share one. It is never stored.
 */
import { slugify } from "@/lib/core/slug";

export interface Term {
  id: string;
  name: string;
  slug: string;
}

/** A name to apply: an existing term (existingId set) or one to create. */
export interface ResolvedTerm {
  name: string;
  slug: string;
  existingId: string | null;
}

const MAX_TERM_LENGTH = 40;
const MAX_MANUAL_LENGTH = 60;
const MAX_NEW_CATEGORY_LENGTH = 32;
const MAX_NEW_CATEGORY_WORDS = 3;
const MAX_TAG_WORDS = 4;
const DEFAULT_MAX_CATEGORIES = 3;
const DEFAULT_MAX_TAGS = 6;
/** Below this many categories the library is still finding its shelves, so two new ones may be created at once. */
const YOUNG_LIBRARY_SIZE = 8;

// ─── Cleaning ───────────────────────────────────────────────────────────────

/** Control, zero-width and bidi characters that never belong in a name. */
const INVISIBLE = /[\u0000-\u0008\u000e-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g;
/** Quotes, hashtags, bullets and list numbering in front of a name. */
const LEADING_NOISE = /^(?:[\s"'“”‘’„«»‹›`#*•·~:;,!?|/\\_–—-]+|\d{1,2}[.)]\s+)+/u;
/** Quotes and punctuation after a name ("Finance." → "Finance"); keeps C++ and C#. */
const TRAILING_NOISE = /[\s"'“”‘’„«»‹›`*•·~:;,.!?…|/\\_–—-]+$/u;
const LOOKS_LIKE_CODE_OR_URL = /[<>{}[\]|\\=]|:\/\/|^www\./i;

/** Words left lowercase inside a Title Case name. */
const MINOR_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "nor", "of", "on", "or", "per", "than",
  "the", "to", "via", "vs", "with",
]);

/** Acronyms and brands whose casing can't be guessed from an all-lowercase word. */
const KNOWN_FORMS = new Map<string, string>(
  [
    "AI", "ML", "VC", "VCs", "UX", "UI", "API", "APIs", "SEO", "LLM", "LLMs", "NLP", "NFT", "NFTs", "ESG", "SaaS",
    "B2B", "B2C", "IoT", "AR", "VR", "XR", "GPU", "GPUs", "CPU", "CPUs", "EV", "EVs", "US", "UK", "EU", "USA", "UAE",
    "NASA", "NATO", "OPEC", "IMF", "ECB", "FDA", "HTML", "CSS", "SQL", "JSON", "HTTP", "URL", "DNS", "VPN", "RSS",
    "PDF", "USB", "PC", "CEO", "CFO", "CTO", "IPO", "IPOs", "ETF", "ETFs", "GDP", "KPI", "KPIs", "OKR", "OKRs", "ROI",
    "CRM", "ERP", "CMS", "R&D", "3D", "5G", "F1", "DIY", "HR", "TV", "DNA", "RNA", "CRISPR", "LGBTQ", "NBA", "NFL",
    "FIFA", "MBA", "PhD", "NGO", "NGOs", "UFO", "COVID", "GPT", "ChatGPT", "OpenAI", "AWS", "GCP", "IBM", "BMW",
    "NYC", "iOS", "macOS", "iPhone", "iPad", "iPod", "iMac", "AirPods", "DeFi", "DevOps", "GitHub", "GitLab",
    "YouTube", "LinkedIn", "TikTok", "PayPal", "eBay", "WordPress", "JavaScript", "TypeScript", "PostgreSQL",
    "MySQL", "GraphQL", "Node.js", "U.S.", "U.K.",
  ].map((form) => [form.toLowerCase(), form]),
);

function capitalize(word: string): string {
  const [head = "", ...rest] = [...word];
  return head.toUpperCase() + rest.join("");
}

/** Title-cases a word only if it arrived all lowercase, so iPhone, DeFi and AI keep their casing. */
function titleWord(word: string, isFirst: boolean): string {
  if (word !== word.toLowerCase()) return word;
  if (!isFirst && MINOR_WORDS.has(word)) return word;
  const known = KNOWN_FORMS.get(word);
  if (known) return known;
  // "cross-border" → "Cross-border", "ai-powered" → "AI-powered", "ui/ux" → "UI/UX".
  return word
    .split(/([-/])/)
    .map((part, index) => KNOWN_FORMS.get(part) ?? (index === 0 ? capitalize(part) : part))
    .join("");
}

function collapse(raw: string): string {
  return raw.normalize("NFC").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
}

function length(text: string): number {
  return [...text].length;
}

function wordCount(name: string): number {
  return name.split(" ").filter(Boolean).length;
}

/**
 * Tidies a category or tag name proposed by the classifier: trims, collapses
 * whitespace, drops quotes, hashtags and trailing punctuation, and Title
 * Cases words that arrive all lowercase. Null when nothing usable is left,
 * the name runs past 40 characters, or it looks like a URL or code.
 */
export function cleanTermName(raw: string): string | null {
  if (typeof raw !== "string") return null;
  let name = collapse(raw.replace(/_/g, " "));
  name = name.replace(LEADING_NOISE, "").replace(TRAILING_NOISE, "");
  const wrapped = /^\(([^()]*)\)$/.exec(name) ?? /^\[([^[\]]*)\]$/.exec(name);
  if (wrapped) name = (wrapped[1] ?? "").replace(TRAILING_NOISE, "").trim();

  if (!name || !/\p{L}/u.test(name)) return null;
  if (LOOKS_LIKE_CODE_OR_URL.test(name)) return null;
  if (length(name) > MAX_TERM_LENGTH) return null;

  return name
    .split(" ")
    .map((word, index) => titleWord(word, index === 0))
    .join(" ");
}

// ─── Matching keys ──────────────────────────────────────────────────────────

/** Plurals whose singular is a different subject (Securities ≠ Security, News ≠ New). */
const DISTINCT_PLURALS = new Set([
  "news", "series", "species", "means", "windows", "glasses", "goods", "securities", "futures", "humanities", "arms",
  "customs", "spirits", "aids", "darts",
]);

/** Words that end in "s" but aren't plurals. */
const INVARIANT_S = new Set([
  "chaos", "cosmos", "ethos", "pathos", "kudos", "thermos", "macos", "atlas", "canvas", "texas", "christmas", "bias",
  "alias", "kansas", "arkansas", "vegas", "pandas", "saas", "paas", "iaas", "faas", "diabetes", "herpes", "rabies",
  "measles", "always", "perhaps",
]);

/** Plurals of words ending in "ie" (movies → movie, not "movy"). */
const IE_PLURALS = new Set([
  "movies", "cookies", "calories", "zombies", "rookies", "selfies", "smoothies", "brownies", "hoodies", "freebies",
  "newbies", "indies", "foodies", "techies", "prairies",
]);

/** "-ches" plurals of words ending in "che" (niches → niche, unlike approaches → approach). */
const CHE_PLURALS = new Set(["niches", "caches", "cliches", "headaches", "avalanches", "moustaches", "mustaches"]);

/** Plurals ending in "is", which otherwise reads as singular (analysis, tennis). */
const IS_PLURALS = new Set([
  "apis", "kpis", "rois", "guis", "clis", "emojis", "wikis", "taxis", "skis", "kiwis", "safaris", "bikinis", "martinis",
]);

function singular(token: string): string {
  if (token.length < 4 || !token.endsWith("s") || /\d/.test(token)) return token;
  if (DISTINCT_PLURALS.has(token) || INVARIANT_S.has(token)) return token;
  if (IS_PLURALS.has(token)) return token.slice(0, -1);
  // economics, glass, bus, analysis: not plurals (or not safely reducible).
  if (/(?:ss|us|is|ics)$/.test(token)) return token;
  if (IE_PLURALS.has(token) || CHE_PLURALS.has(token)) return token.slice(0, -1);
  if (token.endsWith("ies")) return token.length >= 5 ? `${token.slice(0, -3)}y` : token.slice(0, -1);
  if (/(?:ss|x|ch|sh)es$/.test(token)) return token.slice(0, -2);
  return token.slice(0, -1);
}

function foldPlurals(slug: string): string {
  return slug.split("-").map(singular).join("-");
}

/** Slug plus plural folding: the key before synonyms are applied. */
function baseKey(name: string): string {
  const slug = slugify(name);
  return slug ? foldPlurals(slug) : "";
}

/**
 * Abbreviations and alternate spellings, replaced wherever they appear as
 * whole words in a key ("AI Ethics" ≡ "Artificial Intelligence Ethics").
 * Only unambiguous ones belong here.
 */
const PHRASE_SYNONYMS: ReadonlyArray<readonly [string, string]> = [
  ["AI", "Artificial Intelligence"],
  ["ML", "Machine Learning"],
  ["VC", "Venture Capital"],
  ["VCs", "Venture Capital"],
  ["UX", "User Experience"],
  ["UI", "User Interface"],
  ["LLM", "Large Language Model"],
  ["NLP", "Natural Language Processing"],
  ["AR", "Augmented Reality"],
  ["VR", "Virtual Reality"],
  ["NFT", "Non-Fungible Token"],
  ["EV", "Electric Vehicle"],
  ["EVs", "Electric Vehicle"],
  ["TV", "Television"],
  ["UK", "United Kingdom"],
  ["SEO", "Search Engine Optimization"],
  ["Search Engine Optimisation", "Search Engine Optimization"],
  ["DeFi", "Decentralized Finance"],
  ["Decentralised Finance", "Decentralized Finance"],
  ["Tech", "Technology"],
  ["Crypto", "Cryptocurrency"],
  ["Automobile", "Automotive"],
  ["Car", "Automotive"],
  ["Start-up", "Startup"],
  ["Start-ups", "Startup"],
  ["E-commerce", "Ecommerce"],
  ["Health Care", "Healthcare"],
  ["Cyber Security", "Cybersecurity"],
  ["Opensource", "Open Source"],
  ["Web Dev", "Web Development"],
  ["Gamedev", "Game Development"],
  ["Sci-Fi", "Science Fiction"],
  ["Scifi", "Science Fiction"],
];

/**
 * Synonyms that hold only for the whole name: "Economy" is Economics, but
 * "Attention Economy" stays itself; "Coding" is Programming, "Medical Coding"
 * is not.
 */
const NAME_SYNONYMS: ReadonlyArray<readonly [string, string]> = [
  ["Econ", "Economics"],
  ["Economy", "Economics"],
  ["Math", "Mathematics"],
  ["Movies", "Film"],
  ["Cinema", "Film"],
  ["Coding", "Programming"],
  ["US", "United States"],
  ["USA", "United States"],
  ["DIY", "Do It Yourself"],
  ["F1", "Formula 1"],
  ["Formula One", "Formula 1"],
  ["BTC", "Bitcoin"],
  ["HR", "Human Resources"],
  ["PR", "Public Relations"],
  ["Psych", "Psychology"],
  ["Comp Sci", "Computer Science"],
  ["CompSci", "Computer Science"],
  ["Infosec", "Information Security"],
];

// Longest phrases first, so "start-ups" is replaced before anything inside it.
const PHRASE_KEYS = PHRASE_SYNONYMS.map(([from, to]) => [`-${baseKey(from)}-`, `-${baseKey(to)}-`] as const).sort(
  (a, b) => b[0].length - a[0].length,
);
const NAME_KEYS = new Map(NAME_SYNONYMS.map(([from, to]) => [baseKey(from), baseKey(to)] as const));

function applySynonyms(key: string): string {
  let padded = `-${key}-`;
  for (const [from, to] of PHRASE_KEYS) {
    // A loop rather than replaceAll: adjacent matches share their hyphen.
    while (padded.includes(from)) padded = padded.replace(from, to);
  }
  const phrased = padded.slice(1, -1);
  return NAME_KEYS.get(phrased) ?? phrased;
}

/**
 * The key two names share when they mean the same thing: the slug, with
 * plurals folded (Payments → payment, but Economics, Analysis, Bus and Glass
 * stay) and common abbreviations expanded (AI ≡ Artificial Intelligence,
 * Cars ≡ Automotive). Deliberately conservative: Finance, Fintech and Banking
 * stay apart, as do Design and Industrial Design.
 */
export function termKey(name: string): string {
  const key = baseKey(name);
  return key ? applySynonyms(key) : "";
}

// ─── Near-identity ──────────────────────────────────────────────────────────

/** "economic" / "economics", "menu" / "menus": plurals the key doesn't fold. */
function isPluralPair(shorter: string, longer: string): boolean {
  if (shorter.length < 3) return false;
  if (longer !== `${shorter}s` && longer !== `${shorter}es`) return false;
  const lastToken = longer.slice(longer.lastIndexOf("-") + 1);
  return !DISTINCT_PLURALS.has(lastToken);
}

/**
 * Spelling variants one edit apart: a doubled letter (Travelling/Traveling),
 * our/or (Behaviour/Behavior), judgement/judgment, s/z and c/s
 * (Organisation/Organization, Defence/Defense) and a final re/er
 * (Theatre/Theater). Arbitrary one-letter differences are not merged: they
 * are usually different words (Painting/Printing, Fiction/Friction,
 * Banking/Ranking).
 */
function isSpellingVariant(a: string, b: string): boolean {
  if (Math.min(a.length, b.length) < 7 || a[0] !== b[0]) return false;

  if (a.length === b.length) {
    const diffs: number[] = [];
    for (let index = 0; index < a.length && diffs.length <= 2; index++) {
      if (a[index] !== b[index]) diffs.push(index);
    }
    const [first, second] = diffs;
    if (first === undefined) return false;
    if (second === undefined) {
      const pair = [a[first], b[first]].sort().join("");
      return pair === "sz" || pair === "cs";
    }
    if (diffs.length !== 2 || second !== first + 1) return false;
    const atWordEnd = second + 1 === a.length || a[second + 1] === "-";
    const swapped = a[first] === b[second] && a[second] === b[first];
    return atWordEnd && swapped && [a[first], a[second]].sort().join("") === "er";
  }

  if (Math.abs(a.length - b.length) !== 1) return false;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  let at = 0;
  while (at < short.length && short[at] === long[at]) at++;
  if (long.slice(at + 1) !== short.slice(at)) return false;
  const extra = long[at];
  if (!extra || extra === "-") return false;
  if (long[at - 1] === extra || long[at + 1] === extra) return true;
  if (extra === "u" && long[at - 1] === "o" && long[at + 1] === "r") return true;
  return extra === "e" && long.startsWith("ment", at + 1);
}

/** True when two matching keys name the same subject. */
function isNearIdentical(a: string, b: string): boolean {
  if (a === b) return true;
  const plainA = a.replace(/-/g, "");
  if (plainA.length >= 4 && plainA === b.replace(/-/g, "")) return true;
  if (a.length < b.length ? isPluralPair(a, b) : isPluralPair(b, a)) return true;
  return isSpellingVariant(a, b);
}

// ─── Resolution ─────────────────────────────────────────────────────────────

/** Labels that never organise anything: dropped even if a category by that name exists. */
const JUNK_KEYS = new Set(
  [
    "General", "Misc", "Miscellaneous", "Other", "Others", "Uncategorized", "Uncategorised", "Unsorted", "Unknown",
    "None", "N/A", "Various", "Random", "Stuff", "Things", "Article", "Blog Post", "Post", "Link", "Read Later",
    "To Read", "Reading List", "Interesting", "Cool", "Trending", "Viral", "Featured", "Favorites", "Favourites",
    "Bookmark", "Saved", "Unread", "Finished", "Page", "Web Page", "Webpage", "Website", "Site", "Content", "Topic",
    "Category", "Tag", "Resource", "Information", "Info", "Overview", "Update", "Story",
  ].map(termKey),
);

/** Too vague to create, but kept when the user already has a category or tag by that name. */
const GENERIC_KEYS = new Set(
  [
    "News", "Blog", "Web", "Internet", "Online", "Opinion", "Essay", "Commentary", "Analysis", "Newsletter",
    "Long Read", "Longform", "Longread", "Current Events", "Reading",
  ].map(termKey),
);

interface KeyedTerm {
  key: string;
  term: Term;
}

interface Rules {
  max: number;
  maxNew: number;
  maxNewWords: number;
  maxNewLength: number;
  excludeKeys: string[];
}

function findExisting(key: string, existing: KeyedTerm[]): KeyedTerm | null {
  return existing.find((entry) => entry.key === key) ?? existing.find((entry) => isNearIdentical(key, entry.key)) ?? null;
}

function resolveTerms(proposed: readonly string[], existing: readonly Term[], rules: Rules): ResolvedTerm[] {
  const keyed = existing
    .map((term) => ({ key: termKey(term.name), term }))
    .filter((entry) => entry.key !== "");
  const result: ResolvedTerm[] = [];
  const chosenKeys: string[] = [];
  let created = 0;

  for (const raw of proposed) {
    if (result.length >= rules.max) break;
    const name = cleanTermName(raw);
    if (!name) continue;
    const key = termKey(name);
    if (!key || JUNK_KEYS.has(key)) continue;
    if (rules.excludeKeys.some((excluded) => isNearIdentical(key, excluded))) continue;
    if (chosenKeys.some((chosen) => isNearIdentical(key, chosen))) continue;

    const match = findExisting(key, keyed);
    if (match) {
      if (result.some((term) => term.existingId === match.term.id)) continue;
      chosenKeys.push(key, match.key);
      result.push({ name: match.term.name, slug: match.term.slug, existingId: match.term.id });
      continue;
    }

    if (GENERIC_KEYS.has(key) || created >= rules.maxNew) continue;
    if (wordCount(name) > rules.maxNewWords || length(name) > rules.maxNewLength) continue;
    const slug = slugify(name);
    if (!slug) continue;
    chosenKeys.push(key);
    result.push({ name, slug, existingId: null });
    created++;
  }
  return result;
}

function limit(value: number | undefined, fallback: number): number {
  return typeof value === "number" && !Number.isNaN(value) ? Math.max(0, Math.floor(value)) : fallback;
}

/**
 * Turns the classifier's proposed categories (most relevant first) into the
 * categories to apply. Each proposal is matched to an existing category by
 * key, then by near-identity, keeping the existing name. A proposal with no
 * match becomes a new category only if it is a broad, shelf-level subject
 * (at most 3 words and 32 characters) and the new-category allowance isn't
 * used up. Generic labels (General, Misc, News…) are dropped.
 *
 * Defaults: at most 3 categories, of which at most 1 is new (2 while the
 * library has fewer than 8 categories).
 */
export function resolveCategories(
  proposed: string[],
  existing: Term[],
  options: { maxTotal?: number; maxNew?: number } = {},
): ResolvedTerm[] {
  return resolveTerms(proposed, existing, {
    max: limit(options.maxTotal, DEFAULT_MAX_CATEGORIES),
    maxNew: limit(options.maxNew, existing.length < YOUNG_LIBRARY_SIZE ? 2 : 1),
    maxNewWords: MAX_NEW_CATEGORY_WORDS,
    maxNewLength: MAX_NEW_CATEGORY_LENGTH,
    excludeKeys: [],
  });
}

/**
 * Turns proposed tags into the tags to apply: existing tags are reused by
 * key, new ones may be specific but run to at most 4 words, and tags that
 * repeat one of `exclude` (the chosen categories) are dropped. At most 6 by
 * default.
 */
export function resolveTags(
  proposed: string[],
  existing: Term[],
  options: { max?: number; exclude?: string[] } = {},
): ResolvedTerm[] {
  return resolveTerms(proposed, existing, {
    max: limit(options.max, DEFAULT_MAX_TAGS),
    maxNew: Number.POSITIVE_INFINITY,
    maxNewWords: MAX_TAG_WORDS,
    maxNewLength: MAX_TERM_LENGTH,
    excludeKeys: (options.exclude ?? []).map(termKey).filter(Boolean),
  });
}

/**
 * Checks a category or tag name typed by the user (create or rename). Keeps
 * their casing; only trims and collapses whitespace.
 */
export function validateManualTerm(raw: string): { ok: true; name: string; slug: string } | { ok: false; error: string } {
  const name = typeof raw === "string" ? collapse(raw) : "";
  if (!name) return { ok: false, error: "Enter a name." };
  if (length(name) > MAX_MANUAL_LENGTH) return { ok: false, error: `Names can be up to ${MAX_MANUAL_LENGTH} characters.` };
  const slug = slugify(name);
  if (!slug || !/[\p{L}\p{N}]/u.test(name)) return { ok: false, error: "Use at least one letter or number." };
  return { ok: true, name, slug };
}
