/**
 * Turning the bytes of a fetched HTML page into text in the encoding the page
 * meant, the way a browser would: a byte order mark first, then the charset
 * in the Content-Type header, then a <meta> declaration near the top of the
 * document, and UTF-8 when nothing says otherwise.
 */

/** How far into the document browsers look for a <meta> charset. */
const META_SCAN_BYTES = 4096;

const CHARSET_PARAM = /charset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s;"']+))/i;
const CONTENT_TYPE_CHARSET = /(?:^|;)\s*charset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s;"']+))/i;
const COMMENT = /<!--[\s\S]*?(?:-->|$)/g;
const META_TAG = /<meta(?=[\s/>])((?:[^>"']|"[^"]*"|'[^']*')*)/gi;
const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

/** Code points for windows-1252 bytes 0x80–0x9F (the rest map to themselves). */
const WINDOWS_1252_C1 = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
];

/**
 * The charset parameter of a Content-Type header, lowercased
 * ("text/html; charset=UTF-8" → "utf-8"), or null when there is none.
 * The label is returned as written; it may name an unknown encoding.
 */
export function charsetFromContentType(contentType: string | null): string | null {
  if (typeof contentType !== "string") return null;
  return charsetLabel(CONTENT_TYPE_CHARSET.exec(contentType));
}

/**
 * The encoding a document declares in its own first bytes: a byte order mark,
 * or a <meta charset> / <meta http-equiv="Content-Type"> within the first 4 KB
 * (comments are skipped). Returns the canonical encoding name ("latin1" →
 * "windows-1252"), or null when nothing usable is declared. Declarations of
 * unsupported encodings are passed over, as browsers do.
 */
export function sniffHtmlCharset(head: Uint8Array): string | null {
  const bom = bomEncoding(head);
  if (bom) return bom;
  const text = String.fromCharCode(...head.subarray(0, META_SCAN_BYTES)).replace(COMMENT, " ");

  for (const tag of text.matchAll(META_TAG)) {
    const attributes = new Map<string, string>();
    for (const attribute of (tag[1] ?? "").matchAll(ATTRIBUTE)) {
      const name = (attribute[1] ?? "").toLowerCase();
      if (!attributes.has(name)) attributes.set(name, attribute[2] ?? attribute[3] ?? attribute[4] ?? "");
    }

    let label = attributes.get("charset") ?? null;
    if (label === null && attributes.get("http-equiv")?.trim().toLowerCase() === "content-type") {
      label = charsetLabel(CHARSET_PARAM.exec(attributes.get("content") ?? ""));
    }
    const encoding = label === null ? null : supportedEncoding(label);
    if (!encoding) continue;
    // A document that could be read as ASCII to find this tag isn't UTF-16.
    return encoding === "utf-16le" || encoding === "utf-16be" ? "utf-8" : encoding;
  }
  return null;
}

/**
 * Decodes an HTML body. Precedence: byte order mark, then the Content-Type
 * charset, then the document's own declaration, then UTF-8. Labels this
 * runtime can't decode are skipped. Malformed bytes become U+FFFD; never throws.
 */
export function decodeHtml(bytes: Uint8Array, contentType: string | null): string {
  try {
    const encoding =
      bomEncoding(bytes) ??
      supportedEncoding(charsetFromContentType(contentType)) ??
      sniffHtmlCharset(bytes) ??
      "utf-8";
    return encoding === "windows-1252" ? decodeWindows1252(bytes) : new TextDecoder(encoding).decode(bytes);
  } catch {
    try {
      return new TextDecoder().decode(bytes);
    } catch {
      return "";
    }
  }
}

function charsetLabel(match: RegExpExecArray | null): string | null {
  const label = (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim().toLowerCase();
  return label || null;
}

function bomEncoding(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return "utf-8";
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  return null;
}

/** The canonical name of the encoding a label refers to, or null if this runtime can't decode it. */
function supportedEncoding(label: string | null): string | null {
  if (!label) return null;
  if (label.trim().toLowerCase() === "x-user-defined") return "windows-1252";
  try {
    return new TextDecoder(label).encoding;
  } catch {
    return null;
  }
}

/**
 * windows-1252 by hand: some Node versions decode it as ISO-8859-1, turning
 * curly quotes (0x93, 0x94) into invisible control characters.
 */
function decodeWindows1252(bytes: Uint8Array): string {
  const chunkSize = 8192;
  const codes = new Uint16Array(Math.min(chunkSize, bytes.length));
  let text = "";
  for (let start = 0; start < bytes.length; start += chunkSize) {
    const end = Math.min(start + chunkSize, bytes.length);
    for (let index = start; index < end; index++) {
      const byte = bytes[index] ?? 0;
      codes[index - start] = byte >= 0x80 && byte < 0xa0 ? (WINDOWS_1252_C1[byte - 0x80] ?? byte) : byte;
    }
    text += String.fromCharCode(...codes.subarray(0, end - start));
  }
  return text;
}
