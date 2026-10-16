/**
 * URL intake: turning whatever the user pasted into a link worth saving, and
 * computing the key used to recognise the same page saved twice.
 *
 * Two forms come out of this module:
 * - `url`: what we store and open. The address the user meant, minus tracking
 *   parameters and in-page fragments.
 * - `normalized`: the dedup key. Scheme, `www.`, trailing slashes and
 *   parameter order are folded away, so http://www.example.com/a/?b=1&a=2 and
 *   https://example.com/a?a=2&b=1 are the same entry.
 */

export const MAX_URL_LENGTH = 2048;

export type ParsedUrl =
  | { ok: true; url: string; normalized: string; domain: string }
  | { ok: false; error: string };

/** Query parameters that only ever identify a campaign or a click, never content. */
const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "gbraid",
  "wbraid",
  "msclkid",
  "yclid",
  "twclid",
  "ttclid",
  "li_fat_id",
  "mc_cid",
  "mc_eid",
  "igshid",
  "igsh",
  "_hsenc",
  "_hsmi",
  "__hssc",
  "__hstc",
  "__hsfp",
  "hsctatracking",
  "mkt_tok",
  "ref_src",
  "ref_url",
  "cmpid",
  "s_cid",
  "ncid",
  "sr_share",
  "vero_conv",
  "vero_id",
  "oly_anon_id",
  "oly_enc_id",
  "rb_clickid",
  "wickedid",
  "_ga",
  "_gl",
  "spm",
  "scid",
  "srsltid",
]);

const TRACKING_PREFIXES = ["utm_", "pk_", "mtm_", "hsa_", "piwik_", "matomo_", "itm_"];

/** Parameters that are tracking only on particular hosts. */
const HOST_TRACKING_PARAMS: Array<{ host: RegExp; params: Set<string> }> = [
  { host: /(^|\.)(twitter|x)\.com$/, params: new Set(["s", "t"]) },
  { host: /(^|\.)medium\.com$/, params: new Set(["source", "sk"]) },
  { host: /(^|\.)(youtube\.com|youtu\.be)$/, params: new Set(["si", "feature", "pp"]) },
  { host: /(^|\.)open\.spotify\.com$/, params: new Set(["si"]) },
  { host: /(^|\.)substack\.com$/, params: new Set(["r", "s", "triedredirect", "showWelcomeOnShare"]) },
  { host: /(^|\.)linkedin\.com$/, params: new Set(["trk", "trackingid", "lipi", "midtoken", "midsig"]) },
];

export function isTrackingParam(name: string, hostname = ""): boolean {
  const key = name.toLowerCase();
  if (TRACKING_PARAMS.has(key)) return true;
  if (TRACKING_PREFIXES.some((prefix) => key.startsWith(prefix))) return true;
  return HOST_TRACKING_PARAMS.some(({ host, params }) => host.test(hostname) && (params.has(name) || params.has(key)));
}

/** example.com for www.example.com; leaves other subdomains alone. */
export function domainOf(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return host.startsWith("www.") ? host.slice(4) : host;
}

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function isIpHost(hostname: string): boolean {
  return IPV4.test(hostname) || hostname.startsWith("[");
}

/** Keeps "#!/route" and "#/route" fragments, which single-page apps use as paths. */
function routeFragment(hash: string): string {
  return hash.startsWith("#!") || hash.startsWith("#/") ? hash : "";
}

function stripTracking(url: URL): void {
  const host = url.hostname.toLowerCase();
  for (const key of [...url.searchParams.keys()]) {
    if (isTrackingParam(key, host)) url.searchParams.delete(key);
  }
}

/** Pulls the first http(s) URL out of text like "Great read: https://… (via x)". */
function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"'`]+/i);
  if (!match) return null;
  let candidate = match[0];
  // Trim punctuation that trails a link in prose, but keep a ")" that closes
  // a "(" inside the URL itself (Wikipedia: /wiki/Mercury_(planet)).
  while (/[),.;:!?\]'"]$/.test(candidate)) {
    if (candidate.endsWith(")")) {
      const opens = (candidate.match(/\(/g) ?? []).length;
      const closes = (candidate.match(/\)/g) ?? []).length;
      if (closes <= opens) break;
    }
    candidate = candidate.slice(0, -1);
  }
  return candidate;
}

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d)/i;
const SCHEMELESS = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}(?::\d{1,5})?(?:[/?#]|$)/i;

/**
 * Turns pasted text into a savable URL, or explains (in a sentence fit for
 * the interface) why it can't be saved.
 */
export function parseUserUrl(input: string): ParsedUrl {
  let raw = (input ?? "").trim();
  if (!raw) return { ok: false, error: "Paste a link to save it." };

  // Unwrap <https://…> and "https://…".
  if ((raw.startsWith("<") && raw.endsWith(">")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    raw = raw.slice(1, -1).trim();
  }
  // Find a link inside surrounding text ("Worth reading: https://…").
  if (/https?:\/\//i.test(raw) || /\s/.test(raw) || !HAS_SCHEME.test(raw)) {
    const found = extractUrl(raw);
    if (found) raw = found;
    else if (/\s/.test(raw)) return { ok: false, error: "That doesn't look like a link." };
  }

  if (raw.length > MAX_URL_LENGTH) return { ok: false, error: "That link is too long to save." };

  if (!HAS_SCHEME.test(raw)) {
    if (!SCHEMELESS.test(raw)) return { ok: false, error: "That doesn't look like a link." };
    raw = `https://${raw}`;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "That doesn't look like a link." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only web links (http or https) can be saved." };
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname) return { ok: false, error: "That doesn't look like a link." };
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    return { ok: false, error: "Local addresses can't be saved." };
  }
  if (!isIpHost(hostname)) {
    const labels = hostname.split(".");
    const tld = labels[labels.length - 1] ?? "";
    if (labels.length < 2 || !/^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(tld)) {
      return { ok: false, error: "That doesn't look like a link." };
    }
  }

  // Credentials never belong in a saved link.
  url.username = "";
  url.password = "";
  url.hostname = hostname;
  stripTracking(url);
  url.hash = routeFragment(url.hash);

  const cleaned = url.toString();
  if (cleaned.length > MAX_URL_LENGTH) return { ok: false, error: "That link is too long to save." };

  return { ok: true, url: cleaned, normalized: normalizeUrl(cleaned), domain: domainOf(hostname) };
}

/**
 * The dedup key for a URL. Two URLs with the same key are treated as the same
 * page. Returns the input unchanged if it can't be parsed.
 */
export function normalizeUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return input.trim();
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return url.toString();

  const host = domainOf(url.hostname);
  const port = url.port && url.port !== "80" && url.port !== "443" ? `:${url.port}` : "";

  stripTracking(url);
  const params = [...url.searchParams.entries()]
    .filter(([key]) => key !== "")
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1));
  const search = params.length ? `?${new URLSearchParams(params).toString()}` : "";

  let path = url.pathname || "/";
  if (path.length > 1) path = path.replace(/\/+$/, "") || "/";
  // Index documents are the directory: /blog/index.html ≡ /blog
  path = path.replace(/\/index\.(?:html?|php|aspx?)$/i, "") || "/";

  return `https://${host}${port}${path === "/" ? "" : path}${search}${routeFragment(url.hash)}`;
}
