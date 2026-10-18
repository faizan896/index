/**
 * Fetching a saved page from the server, safely.
 *
 * Every URL here comes from a user, so the fetcher refuses anything that could
 * reach inside our own network (server-side request forgery):
 * - only http(s), only ports 80 and 443, no credentials in the URL;
 * - every address the host resolves to must be public (see ./ip), and the
 *   connection is pinned to an address that was checked, so a DNS answer that
 *   changes between the check and the connect (rebinding) can't steer it;
 * - redirects are followed by hand, and each hop is checked again.
 *
 * One deadline covers the whole exchange and the decompressed body is capped,
 * so a slow or hostile site can't hold a worker or exhaust its memory.
 * fetchPage never throws: every outcome is a FetchPageResult.
 */

import type { LookupAddress } from "node:dns";
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import type { ClientRequest, IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import type { RequestOptions } from "node:https";
import { isIP } from "node:net";
import type { LookupFunction } from "node:net";
import { pipeline, Transform, Writable } from "node:stream";
import type { TransformCallback } from "node:stream";
import { constants as zlibConstants, createBrotliDecompress, createGunzip, createInflate, createInflateRaw } from "node:zlib";

import { decodeHtml } from "./decode";
import { isPublicAddress } from "./ip";

export interface FetchPageOptions {
  /** Total deadline including redirects and the body. Default 10 000 ms. */
  timeoutMs?: number;
  /** Maximum decompressed body bytes read. Default 3 000 000. */
  maxBytes?: number;
  /** Default 5. */
  maxRedirects?: number;
  userAgent?: string;
  signal?: AbortSignal;
  /** Tests only. Resolve hostnames without real DNS. */
  lookup?: (hostname: string) => Promise<Array<{ address: string; family: 4 | 6 }>>;
  /** Tests only. Permit loopback/private targets so local test servers work. */
  allowPrivateNetwork?: boolean;
  /** Tests only. Ports allowed besides 80/443 (default none). */
  allowedPorts?: number[];
  /**
   * Tests only. Maps each validated address of a resolved hostname to the
   * address actually dialed, so a local server can stand in for a public
   * host. Applied after validation; it never relaxes it.
   */
  dialAddress?: (address: string) => string;
}

export type FetchFailureReason =
  | "invalid_url"
  | "blocked"
  | "dns"
  | "timeout"
  | "redirects"
  | "http"
  | "network"
  | "too_large";

export type FetchPageResult =
  | { ok: true; finalUrl: string; status: number; contentType: string | null; html: string | null; truncated: boolean }
  | { ok: false; reason: FetchFailureReason; message: string; status?: number; finalUrl?: string };

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 3_000_000;
const DEFAULT_MAX_REDIRECTS = 5;
/** setTimeout's ceiling. */
const MAX_TIMEOUT_MS = 2_147_483_647;
const MAX_HEADER_BYTES = 64 * 1024;
/** Stacked content codings beyond this are refused. */
const MAX_CODINGS = 3;
/** Bytes looked at to decide whether a body without a Content-Type is HTML. */
const SNIFF_BYTES = 512;

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const STANDARD_PORTS = [80, 443];
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const HTML_TYPES = new Set(["text/html", "application/xhtml+xml"]);
const HTML_START = /^(?:<!doctype\s+html|<(?:html|head|body|title|meta|script)(?=[\s/>])|<!--)/i;

/** Lenient flushing decodes what arrived even when a server cuts the stream short, as browsers do. */
const ZLIB_OPTIONS = { flush: zlibConstants.Z_SYNC_FLUSH, finishFlush: zlibConstants.Z_SYNC_FLUSH };
const BROTLI_OPTIONS = {
  flush: zlibConstants.BROTLI_OPERATION_FLUSH,
  finishFlush: zlibConstants.BROTLI_OPERATION_FLUSH,
};

const MESSAGES: Record<Exclude<FetchFailureReason, "http">, string> = {
  invalid_url: "That address can't be fetched.",
  blocked: "This address points to a private network, so Index won't fetch it.",
  dns: "The site's address couldn't be found.",
  timeout: "The page took too long to respond.",
  redirects: "The page redirected too many times.",
  network: "The site couldn't be reached.",
  too_large: "The site sent more than Index can read.",
};

interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

type Hop = { kind: "page"; result: FetchPageResult } | { kind: "redirect"; location: string };

/** A failure on its way to becoming a FetchPageResult. */
class FetchFailure extends Error {
  readonly reason: FetchFailureReason;
  readonly status: number | undefined;
  readonly finalUrl: string | undefined;

  constructor(reason: FetchFailureReason, details: { status?: number; finalUrl?: string } = {}) {
    super(reason);
    this.reason = reason;
    this.status = details.status;
    this.finalUrl = details.finalUrl;
  }
}

/**
 * Fetches an http(s) page for metadata extraction. Resolves with the decoded
 * HTML (null for non-HTML responses, whose bodies are never read), or with a
 * failure whose message is fit to show the user. An abort through
 * `options.signal` is reported as a timeout.
 */
export async function fetchPage(url: string, options: FetchPageOptions = {}): Promise<FetchPageResult> {
  const settings = options ?? {};
  const controller = new AbortController();
  const abort = () => controller.abort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    timer = setTimeout(abort, Math.min(numberOption(settings.timeoutMs, DEFAULT_TIMEOUT_MS, 1), MAX_TIMEOUT_MS));
    if (settings.signal?.aborted) abort();
    else settings.signal?.addEventListener("abort", abort, { once: true });
    return await follow(url, settings, controller.signal);
  } catch (error) {
    if (error instanceof FetchFailure) return failureResult(error);
    return failureResult(new FetchFailure(controller.signal.aborted ? "timeout" : "network"));
  } finally {
    clearTimeout(timer);
    try {
      settings.signal?.removeEventListener("abort", abort);
    } catch {
      // A malformed signal was already reported as a failure above.
    }
  }
}

async function follow(input: string, options: FetchPageOptions, signal: AbortSignal): Promise<FetchPageResult> {
  const maxRedirects = numberOption(options.maxRedirects, DEFAULT_MAX_REDIRECTS, 0);
  let url = parseUrl(input);
  const visited = new Set<string>();

  for (let redirects = 0; ; redirects++) {
    checkUrl(url, options);
    visited.add(withoutFragment(url));
    const addresses = await resolveAddresses(url, options, signal);
    const hop = await exchange(url, addresses, options, signal);
    if (hop.kind === "page") return hop.result;

    const next = redirectTarget(hop.location, url);
    if (redirects >= maxRedirects || visited.has(withoutFragment(next))) {
      throw new FetchFailure("redirects", { finalUrl: url.href });
    }
    url = next;
  }
}

function parseUrl(input: string): URL {
  try {
    return new URL(input);
  } catch {
    throw new FetchFailure("invalid_url");
  }
}

/** Scheme, credentials and port: checked for the first URL and for every redirect target. */
function checkUrl(url: URL, options: FetchPageOptions): void {
  const finalUrl = url.href;
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new FetchFailure("invalid_url", { finalUrl });
  if (url.username || url.password) throw new FetchFailure("invalid_url", { finalUrl });
  const port = portOf(url);
  const allowed = STANDARD_PORTS.includes(port) || (Array.isArray(options.allowedPorts) && options.allowedPorts.includes(port));
  if (!allowed) throw new FetchFailure("invalid_url", { finalUrl });
}

function redirectTarget(location: string, current: URL): URL {
  let next: URL;
  try {
    next = new URL(location, current);
  } catch {
    throw new FetchFailure("invalid_url", { finalUrl: current.href });
  }
  // A Location without a fragment keeps the original one (RFC 9110 §10.2.2).
  if (!next.hash && current.hash) next.hash = current.hash;
  return next;
}

/**
 * The addresses this hop may connect to: the IP literal itself, or every
 * address the hostname resolves to — all of which must be public.
 */
async function resolveAddresses(url: URL, options: FetchPageOptions, signal: AbortSignal): Promise<ResolvedAddress[]> {
  const finalUrl = url.href;
  const host = bareHost(url);
  const literal = isIP(host);
  const addresses: ResolvedAddress[] = [];

  if (literal === 4 || literal === 6) {
    addresses.push({ address: host, family: literal });
  } else {
    const lookup = options.lookup ?? systemLookup;
    let answers: unknown;
    try {
      answers = await untilAborted(Promise.resolve().then(() => lookup(host)), signal);
    } catch {
      throw new FetchFailure(signal.aborted ? "timeout" : "dns", { finalUrl });
    }
    for (const answer of Array.isArray(answers) ? answers : []) {
      const address: unknown = (answer as { address?: unknown } | null)?.address;
      if (typeof address !== "string") continue;
      const family = isIP(address);
      if (family === 4 || family === 6) addresses.push({ address, family });
    }
    if (addresses.length === 0) throw new FetchFailure("dns", { finalUrl });
  }

  if (!options.allowPrivateNetwork && !addresses.every(({ address }) => isPublicAddress(address))) {
    throw new FetchFailure("blocked", { finalUrl });
  }
  return addresses;
}

function systemLookup(hostname: string): Promise<LookupAddress[]> {
  return dnsLookup(hostname, { all: true });
}

/** Rejects as soon as the deadline passes; the abandoned promise is left to settle on its own. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error("aborted"));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/**
 * One request/response. Resolves with the page or a redirect; rejects with a
 * FetchFailure. Whatever happens, the request, the response and every decoder
 * are destroyed before it settles.
 */
function exchange(
  url: URL,
  addresses: readonly ResolvedAddress[],
  options: FetchPageOptions,
  signal: AbortSignal,
): Promise<Hop> {
  return new Promise<Hop>((resolve, reject) => {
    const finalUrl = url.href;
    const streams: Array<{ destroy(error?: Error): unknown }> = [];
    let request: ClientRequest | null = null;
    let settled = false;

    const settle = (outcome: Hop | FetchFailure) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      for (const stream of streams) stream.destroy();
      request?.destroy();
      if (outcome instanceof FetchFailure) reject(outcome);
      else resolve(outcome);
    };
    const onAbort = () => settle(new FetchFailure("timeout", { finalUrl }));

    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });

    const onResponse = (response: IncomingMessage) => {
      streams.push(response);
      if (settled) {
        response.destroy();
        return;
      }
      // Late errors after settling are expected (we destroy the stream) and ignored.
      response.on("error", () => {});

      const status = response.statusCode ?? 0;
      const location = headerValue(response.headers.location);
      if (REDIRECT_STATUSES.has(status) && location !== null) {
        settle({ kind: "redirect", location });
        return;
      }
      if (status < 200 || status > 299) {
        settle(new FetchFailure("http", { status, finalUrl }));
        return;
      }

      const contentType = headerValue(response.headers["content-type"]);
      const page = (html: string | null, truncated: boolean) =>
        settle({ kind: "page", result: { ok: true, finalUrl, status, contentType, html, truncated } });

      // Not a web page (a PDF, an image, …): its body is of no use, so don't download it.
      if (contentType !== null && !HTML_TYPES.has(mimeType(contentType))) {
        page(null, false);
        return;
      }

      const decoders = createDecoders(headerValue(response.headers["content-encoding"]));
      if (decoders === null) {
        settle(new FetchFailure("network", { finalUrl }));
        return;
      }
      streams.push(...decoders);

      const maxBytes = numberOption(options.maxBytes, DEFAULT_MAX_BYTES, 0);
      const chunks: Buffer[] = [];
      let received = 0;
      // Unknown until sniffed when the server didn't say what it sent.
      let isHtml: boolean | null = contentType === null ? null : true;

      const finish = (truncated: boolean) => {
        const body = Buffer.concat(chunks, received);
        const html = isHtml ?? looksLikeHtml(body);
        isHtml = html;
        page(html ? decodeHtml(body, contentType) : null, html && truncated);
      };

      // Counts decompressed bytes, so a small compressed body can't expand without limit.
      const sink = new Writable({
        write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
          const room = maxBytes - received;
          if (chunk.length > room) {
            chunks.push(chunk.subarray(0, room));
            received += room;
            callback();
            finish(true);
            return;
          }
          chunks.push(chunk);
          received += chunk.length;
          callback();
          if (isHtml === null && received >= SNIFF_BYTES) {
            isHtml = looksLikeHtml(Buffer.concat(chunks, received));
            if (!isHtml) page(null, false);
          }
        },
        final(callback: (error?: Error | null) => void) {
          callback();
          finish(false);
        },
      });
      streams.push(sink);

      pipeline([response, ...decoders, sink], (error) => {
        if (!error || settled) return;
        // The body broke off part-way. What arrived is still worth keeping:
        // the <head> is what matters, and it comes first.
        if (received > 0 && isHtml !== false) finish(true);
        else settle(networkFailure(error, finalUrl));
      });
    };

    try {
      request = send(url, addresses, options);
    } catch {
      settle(new FetchFailure("network", { finalUrl }));
      return;
    }
    // Stays attached after settling: destroying a request emits a late "socket hang up".
    request.on("error", (error) => settle(networkFailure(error, finalUrl)));
    request.on("response", (response: IncomingMessage) => {
      try {
        onResponse(response);
      } catch {
        settle(new FetchFailure("network", { finalUrl }));
      }
    });
    request.end();
  });
}

function send(url: URL, addresses: readonly ResolvedAddress[], options: FetchPageOptions): ClientRequest {
  const host = bareHost(url);
  const requestOptions: RequestOptions = {
    method: "GET",
    hostname: host,
    port: portOf(url),
    path: `${url.pathname}${url.search}`,
    headers: {
      Host: url.host,
      "User-Agent": options.userAgent || DEFAULT_USER_AGENT,
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
    },
    // A fresh connection for every request: no pooled sockets and no cookies
    // or other state carried between fetches.
    agent: false,
    lookup: pinnedLookup(addresses, options.dialAddress),
    maxHeaderSize: MAX_HEADER_BYTES,
  };
  if (url.protocol === "https:") {
    // SNI and certificate checks use the hostname, never the pinned address.
    if (isIP(host) === 0) requestOptions.servername = host.replace(/\.$/, "");
    return httpsRequest(requestOptions);
  }
  return httpRequest(requestOptions);
}

/**
 * A `lookup` for http(s).request that answers with the already-validated
 * addresses instead of asking DNS again. Node calls it with `all: true` when
 * it races IPv4 and IPv6 (autoSelectFamily) and expects an array; otherwise it
 * expects a single address and family.
 */
function pinnedLookup(addresses: readonly ResolvedAddress[], dial?: (address: string) => string): LookupFunction {
  const targets: ResolvedAddress[] = [];
  for (const { address } of addresses) {
    const dialed = dial ? dial(address) : address;
    const family = isIP(dialed);
    if (family === 4 || family === 6) targets.push({ address: dialed, family });
  }

  return (_hostname, lookupOptions, callback) => {
    const requested = lookupOptions.family;
    const family = requested === 4 || requested === "IPv4" ? 4 : requested === 6 || requested === "IPv6" ? 6 : 0;
    const usable = family === 0 ? targets : targets.filter((target) => target.family === family);
    process.nextTick(() => {
      const first = usable[0];
      if (!first) {
        const error = Object.assign(new Error("No validated address for this host."), { code: "ENOTFOUND" });
        callback(error, lookupOptions.all ? [] : "");
      } else if (lookupOptions.all) {
        callback(null, usable.map((target) => ({ address: target.address, family: target.family })));
      } else {
        callback(null, first.address, first.family);
      }
    });
  };
}

/** Decoders for a Content-Encoding header, in the order to apply them; null when a coding isn't supported. */
function createDecoders(contentEncoding: string | null): Transform[] | null {
  const codings = (contentEncoding ?? "")
    .toLowerCase()
    .split(",")
    .map((coding) => coding.trim())
    .filter((coding) => coding !== "" && coding !== "identity");
  if (codings.length > MAX_CODINGS) return null;

  const decoders: Transform[] = [];
  // Codings are listed in the order they were applied; undo them in reverse.
  for (const coding of codings.reverse()) {
    if (coding === "gzip" || coding === "x-gzip") decoders.push(createGunzip(ZLIB_OPTIONS));
    else if (coding === "deflate") decoders.push(createDeflateDecoder());
    else if (coding === "br") decoders.push(createBrotliDecompress(BROTLI_OPTIONS));
    else return null;
  }
  return decoders;
}

/**
 * HTTP "deflate" is meant to be zlib-wrapped, but some servers send raw
 * deflate data. Browsers accept both, so the first two bytes decide.
 */
function createDeflateDecoder(): Transform {
  let inner: Transform | null = null;
  let head = Buffer.alloc(0);

  const start = (first: Buffer): Transform => {
    const cmf = first[0] ?? 0;
    const flg = first[1] ?? 0;
    const wrapped = (cmf & 0x0f) === 8 && (cmf * 256 + flg) % 31 === 0;
    const stream = wrapped ? createInflate(ZLIB_OPTIONS) : createInflateRaw(ZLIB_OPTIONS);
    stream.on("data", (chunk: Buffer) => outer.push(chunk));
    stream.on("error", (error) => outer.destroy(error));
    return stream;
  };

  const outer: Transform = new Transform({
    transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
      if (inner) {
        inner.write(chunk, () => callback());
        return;
      }
      head = Buffer.concat([head, chunk]);
      if (head.length < 2) {
        callback();
        return;
      }
      inner = start(head);
      inner.write(head, () => callback());
    },
    flush(callback: TransformCallback) {
      if (!inner) {
        if (head.length === 0) {
          callback();
          return;
        }
        inner = start(head);
        inner.write(head);
      }
      inner.once("end", () => callback());
      inner.end();
    },
    destroy(error: Error | null, callback: (error?: Error | null) => void) {
      inner?.destroy();
      callback(error);
    },
  });
  return outer;
}

function looksLikeHtml(bytes: Buffer): boolean {
  let text = bytes.subarray(0, SNIFF_BYTES).toString("latin1");
  if (text.startsWith("\xef\xbb\xbf")) text = text.slice(3);
  return HTML_START.test(text.trimStart());
}

function failureResult(failure: FetchFailure): FetchPageResult {
  const result: Extract<FetchPageResult, { ok: false }> = {
    ok: false,
    reason: failure.reason,
    message: failure.reason === "http" ? httpMessage(failure.status ?? 0) : MESSAGES[failure.reason],
  };
  if (failure.status !== undefined) result.status = failure.status;
  if (failure.finalUrl !== undefined) result.finalUrl = failure.finalUrl;
  return result;
}

function httpMessage(status: number): string {
  if (status === 401 || status === 402 || status === 403 || status === 451) {
    return "The site didn't allow Index to read this page.";
  }
  if (status === 404 || status === 410) return "The page couldn't be found.";
  if (status === 429) return "The site asked Index to slow down.";
  if (status >= 500) return "The site had a problem responding.";
  return "The site didn't return the page.";
}

function networkFailure(error: unknown, finalUrl: string): FetchFailure {
  const code = (error as { code?: unknown } | null)?.code;
  return new FetchFailure(code === "HPE_HEADER_OVERFLOW" ? "too_large" : "network", { finalUrl });
}

function numberOption(value: number | undefined, fallback: number, min: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= min ? Math.floor(value) : fallback;
}

function headerValue(value: string | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
}

function mimeType(contentType: string): string {
  return (contentType.split(";")[0] ?? "").trim().toLowerCase();
}

/** The hostname without the brackets URLs put around IPv6 literals. */
function bareHost(url: URL): string {
  const { hostname } = url;
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

function portOf(url: URL): number {
  if (url.port) return Number(url.port);
  return url.protocol === "https:" ? 443 : 80;
}

function withoutFragment(url: URL): string {
  const index = url.href.indexOf("#");
  return index === -1 ? url.href : url.href.slice(0, index);
}
