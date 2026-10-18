import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { IncomingHttpHeaders, IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer as createTcpServer } from "node:net";
import type { AddressInfo, Server as TcpServer } from "node:net";
import { brotliCompressSync, deflateRawSync, deflateSync, gzipSync } from "node:zlib";

import { fetchPage } from "./fetch-page";
import type { FetchFailureReason, FetchPageOptions, FetchPageResult } from "./fetch-page";

const PAGE = "<!doctype html><html><head><title>Hello</title></head><body><p>Café</p></body></html>";
const PUBLIC_ADDRESS = "93.184.216.34";

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

let server: Server;
let port = 0;
let origin = "";
let connections = 0;
const requests: Array<{ path: string; headers: IncomingHttpHeaders }> = [];
let bomb = Buffer.alloc(0);
let markPdfClosed: () => void = () => {};
const pdfClosed = new Promise<void>((resolve) => {
  markPdfClosed = resolve;
});

/** windows-1252 bytes for the few non-ASCII characters these tests use. */
function cp1252(text: string): Buffer {
  const high: Record<string, number> = { "“": 0x93, "”": 0x94, "’": 0x92, é: 0xe9 };
  return Buffer.from([...text].map((char) => high[char] ?? char.charCodeAt(0)));
}

function send(response: ServerResponse, body: string | Buffer, headers: Record<string, string> = {}) {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...headers });
  response.end(body);
}

function redirect(response: ServerResponse, status: number, location: string, headers: Record<string, string> = {}) {
  response.writeHead(status, { Location: location, ...headers });
  response.end();
}

function status(response: ServerResponse, code: number) {
  response.writeHead(code, { "Content-Type": "text/html" });
  response.end(`<!doctype html><title>${code}</title>`);
}

const routes: Record<string, Handler> = {
  "/ok": (_request, response) => send(response, PAGE),
  "/cp1252-header": (_request, response) =>
    send(response, cp1252("<html><head><title>“Quoted” café</title></head></html>"), {
      "Content-Type": "text/html; charset=windows-1252",
    }),
  "/cp1252-meta": (_request, response) =>
    send(response, cp1252('<html><head><meta charset="windows-1252"><title>“Quoted” café</title></head></html>'), {
      "Content-Type": "text/html",
    }),
  "/cp1252-http-equiv": (_request, response) =>
    send(
      response,
      cp1252(
        '<html><head><meta http-equiv="Content-Type" content="text/html; charset=windows-1252"><title>It’s “here”</title></head></html>',
      ),
      { "Content-Type": "text/html" },
    ),
  "/gzip": (_request, response) => send(response, gzipSync(PAGE), { "Content-Encoding": "gzip" }),
  "/br": (_request, response) => send(response, brotliCompressSync(PAGE), { "Content-Encoding": "br" }),
  "/deflate": (_request, response) => send(response, deflateSync(PAGE), { "Content-Encoding": "deflate" }),
  "/deflate-raw": (_request, response) => send(response, deflateRawSync(PAGE), { "Content-Encoding": "deflate" }),
  "/gzip-then-br": (_request, response) =>
    send(response, brotliCompressSync(gzipSync(PAGE)), { "Content-Encoding": "gzip, br" }),
  "/zstd": (_request, response) => send(response, Buffer.from([0x28, 0xb5, 0x2f, 0xfd]), { "Content-Encoding": "zstd" }),
  "/untyped-html": (_request, response) => {
    response.writeHead(200);
    response.end("\n  <!DOCTYPE html><html><head><title>Untyped</title></head></html>");
  },
  "/untyped-binary": (_request, response) => {
    response.writeHead(200);
    response.end(Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(2048, 0xff)]));
  },
  "/pdf": (_request, response) => {
    response.on("close", () => markPdfClosed());
    response.writeHead(200, { "Content-Type": "application/pdf" });
    // Starts a large download and never finishes it.
    response.write(Buffer.alloc(64 * 1024, 0x25));
  },
  "/large": (_request, response) =>
    send(response, `<!doctype html><html><head><title>Large</title></head><body>${"x".repeat(50_000)}</body></html>`),
  "/bomb": (_request, response) => send(response, bomb, { "Content-Type": "text/html", "Content-Encoding": "gzip" }),
  "/partial": (_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html", "Content-Length": "100000" });
    response.write(`<!doctype html><html><head><title>Partial</title></head><body>${"y".repeat(2000)}`, () =>
      response.socket?.destroy(),
    );
  },
  "/missing": (_request, response) => status(response, 404),
  "/gone": (_request, response) => status(response, 410),
  "/forbidden": (_request, response) => status(response, 403),
  "/unauthorized": (_request, response) => status(response, 401),
  "/limited": (_request, response) => status(response, 429),
  "/broken": (_request, response) => status(response, 500),
  "/unavailable": (_request, response) => status(response, 503),
  "/teapot": (_request, response) => status(response, 418),
  "/found-nowhere": (_request, response) => {
    response.writeHead(302);
    response.end();
  },
  "/redirect/a": (_request, response) =>
    redirect(response, 301, `${origin}/redirect/b`, { "Set-Cookie": "session=abc; Path=/" }),
  "/redirect/b": (_request, response) => redirect(response, 302, "c?step=3"),
  "/redirect/c": (_request, response) => send(response, "<!doctype html><title>Arrived</title>"),
  "/relative/deep/start": (_request, response) => redirect(response, 307, "../../ok"),
  "/see-other": (_request, response) => redirect(response, 303, "/ok"),
  "/permanent": (_request, response) => redirect(response, 308, "/ok"),
  "/loop/1": (_request, response) => redirect(response, 302, "/loop/2"),
  "/loop/2": (_request, response) => redirect(response, 302, "/loop/1"),
  "/to-ftp": (_request, response) => redirect(response, 302, "ftp://example.com/file"),
  "/to-port-22": (_request, response) => redirect(response, 302, "http://127.0.0.1:22/"),
  "/to-private": (_request, response) => redirect(response, 302, `http://127.0.0.1:${port}/secret`),
  "/to-private-v6": (_request, response) => redirect(response, 302, `http://[::ffff:127.0.0.1]:${port}/secret`),
  "/to-evil": (_request, response) => redirect(response, 302, `http://evil.example:${port}/secret`),
  "/secret": (_request, response) => send(response, "<!doctype html><title>Secret</title>"),
  "/slow-headers": () => {
    // Never answers.
  },
  "/slow-body": (_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html" });
    response.write("<!doctype html><title>Slow</title>");
  },
  "/reset": (request) => request.socket.destroy(),
};

function route(path: string): Handler | undefined {
  const chain = /^\/chain\/(\d+)$/.exec(path);
  if (chain) return (_request, response) => redirect(response, 302, `/chain/${Number(chain[1]) + 1}`);
  return routes[path];
}

function listen(target: TcpServer): Promise<number> {
  return new Promise((resolve) => {
    target.listen(0, "127.0.0.1", () => resolve((target.address() as AddressInfo).port));
  });
}

function close(target: Server): Promise<void> {
  target.closeAllConnections();
  return new Promise((resolve) => target.close(() => resolve()));
}

before(async () => {
  bomb = gzipSync(
    Buffer.concat([Buffer.from("<!doctype html><html><head><title>Bomb</title></head><body>"), Buffer.alloc(30_000_000, 0x61)]),
  );
  server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    requests.push({ path, headers: request.headers });
    const handler = route(path);
    if (handler) handler(request, response);
    else status(response, 404);
  });
  server.on("connection", () => {
    connections += 1;
  });
  port = await listen(server);
  origin = `http://127.0.0.1:${port}`;
});

after(() => close(server));

/** Options that let the fetcher reach the local test server. */
function local(extra: FetchPageOptions = {}): FetchPageOptions {
  return { allowPrivateNetwork: true, allowedPorts: [port], timeoutMs: 3000, ...extra };
}

/** DNS that answers every hostname with one public address. */
async function publicLookup(): Promise<Array<{ address: string; family: 4 | 6 }>> {
  return [{ address: PUBLIC_ADDRESS, family: 4 }];
}

/** Stands the local server in for the public address that was validated. */
function dialLocal(address: string): string {
  return address === PUBLIC_ADDRESS ? "127.0.0.1" : address;
}

function expectOk(result: FetchPageResult) {
  if (!result.ok) assert.fail(`expected a page, got ${result.reason}: ${result.message}`);
  return result;
}

function expectFailure(result: FetchPageResult, reason: FetchFailureReason) {
  if (result.ok) assert.fail(`expected ${reason}, got a page from ${result.finalUrl}`);
  assert.equal(result.reason, reason, result.message);
  return result;
}

function lastRequest(path: string) {
  const found = requests.filter((entry) => entry.path === path).at(-1);
  assert.ok(found, `expected a request for ${path}`);
  return found;
}

function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} took longer than ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function timed(run: () => Promise<FetchPageResult>): Promise<{ result: FetchPageResult; elapsed: number }> {
  const started = performance.now();
  const result = await run();
  return { result, elapsed: performance.now() - started };
}

describe("fetchPage: pages", () => {
  it("fetches an HTML page", async () => {
    const result = expectOk(await fetchPage(`${origin}/ok`, local()));
    assert.equal(result.status, 200);
    assert.equal(result.finalUrl, `${origin}/ok`);
    assert.equal(result.contentType, "text/html; charset=utf-8");
    assert.equal(result.html, PAGE);
    assert.equal(result.truncated, false);
  });

  it("sends browser-like headers and nothing else", async () => {
    await fetchPage(`${origin}/ok?q=1`, local());
    const { headers } = lastRequest("/ok");
    assert.match(headers["user-agent"] ?? "", /^Mozilla\/5\.0 \(.+\) AppleWebKit\/.+ Chrome\/[\d.]+ Safari\/[\d.]+$/);
    assert.equal(headers.accept, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5");
    assert.equal(headers["accept-language"], "en-US,en;q=0.9");
    assert.equal(headers["accept-encoding"], "gzip, deflate, br");
    assert.equal(headers.host, `127.0.0.1:${port}`);
    assert.equal(headers.connection, "close");
    assert.equal(headers.cookie, undefined);
    assert.equal(headers.authorization, undefined);
  });

  it("lets the caller set the user agent", async () => {
    await fetchPage(`${origin}/ok`, local({ userAgent: "IndexTest/1.0" }));
    assert.equal(lastRequest("/ok").headers["user-agent"], "IndexTest/1.0");
  });

  it("decodes windows-1252 declared in the Content-Type header", async () => {
    const result = expectOk(await fetchPage(`${origin}/cp1252-header`, local()));
    assert.equal(result.html, "<html><head><title>“Quoted” café</title></head></html>");
  });

  it("decodes windows-1252 declared in a <meta> tag", async () => {
    const meta = expectOk(await fetchPage(`${origin}/cp1252-meta`, local()));
    assert.equal(meta.html, '<html><head><meta charset="windows-1252"><title>“Quoted” café</title></head></html>');
    const httpEquiv = expectOk(await fetchPage(`${origin}/cp1252-http-equiv`, local()));
    assert.match(httpEquiv.html ?? "", /<title>It’s “here”<\/title>/);
  });

  it("decompresses gzip, brotli and both kinds of deflate", async () => {
    for (const path of ["/gzip", "/br", "/deflate", "/deflate-raw", "/gzip-then-br"]) {
      const result = expectOk(await fetchPage(`${origin}${path}`, local()));
      assert.equal(result.html, PAGE, path);
      assert.equal(result.truncated, false, path);
    }
  });

  it("refuses content codings it didn't ask for", async () => {
    expectFailure(await fetchPage(`${origin}/zstd`, local()), "network");
  });

  it("recognises HTML sent without a Content-Type", async () => {
    const result = expectOk(await fetchPage(`${origin}/untyped-html`, local()));
    assert.equal(result.contentType, null);
    assert.match(result.html ?? "", /<title>Untyped<\/title>/);
  });

  it("returns no HTML for an unlabelled body that isn't HTML", async () => {
    const result = expectOk(await fetchPage(`${origin}/untyped-binary`, local()));
    assert.equal(result.contentType, null);
    assert.equal(result.html, null);
    assert.equal(result.truncated, false);
  });

  it("doesn't download non-HTML responses", async () => {
    const { result, elapsed } = await timed(() => fetchPage(`${origin}/pdf`, local({ timeoutMs: 2000 })));
    const page = expectOk(result);
    assert.equal(page.html, null);
    assert.equal(page.contentType, "application/pdf");
    assert.equal(page.truncated, false);
    assert.ok(elapsed < 1000, `took ${elapsed}ms`);
    // The connection is dropped rather than drained.
    await within(pdfClosed, 1000, "closing the PDF download");
  });

  it("stops reading at maxBytes and keeps the start of the page", async () => {
    const result = expectOk(await fetchPage(`${origin}/large`, local({ maxBytes: 1000 })));
    assert.equal(result.truncated, true);
    assert.equal(result.html?.length, 1000);
    assert.ok(result.html?.startsWith("<!doctype html><html><head><title>Large</title></head><body>xxx"));
  });

  it("doesn't mark a body of exactly maxBytes as truncated", async () => {
    const result = expectOk(await fetchPage(`${origin}/ok`, local({ maxBytes: Buffer.byteLength(PAGE) })));
    assert.equal(result.truncated, false);
    assert.equal(result.html, PAGE);
  });

  it("counts decompressed bytes, so a gzip bomb stops at maxBytes", async () => {
    assert.ok(bomb.length < 100_000, `the bomb should be small on the wire (${bomb.length} bytes)`);
    const { result, elapsed } = await timed(() => fetchPage(`${origin}/bomb`, local({ maxBytes: 100_000 })));
    const page = expectOk(result);
    assert.equal(page.truncated, true);
    assert.equal(page.html?.length, 100_000);
    assert.ok(page.html?.startsWith("<!doctype html><html><head><title>Bomb</title>"));
    assert.ok(elapsed < 2000, `took ${elapsed}ms`);
  });

  it("keeps what arrived when the connection drops part-way through the body", async () => {
    const result = expectOk(await fetchPage(`${origin}/partial`, local()));
    assert.equal(result.truncated, true);
    assert.match(result.html ?? "", /^<!doctype html><html><head><title>Partial<\/title>/);
  });
});

describe("fetchPage: HTTP errors", () => {
  const cases: Array<[string, number, string]> = [
    ["/missing", 404, "The page couldn't be found."],
    ["/gone", 410, "The page couldn't be found."],
    ["/forbidden", 403, "The site didn't allow Index to read this page."],
    ["/unauthorized", 401, "The site didn't allow Index to read this page."],
    ["/limited", 429, "The site asked Index to slow down."],
    ["/broken", 500, "The site had a problem responding."],
    ["/unavailable", 503, "The site had a problem responding."],
    ["/teapot", 418, "The site didn't return the page."],
    ["/found-nowhere", 302, "The site didn't return the page."],
  ];
  for (const [path, code, message] of cases) {
    it(`reports ${code} for ${path}`, async () => {
      const result = expectFailure(await fetchPage(`${origin}${path}`, local()), "http");
      assert.equal(result.status, code);
      assert.equal(result.message, message);
      assert.equal(result.finalUrl, `${origin}${path}`);
    });
  }
});

describe("fetchPage: redirects", () => {
  it("follows a redirect chain, absolute and relative, and reports where it ended", async () => {
    const result = expectOk(await fetchPage(`${origin}/redirect/a`, local()));
    assert.equal(result.finalUrl, `${origin}/redirect/c?step=3`);
    assert.equal(result.html, "<!doctype html><title>Arrived</title>");
    // Set-Cookie on the first hop is never sent back.
    assert.equal(lastRequest("/redirect/b").headers.cookie, undefined);
    assert.equal(lastRequest("/redirect/c").headers.cookie, undefined);
  });

  it("resolves a relative Location against the current URL", async () => {
    const result = expectOk(await fetchPage(`${origin}/relative/deep/start`, local()));
    assert.equal(result.finalUrl, `${origin}/ok`);
    assert.equal(result.html, PAGE);
  });

  it("follows 303 and 308", async () => {
    assert.equal(expectOk(await fetchPage(`${origin}/see-other`, local())).finalUrl, `${origin}/ok`);
    assert.equal(expectOk(await fetchPage(`${origin}/permanent`, local())).finalUrl, `${origin}/ok`);
  });

  it("keeps the original fragment when the Location has none", async () => {
    const result = expectOk(await fetchPage(`${origin}/redirect/a#notes`, local()));
    assert.equal(result.finalUrl, `${origin}/redirect/c?step=3#notes`);
  });

  it("stops at a redirect loop", async () => {
    const result = expectFailure(await fetchPage(`${origin}/loop/1`, local()), "redirects");
    assert.equal(result.message, "The page redirected too many times.");
  });

  it("stops after maxRedirects", async () => {
    const before = requests.length;
    expectFailure(await fetchPage(`${origin}/chain/0`, local({ maxRedirects: 3 })), "redirects");
    assert.deepEqual(
      requests.slice(before).map((entry) => entry.path),
      ["/chain/0", "/chain/1", "/chain/2", "/chain/3"],
    );
    expectFailure(await fetchPage(`${origin}/chain/0`, local()), "redirects");
    expectFailure(await fetchPage(`${origin}/see-other`, local({ maxRedirects: 0 })), "redirects");
  });

  it("checks the scheme and port of every hop", async () => {
    const ftp = expectFailure(await fetchPage(`${origin}/to-ftp`, local()), "invalid_url");
    assert.equal(ftp.finalUrl, "ftp://example.com/file");
    const ssh = expectFailure(await fetchPage(`${origin}/to-port-22`, local()), "invalid_url");
    assert.equal(ssh.finalUrl, "http://127.0.0.1:22/");
  });
});

describe("fetchPage: deadline", () => {
  it("times out when the server never answers", async () => {
    const { result, elapsed } = await timed(() => fetchPage(`${origin}/slow-headers`, local({ timeoutMs: 150 })));
    const failure = expectFailure(result, "timeout");
    assert.equal(failure.message, "The page took too long to respond.");
    assert.ok(elapsed >= 140 && elapsed < 1000, `took ${elapsed}ms`);
  });

  it("times out when the body never finishes", async () => {
    const { result, elapsed } = await timed(() => fetchPage(`${origin}/slow-body`, local({ timeoutMs: 150 })));
    expectFailure(result, "timeout");
    assert.ok(elapsed >= 140 && elapsed < 1000, `took ${elapsed}ms`);
  });

  it("times out when DNS never answers", async () => {
    const { result, elapsed } = await timed(() =>
      fetchPage("https://stuck.example/", { timeoutMs: 100, lookup: () => new Promise(() => {}) }),
    );
    expectFailure(result, "timeout");
    assert.ok(elapsed < 1000, `took ${elapsed}ms`);
  });

  it("counts redirects against the same deadline", async () => {
    const { result, elapsed } = await timed(() =>
      fetchPage(`${origin}/chain/0`, local({ timeoutMs: 150, maxRedirects: 1_000_000 })),
    );
    expectFailure(result, "timeout");
    assert.ok(elapsed < 1000, `took ${elapsed}ms`);
  });

  it("stops when the caller aborts", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);
    const { result, elapsed } = await timed(() =>
      fetchPage(`${origin}/slow-headers`, local({ timeoutMs: 5000, signal: controller.signal })),
    );
    expectFailure(result, "timeout");
    assert.ok(elapsed < 1000, `took ${elapsed}ms`);
  });

  it("doesn't start when the caller has already aborted", async () => {
    const before = connections;
    const result = await fetchPage(`${origin}/ok`, local({ signal: AbortSignal.abort() }));
    expectFailure(result, "timeout");
    assert.equal(connections, before);
  });
});

describe("fetchPage: unreachable sites", () => {
  it("reports a name that doesn't resolve", async () => {
    const lookup = async () => {
      throw Object.assign(new Error("getaddrinfo ENOTFOUND nowhere.example"), { code: "ENOTFOUND" });
    };
    const failure = expectFailure(await fetchPage("https://nowhere.example/", { lookup }), "dns");
    assert.equal(failure.message, "The site's address couldn't be found.");
    assert.equal(failure.finalUrl, "https://nowhere.example/");
    expectFailure(await fetchPage("https://empty.example/", { lookup: async () => [] }), "dns");
  });

  it("reports a refused connection", async () => {
    const spare = createServer();
    const closedPort = await listen(spare);
    await close(spare);
    const failure = expectFailure(
      await fetchPage(`http://127.0.0.1:${closedPort}/`, { allowPrivateNetwork: true, allowedPorts: [closedPort] }),
      "network",
    );
    assert.equal(failure.message, "The site couldn't be reached.");
  });

  it("reports a connection that is cut before any response", async () => {
    expectFailure(await fetchPage(`${origin}/reset`, local()), "network");
  });
});

describe("fetchPage: private networks are off limits", () => {
  it("refuses loopback and private IP literals without connecting", async () => {
    const before = connections;
    const urls = [
      `${origin}/ok`,
      `http://localhost:${port}/ok`,
      "http://[::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://[::ffff:7f00:1]/",
      "http://2130706433/",
      "http://0x7f.1/",
      "http://0.0.0.0/",
      "http://10.0.0.5/",
      "http://192.168.1.1/admin",
      "http://169.254.169.254/latest/meta-data/",
      "http://100.100.100.200/",
      "http://[fd00::1]/",
      "http://[fe80::1]/",
      "http://[64:ff9b::a9fe:a9fe]/",
    ];
    const lookup = async (hostname: string) => {
      assert.equal(hostname, "localhost");
      return [{ address: "127.0.0.1", family: 4 as const }];
    };
    for (const url of urls) {
      const failure = expectFailure(await fetchPage(url, { allowedPorts: [port], lookup }), "blocked");
      assert.equal(failure.message, "This address points to a private network, so Index won't fetch it.");
    }
    assert.equal(connections, before);
  });

  it("refuses a hostname that resolves to a private address", async () => {
    const asked: string[] = [];
    const lookup = async (hostname: string) => {
      asked.push(hostname);
      return [{ address: "10.0.0.5", family: 4 as const }];
    };
    const failure = expectFailure(await fetchPage("https://evil.example/steal", { lookup }), "blocked");
    assert.equal(failure.finalUrl, "https://evil.example/steal");
    assert.deepEqual(asked, ["evil.example"]);
  });

  it("refuses a hostname when any one of its addresses is private", async () => {
    const lookup = async () => [
      { address: PUBLIC_ADDRESS, family: 4 as const },
      { address: "10.0.0.5", family: 4 as const },
    ];
    expectFailure(await fetchPage("https://mixed.example/", { lookup }), "blocked");
    const v6 = async () => [
      { address: "2606:4700::6810:85e5", family: 6 as const },
      { address: "::ffff:169.254.169.254", family: 6 as const },
    ];
    expectFailure(await fetchPage("https://mixed-v6.example/", { lookup: v6 }), "blocked");
  });

  it("connects only to the address it checked (no second lookup to rebind)", async () => {
    let lookups = 0;
    const lookup = async () => {
      lookups += 1;
      // A rebinding server answers publicly first, then privately.
      return [{ address: lookups === 1 ? PUBLIC_ADDRESS : "10.0.0.5", family: 4 as const }];
    };
    const result = expectOk(
      await fetchPage(`http://news.example:${port}/ok`, { allowedPorts: [port], lookup, dialAddress: dialLocal }),
    );
    assert.equal(result.html, PAGE);
    assert.equal(lookups, 1);
    // The Host header names the site, not the address.
    assert.equal(lastRequest("/ok").headers.host, `news.example:${port}`);
  });

  it("speaks TLS to the checked address while naming the site in SNI", async () => {
    let hello: Buffer = Buffer.alloc(0);
    // Records the TLS ClientHello, then hangs up (there is no certificate to offer).
    const tls = createTcpServer((socket) => {
      socket.on("error", () => {});
      socket.once("data", (chunk: Buffer) => {
        hello = chunk;
        socket.destroy();
      });
    });
    const tlsPort = await listen(tls);
    try {
      const result = await fetchPage(`https://secure.example:${tlsPort}/`, {
        allowedPorts: [tlsPort],
        lookup: publicLookup,
        dialAddress: dialLocal,
      });
      expectFailure(result, "network");
      assert.equal(hello[0], 0x16, "expected a TLS handshake record");
      assert.ok(hello.includes("secure.example"), "expected the hostname in the ClientHello");
      assert.ok(!hello.includes("127.0.0.1"));
    } finally {
      await new Promise<void>((resolve) => tls.close(() => resolve()));
    }
  });

  it("refuses a redirect from a public site to a private address", async () => {
    const cases: Array<[string, string]> = [
      ["/to-private", `http://127.0.0.1:${port}/secret`],
      ["/to-private-v6", `http://[::ffff:7f00:1]:${port}/secret`],
    ];
    for (const [path, target] of cases) {
      const before = requests.length;
      const failure = expectFailure(
        await fetchPage(`http://news.example:${port}${path}`, {
          allowedPorts: [port],
          lookup: publicLookup,
          dialAddress: dialLocal,
        }),
        "blocked",
      );
      assert.equal(failure.finalUrl, target);
      assert.deepEqual(
        requests.slice(before).map((entry) => entry.path),
        [path],
      );
    }
  });

  it("refuses a redirect to a hostname that resolves privately", async () => {
    const before = requests.length;
    const lookup = async (hostname: string) => [
      { address: hostname === "evil.example" ? "192.168.0.10" : PUBLIC_ADDRESS, family: 4 as const },
    ];
    const failure = expectFailure(
      await fetchPage(`http://news.example:${port}/to-evil`, { allowedPorts: [port], lookup, dialAddress: dialLocal }),
      "blocked",
    );
    assert.equal(failure.finalUrl, `http://evil.example:${port}/secret`);
    assert.deepEqual(
      requests.slice(before).map((entry) => entry.path),
      ["/to-evil"],
    );
  });
});

describe("fetchPage: addresses it won't fetch", () => {
  it("accepts only http(s) URLs on the standard ports, without credentials", async () => {
    let lookups = 0;
    const lookup = async () => {
      lookups += 1;
      return [{ address: PUBLIC_ADDRESS, family: 4 as const }];
    };
    const urls = [
      "",
      "not a url",
      "example.com/page",
      "ftp://example.com/file",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "data:text/html,<p>hi</p>",
      "gopher://example.com/",
      "ws://example.com/socket",
      "http://user:secret@example.com/",
      "https://user@example.com/",
      "http://example.com:22/",
      "https://example.com:8080/",
      "http://example.com:6379/",
      "https://example.com:0/",
    ];
    for (const url of urls) {
      const failure = expectFailure(await fetchPage(url, { lookup }), "invalid_url");
      assert.equal(failure.message, "That address can't be fetched.");
    }
    assert.equal(lookups, 0);
  });

  it("never throws, whatever it is given", async () => {
    const odd: unknown[] = [undefined, null, 42, {}];
    for (const value of odd) {
      const result = await fetchPage(value as string);
      assert.equal(result.ok, false);
    }
    const throwingLookup = () => {
      throw new Error("boom");
    };
    expectFailure(await fetchPage("https://example.com/", { lookup: throwingLookup }), "dns");
    const badAnswers = async () => [{ address: "not-an-ip", family: 4 as const }];
    expectFailure(await fetchPage("https://example.com/", { lookup: badAnswers }), "dns");
    expectFailure(
      await fetchPage(`${origin}/ok`, local({ userAgent: "bad\r\nX-Injected: 1" })),
      "network",
    );
  });
});
