/**
 * A small, forgiving HTML scanner. It reads markup the way a browser's
 * tokenizer does (comments, doctype, CDATA, quoted, unquoted and valueless
 * attributes, raw-text elements whose content is never read as tags) but
 * builds no tree: callers get a flat token list in document order, which is
 * all metadata extraction needs. One pass, no backtracking, never throws.
 */
import { decodeEntities } from "@/lib/core/html/entities";

export interface HtmlTag {
  /** Lowercased tag name. */
  name: string;
  /** Attribute values with entities decoded. Names are lowercased; the first of duplicates wins. */
  attrs: Record<string, string>;
  /** Offset of the "<" that opens the tag. */
  start: number;
  /** Offset just past the closing ">". */
  end: number;
}

export type HtmlToken =
  | {
      type: "open";
      tag: HtmlTag;
      /** Written as "<tag/>". Honoured by visibleText for every element, as the forgiving choice. */
      selfClosing: boolean;
      /** For raw-text elements (script, style, title, textarea…): their content, undecoded. Null otherwise. */
      content: string | null;
    }
  | { type: "close"; name: string; start: number; end: number }
  /** A run of character data between tags, as offsets into the source; entities undecoded. */
  | { type: "text"; start: number; end: number };

export interface HtmlScan {
  /** The scanned source; token offsets point into it. */
  html: string;
  tokens: HtmlToken[];
  /** Every start tag, in document order. */
  tags: HtmlTag[];
  /** Text of the first <title> outside SVG and MathML, entities decoded, untrimmed. Null when there is none. */
  title: string | null;
  /** The raw contents of every <script type="application/ld+json">, in document order. */
  jsonLd: string[];
}

/** An element range from elementRanges: token indices of its start tag and its end tag. */
export interface ElementRange {
  open: number;
  /** Index of the matching close token, or tokens.length when the element is never closed. */
  close: number;
}

/** Elements whose content is text up to the matching end tag, never markup. */
const RAW_TEXT = new Set(["script", "style", "textarea", "title", "noscript", "template", "iframe", "noembed", "noframes", "xmp"]);

/** Elements that switch the tokenizer to foreign content, where "<x/>" really is empty and <title> is not raw text. */
const FOREIGN = new Set(["svg", "math"]);

/** HTML start tags that end foreign content, as in the HTML parsing algorithm. */
const FOREIGN_BREAKOUT = new Set([
  "b", "big", "blockquote", "body", "br", "center", "code", "dd", "div", "dl", "dt", "em", "embed", "h1", "h2", "h3",
  "h4", "h5", "h6", "head", "hr", "i", "img", "li", "listing", "menu", "meta", "nobr", "ol", "p", "pre", "ruby", "s",
  "small", "span", "strong", "strike", "sub", "sup", "table", "tt", "u", "ul", "var",
]);

const NO_ATTRIBUTES: Record<string, string> = Object.freeze(Object.create(null) as Record<string, string>);

function isSpace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d;
}

function isAsciiLetter(code: number): boolean {
  const lower = code | 0x20;
  return lower >= 0x61 && lower <= 0x7a;
}

/** End of a tag name: whitespace, "/" or ">". */
function nameEnd(html: string, from: number): number {
  let index = from;
  while (index < html.length) {
    const code = html.charCodeAt(index);
    if (isSpace(code) || code === 0x2f || code === 0x3e) break;
    index++;
  }
  return index;
}

/** Where parseAttributes leaves what it read, reused across tags to avoid an allocation per tag. */
interface AttributeSink {
  attrs: Record<string, string>;
  selfClosing: boolean;
}

/**
 * Reads attributes from `from` to the ">" that ends the tag (a ">" inside
 * quotes doesn't count) and returns the offset just past it, or -1 when the
 * input ends inside the tag. Attributes are kept only when a sink is given.
 */
function parseAttributes(html: string, from: number, sink: AttributeSink | null): number {
  const length = html.length;
  let attrs: Record<string, string> | null = null;
  const finish = (end: number, selfClosing: boolean) => {
    if (sink) {
      sink.attrs = attrs ?? NO_ATTRIBUTES;
      sink.selfClosing = selfClosing;
    }
    return end;
  };
  let index = from;
  while (index < length) {
    const code = html.charCodeAt(index);
    if (isSpace(code)) {
      index++;
      continue;
    }
    if (code === 0x3e) return finish(index + 1, false);
    if (code === 0x2f) {
      if (html.charCodeAt(index + 1) === 0x3e) return finish(index + 2, true);
      index++;
      continue;
    }

    // The name runs to whitespace, "/", ">" or "=" (a leading "=" belongs to the name).
    const nameStart = index;
    index++;
    while (index < length) {
      const next = html.charCodeAt(index);
      if (isSpace(next) || next === 0x2f || next === 0x3e || next === 0x3d) break;
      index++;
    }
    const nameStop = index;
    while (index < length && isSpace(html.charCodeAt(index))) index++;

    let valueStart = -1;
    let valueEnd = -1;
    if (html.charCodeAt(index) === 0x3d) {
      index++;
      while (index < length && isSpace(html.charCodeAt(index))) index++;
      const quote = html.charCodeAt(index);
      if (quote === 0x22 || quote === 0x27) {
        const close = html.indexOf(quote === 0x22 ? '"' : "'", index + 1);
        if (close === -1) return -1;
        valueStart = index + 1;
        valueEnd = close;
        index = close + 1;
      } else {
        valueStart = index;
        while (index < length) {
          const next = html.charCodeAt(index);
          if (isSpace(next) || next === 0x3e) break;
          index++;
        }
        valueEnd = index;
      }
    }

    if (sink) {
      const name = html.slice(nameStart, nameStop).toLowerCase();
      attrs ??= Object.create(null) as Record<string, string>;
      if (!(name in attrs)) {
        const value = valueStart === -1 ? "" : html.slice(valueStart, valueEnd);
        attrs[name] = value.includes("&") ? decodeEntities(value) : value;
      }
    }
  }
  return -1;
}

/** Offset of the "</name" that ends a raw-text element, matched case-insensitively, or -1. */
function findEndTag(html: string, name: string, from: number): number {
  let index = from;
  for (;;) {
    const lt = html.indexOf("</", index);
    if (lt === -1) return -1;
    let matches = true;
    for (let offset = 0; offset < name.length; offset++) {
      if ((html.charCodeAt(lt + 2 + offset) | 0x20) !== name.charCodeAt(offset)) {
        matches = false;
        break;
      }
    }
    if (matches) {
      const after = lt + 2 + name.length;
      const code = html.charCodeAt(after);
      if (after >= html.length || isSpace(code) || code === 0x2f || code === 0x3e) return lt;
    }
    index = lt + 2;
  }
}

function isJsonLdType(type: string | undefined): boolean {
  return type !== undefined && type.trim().toLowerCase().startsWith("application/ld+json");
}

/** Tokenizes a document. Linear in its length; any string is accepted. */
export function scanHtml(input: string): HtmlScan {
  const html = typeof input === "string" ? input : "";
  const length = html.length;
  const tokens: HtmlToken[] = [];
  const tags: HtmlTag[] = [];
  const jsonLd: string[] = [];
  let title: string | null = null;
  /** Open <svg>/<math> elements, innermost last. */
  const foreign: string[] = [];

  const sink: AttributeSink = { attrs: NO_ATTRIBUTES, selfClosing: false };
  let textStart = 0;
  let cursor = 0;
  const text = (end: number) => {
    if (end > textStart) tokens.push({ type: "text", start: textStart, end });
  };
  /** Ends the pending text at `lt` and resumes after `end` (exclusive); -1 skips the rest of the input. */
  const skipTo = (lt: number, end: number) => {
    text(lt);
    textStart = cursor = end === -1 ? length : end;
  };

  while (cursor < length) {
    const lt = html.indexOf("<", cursor);
    if (lt === -1) break;
    const next = html.charCodeAt(lt + 1);

    if (next === 0x21 /* ! */) {
      if (html.startsWith("<!--", lt)) {
        if (html.startsWith(">", lt + 4)) skipTo(lt, lt + 5);
        else if (html.startsWith("->", lt + 4)) skipTo(lt, lt + 6);
        else {
          const close = html.indexOf("-->", lt + 4);
          skipTo(lt, close === -1 ? -1 : close + 3);
        }
      } else if (html.startsWith("[CDATA[", lt + 2)) {
        const close = html.indexOf("]]>", lt + 9);
        skipTo(lt, close === -1 ? -1 : close + 3);
      } else {
        // <!DOCTYPE …> and other declarations.
        const close = html.indexOf(">", lt + 2);
        skipTo(lt, close === -1 ? -1 : close + 1);
      }
      continue;
    }

    if (next === 0x3f /* ? */) {
      const close = html.indexOf(">", lt + 2);
      skipTo(lt, close === -1 ? -1 : close + 1);
      continue;
    }

    if (next === 0x2f /* / */) {
      const after = html.charCodeAt(lt + 2);
      if (isAsciiLetter(after)) {
        const stop = nameEnd(html, lt + 2);
        const end = html.charCodeAt(stop) === 0x3e ? stop + 1 : parseAttributes(html, stop, null);
        if (end === -1) {
          // The input ends inside the tag: like a browser, drop it.
          skipTo(lt, -1);
          break;
        }
        text(lt);
        const name = html.slice(lt + 2, stop).toLowerCase();
        tokens.push({ type: "close", name, start: lt, end });
        if (FOREIGN.has(name)) {
          const at = foreign.lastIndexOf(name);
          if (at !== -1) foreign.length = at;
        }
        textStart = cursor = end;
      } else if (after === 0x3e) {
        skipTo(lt, lt + 3); // "</>" is ignored
      } else if (lt + 2 >= length) {
        cursor = lt + 1; // a lone "</" at the very end is text
      } else {
        const close = html.indexOf(">", lt + 2);
        skipTo(lt, close === -1 ? -1 : close + 1); // "</ …>" is a bogus comment
      }
      continue;
    }

    if (!isAsciiLetter(next)) {
      cursor = lt + 1; // "a < b": the "<" is text
      continue;
    }

    const stop = nameEnd(html, lt + 1);
    let end: number;
    if (html.charCodeAt(stop) === 0x3e) {
      end = stop + 1; // "<p>": the common case needs no attribute parsing
      sink.attrs = NO_ATTRIBUTES;
      sink.selfClosing = false;
    } else {
      end = parseAttributes(html, stop, sink);
    }
    if (end === -1) {
      skipTo(lt, -1);
      break;
    }
    text(lt);
    const name = html.slice(lt + 1, stop).toLowerCase();
    const selfClosing = sink.selfClosing;
    const tag: HtmlTag = { name, attrs: sink.attrs, start: lt, end };
    tags.push(tag);

    if (foreign.length > 0 && (FOREIGN_BREAKOUT.has(name) || (name === "font" && ("color" in tag.attrs || "face" in tag.attrs || "size" in tag.attrs)))) {
      // An HTML element inside unclosed SVG/MathML ends it, as in a browser.
      for (let index = foreign.length - 1; index >= 0; index--) {
        tokens.push({ type: "close", name: foreign[index] ?? "svg", start: lt, end: lt });
      }
      foreign.length = 0;
    }

    if (foreign.length === 0 && RAW_TEXT.has(name)) {
      const close = findEndTag(html, name, end);
      const content = html.slice(end, close === -1 ? length : close);
      tokens.push({ type: "open", tag, selfClosing, content });
      if (name === "title" && title === null) title = decodeEntities(content);
      else if (name === "script" && isJsonLdType(tag.attrs.type)) jsonLd.push(content);
      if (close === -1) {
        textStart = cursor = length;
        break;
      }
      const closeTagEnd = parseAttributes(html, close + 2 + name.length, null);
      const closeEnd = closeTagEnd === -1 ? length : closeTagEnd;
      tokens.push({ type: "close", name, start: close, end: closeEnd });
      textStart = cursor = closeEnd;
      continue;
    }

    tokens.push({ type: "open", tag, selfClosing, content: null });
    if (FOREIGN.has(name) && !selfClosing) foreign.push(name);
    textStart = cursor = end;
  }
  text(length);

  return { html, tokens, tags, title, jsonLd };
}

/**
 * The outermost elements with this (lowercase) name, as token ranges.
 * Nested elements of the same name are part of their ancestor's range.
 */
export function elementRanges(scan: HtmlScan, name: string): ElementRange[] {
  const ranges: ElementRange[] = [];
  let depth = 0;
  let open = -1;
  scan.tokens.forEach((token, index) => {
    if (token.type === "open" && token.tag.name === name && !token.selfClosing) {
      if (depth === 0) open = index;
      depth++;
    } else if (token.type === "close" && token.name === name && depth > 0) {
      depth--;
      if (depth === 0) ranges.push({ open, close: index });
    }
  });
  if (depth > 0) ranges.push({ open, close: scan.tokens.length });
  return ranges;
}

/** Elements whose text a reader doesn't see as part of the page's content. */
const NOT_CONTENT = new Set([
  "nav", "header", "footer", "aside", "form", "button", "select", "svg", "math", "object", "canvas", "video", "audio",
  "datalist", "dialog",
]);

/** Elements that flow inside a line; every other tag separates words. */
const INLINE = new Set([
  "a", "abbr", "b", "bdi", "bdo", "cite", "code", "data", "del", "dfn", "em", "font", "i", "ins", "kbd", "mark", "q",
  "s", "samp", "small", "span", "strike", "strong", "sub", "sup", "time", "tt", "u", "var", "wbr",
]);

/**
 * The text a reader sees between two token indices (start inclusive, end
 * exclusive): entities decoded, whitespace collapsed to single spaces,
 * trimmed. Raw-text elements (script, style, noscript, template…) are never
 * included, and neither is anything inside nav, header, footer, aside,
 * form, button, select, svg and similar furniture.
 */
export function visibleText(scan: HtmlScan, from = 0, to = scan.tokens.length): string {
  const parts: string[] = [];
  const hidden = new Map<string, number>();
  let hiddenDepth = 0;
  const end = Math.min(to, scan.tokens.length);
  for (let index = Math.max(0, from); index < end; index++) {
    const token = scan.tokens[index];
    if (token === undefined) continue;
    if (token.type === "text") {
      if (hiddenDepth === 0) parts.push(scan.html.slice(token.start, token.end));
    } else if (token.type === "open") {
      const name = token.tag.name;
      if (NOT_CONTENT.has(name)) {
        if (!token.selfClosing) {
          hidden.set(name, (hidden.get(name) ?? 0) + 1);
          hiddenDepth++;
        }
      } else if (hiddenDepth === 0 && !INLINE.has(name)) {
        parts.push(" ");
      }
    } else {
      const depth = hidden.get(token.name) ?? 0;
      if (depth > 0) {
        hidden.set(token.name, depth - 1);
        hiddenDepth--;
      } else if (hiddenDepth === 0 && !INLINE.has(token.name)) {
        parts.push(" ");
      }
    }
  }
  // Runs and non-space whitespace only: single spaces are left alone, which is much faster on long text.
  return decodeEntities(parts.join("")).replace(/\s{2,}|[^\S ]/g, " ").trim();
}
