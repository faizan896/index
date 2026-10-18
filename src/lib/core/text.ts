/**
 * Plain text from the web: everything a page says about itself passes
 * through cleanText before it is stored or shown, and countWords measures
 * article text for reading time.
 */
import { decodeEntities } from "@/lib/core/html/entities";

/**
 * Control, zero-width, soft-hyphen and bidi-override characters. The
 * zero-width joiner and non-joiner (U+200C, U+200D) stay: emoji sequences,
 * Persian and Indic scripts depend on them.
 */
const INVISIBLE =
  /[\u0000-\u0008\u000e-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff\ufff9-\ufffb]/g;

/** A start or end tag ("<p>", "</a>", '<img src="x">'). "a < b" and "<3" are left alone. */
const TAG = /<\/?([A-Za-z][A-Za-z0-9-]*)(?![A-Za-z0-9-])[^<>]*>/g;

/** Tags inside a line of text: removing them must not split "un<em>usual</em>" into two words. */
const INLINE_TAGS = new Set([
  "a", "abbr", "b", "bdi", "bdo", "cite", "code", "data", "del", "dfn", "em", "font", "i", "ins", "kbd", "mark", "q",
  "s", "samp", "small", "span", "strike", "strong", "sub", "sup", "time", "tt", "u", "var", "wbr",
]);

/**
 * Markup that was escaped by the site and surfaces again after decoding
 * ("&lt;p&gt;Hello" in a description). Limited to the formatting tags such
 * leaks are made of, so a title about the <dialog> element keeps its subject.
 */
const LEAKED_TAG =
  /<\/?(?:a|abbr|b|big|blockquote|br|center|cite|code|dd|div|dl|dt|em|figcaption|figure|font|h[1-6]|hr|i|iframe|img|li|mark|ol|p|pre|s|script|small|span|strike|strong|style|sub|sup|table|tbody|td|th|thead|tr|u|ul)(?:\s[^<>]*)?\/?>/gi;

/** A character reference still present after one round of decoding (double-encoded "&amp;#8217;"). */
const REMAINING_ENTITY = /&(?:#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/;

/**
 * Whitespace worth replacing: runs, and any single character other than a
 * plain space. Leaving lone spaces alone makes this many times faster than
 * /\s+/ on long text.
 */
const WHITESPACE = /\s{2,}|[^\S ]/g;

/** Punctuation that shouldn't dangle in front of an ellipsis. */
const TRAILING_PUNCTUATION = /[\s.,;:!?\-–—|·•/\\(\[{«"'“‘]+$/u;

/** Removes HTML comments without a regular expression, so an unclosed one costs one pass. */
function stripComments(text: string): string {
  let start = text.indexOf("<!--");
  if (start === -1) return text;
  let result = "";
  let position = 0;
  while (start !== -1) {
    result += `${text.slice(position, start)} `;
    const end = text.indexOf("-->", start + 4);
    if (end === -1) return result;
    position = end + 3;
    start = text.indexOf("<!--", position);
  }
  return result + text.slice(position);
}

function stripMarkup(text: string): string {
  return stripComments(text).replace(TAG, (_tag, name: string) => (INLINE_TAGS.has(name.toLowerCase()) ? "" : " "));
}

/** Cuts at `index` without splitting a surrogate pair. */
function safeSlice(text: string, index: number): string {
  const code = text.charCodeAt(index - 1);
  return text.slice(0, code >= 0xd800 && code <= 0xdbff ? index - 1 : index);
}

function truncate(text: string, maxLength: number): string {
  if (maxLength < 2) return safeSlice(text, maxLength);
  const room = maxLength - 1;
  let cut = safeSlice(text, room);
  const boundary = text.charAt(room) === " " ? room : cut.lastIndexOf(" ");
  // Prefer a word boundary, unless the only one is so early that most of the text would go.
  if (boundary >= room * 0.5) cut = cut.slice(0, boundary);
  const trimmed = cut.replace(TRAILING_PUNCTUATION, "");
  return `${trimmed || cut}…`;
}

/**
 * One line of plain text, or null when nothing is left: markup stripped,
 * entities decoded (twice when a site double-encoded them), invisible
 * characters removed, whitespace collapsed and trimmed. Over `maxLength`
 * (UTF-16 units, ellipsis included) it is shortened at a word boundary and
 * marked with "…". Never throws.
 */
export function cleanText(value: string | null | undefined, maxLength?: number): string | null {
  if (typeof value !== "string" || value === "") return null;
  let text = value;
  if (text.includes("<")) text = stripMarkup(text);
  if (text.includes("&")) {
    text = decodeEntities(text);
    if (REMAINING_ENTITY.test(text)) text = decodeEntities(text);
    if (text.includes("<")) text = text.replace(LEAKED_TAG, " ");
  }
  text = text.toWellFormed().replace(INVISIBLE, "").replace(WHITESPACE, " ").trim();
  if (!text) return null;
  if (typeof maxLength === "number" && maxLength >= 1 && text.length > maxLength) {
    text = truncate(text, Math.floor(maxLength)).trim();
  }
  return text || null;
}

export interface WordCount {
  /** Space-separated words (Latin, Cyrillic, Greek, Arabic, Hangul…), numbers included. */
  words: number;
  /** Chinese and Japanese characters, which are read without spaces between words. */
  cjk: number;
}

/** Character classes for countWords. */
const OTHER = 0;
const WORD = 1;
const CJK = 2;
const SPACE = 3;

function isSpace(code: number): boolean {
  return (
    code === 0x20 ||
    (code >= 0x09 && code <= 0x0d) ||
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200b) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  );
}

function isCjk(code: number): boolean {
  return (
    (code >= 0x3040 && code <= 0x30ff) || // hiragana, katakana
    (code >= 0x31f0 && code <= 0x31ff) || // katakana extensions
    (code >= 0x3400 && code <= 0x4dbf) || // CJK extension A
    (code >= 0x4e00 && code <= 0x9fff) || // CJK unified ideographs
    (code >= 0xf900 && code <= 0xfaff) || // compatibility ideographs
    (code >= 0xff66 && code <= 0xff9f) // halfwidth katakana
  );
}

/**
 * Letters and digits. Outside ASCII this is an approximation that avoids a
 * Unicode lookup per character: anything from U+00C0 up counts as a letter
 * except general punctuation, symbol and CJK punctuation blocks and
 * surrogates (emoji), which is right for every script that separates words
 * with spaces.
 */
function classify(code: number): number {
  if (code < 0x80) {
    if ((code >= 0x30 && code <= 0x39) || ((code | 0x20) >= 0x61 && (code | 0x20) <= 0x7a)) return WORD;
    return isSpace(code) ? SPACE : OTHER;
  }
  if (isSpace(code)) return SPACE;
  if (isCjk(code)) return CJK;
  if (code < 0xc0 || code === 0xd7 || code === 0xf7) return code === 0xaa || code === 0xb5 || code === 0xba ? WORD : OTHER;
  if (code >= 0x2000 && code <= 0x2bff) return OTHER; // punctuation, symbols, arrows, shapes
  if (code >= 0x3000 && code <= 0x303f) return OTHER; // CJK punctuation
  if (code >= 0xd800 && code <= 0xdfff) return OTHER; // astral: emoji and rarer scripts
  if (code >= 0xfe30 && code <= 0xfe6f) return OTHER; // CJK compatibility forms, small forms
  if (code >= 0xff00 && code <= 0xffef) {
    // Fullwidth digits and letters are words; the rest of the block is punctuation.
    return (code >= 0xff10 && code <= 0xff19) || (code >= 0xff21 && code <= 0xff3a) || (code >= 0xff41 && code <= 0xff5a)
      ? WORD
      : OTHER;
  }
  return WORD;
}

/**
 * Counts words for reading time. A word is a run of letters or digits
 * between spaces, so "state-of-the-art" and "don't" are one word and a lone
 * "—" is none. Chinese and Japanese characters are counted one by one.
 */
export function countWords(text: string): WordCount {
  let words = 0;
  let cjk = 0;
  if (typeof text !== "string") return { words, cjk };
  // Whether the current run of non-space characters has been counted yet.
  let counted = false;
  for (let index = 0; index < text.length; index++) {
    const kind = classify(text.charCodeAt(index));
    if (kind === WORD) {
      if (!counted) words++;
      counted = true;
    } else if (kind === CJK) {
      cjk++;
      counted = false;
    } else if (kind === SPACE) {
      counted = false;
    }
    // Other characters (punctuation) join a word ("o'clock") but never make one.
  }
  return { words, cjk };
}
