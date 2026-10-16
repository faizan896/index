import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { domainOf, isTrackingParam, normalizeUrl, parseUserUrl } from "./url";

function ok(input: string) {
  const result = parseUserUrl(input);
  assert.ok(result.ok, `expected "${input}" to parse, got: ${result.ok ? "" : result.error}`);
  return result;
}

function rejects(input: string, message?: RegExp) {
  const result = parseUserUrl(input);
  assert.equal(result.ok, false, `expected "${input}" to be rejected`);
  if (message && !result.ok) assert.match(result.error, message);
}

describe("parseUserUrl", () => {
  it("accepts ordinary links", () => {
    const result = ok("https://www.example.com/essays/on-money");
    assert.equal(result.url, "https://www.example.com/essays/on-money");
    assert.equal(result.normalized, "https://example.com/essays/on-money");
    assert.equal(result.domain, "example.com");
  });

  it("adds https:// to bare domains", () => {
    assert.equal(ok("stratechery.com/2024/aggregation").url, "https://stratechery.com/2024/aggregation");
    assert.equal(ok("example.co.uk").url, "https://example.co.uk/");
    assert.equal(ok("example.com:8080/x").url, "https://example.com:8080/x");
  });

  it("finds the link inside pasted prose and wrappers", () => {
    assert.equal(ok("Worth reading: https://example.com/a-piece (via a friend)").url, "https://example.com/a-piece");
    assert.equal(ok("<https://example.com/x>").url, "https://example.com/x");
    assert.equal(ok("https://example.com/x.").url, "https://example.com/x");
    assert.equal(
      ok("See https://en.wikipedia.org/wiki/Mercury_(planet).").url,
      "https://en.wikipedia.org/wiki/Mercury_(planet)",
    );
  });

  it("strips tracking parameters, credentials and in-page fragments", () => {
    const result = ok("https://user:pw@example.com/post?utm_source=x&id=7&fbclid=abc#section-2");
    assert.equal(result.url, "https://example.com/post?id=7");
  });

  it("keeps single-page-app route fragments", () => {
    assert.equal(ok("https://app.example.com/#/reports/12").url, "https://app.example.com/#/reports/12");
  });

  it("rejects things that are not web links", () => {
    rejects("", /Paste a link/);
    rejects("   ");
    rejects("just some words", /doesn't look like a link/);
    rejects("javascript:alert(1)", /Only web links/);
    rejects("mailto:someone@example.com", /Only web links/);
    rejects("ftp://example.com/file", /Only web links/);
    rejects("file:///etc/passwd", /Only web links/);
    rejects("http://localhost:3000/admin", /Local addresses/);
    rejects("https://printer.local/", /Local addresses/);
    rejects("https://intranet/");
    rejects("https://example.123/");
    rejects(`https://example.com/${"a".repeat(2100)}`, /too long/);
  });

  it("accepts internationalized domains as punycode", () => {
    const result = ok("https://bücher.example/katalog");
    assert.equal(result.domain, "xn--bcher-kva.example");
  });

  it("accepts IP literals (the fetcher decides whether they are reachable)", () => {
    assert.equal(ok("http://93.184.216.34/page").domain, "93.184.216.34");
  });
});

describe("normalizeUrl", () => {
  it("folds scheme, www, trailing slashes and parameter order", () => {
    const a = normalizeUrl("http://www.Example.com/a/b/?z=1&a=2");
    const b = normalizeUrl("https://example.com/a/b?a=2&z=1");
    assert.equal(a, b);
    assert.equal(a, "https://example.com/a/b?a=2&z=1");
  });

  it("treats the root with and without a slash as the same page", () => {
    assert.equal(normalizeUrl("https://example.com/"), normalizeUrl("https://example.com"));
    assert.equal(normalizeUrl("https://example.com/"), "https://example.com");
  });

  it("treats index documents as their directory", () => {
    assert.equal(normalizeUrl("https://example.com/blog/index.html"), "https://example.com/blog");
  });

  it("keeps meaningful differences", () => {
    assert.notEqual(normalizeUrl("https://example.com/a?id=1"), normalizeUrl("https://example.com/a?id=2"));
    assert.notEqual(normalizeUrl("https://blog.example.com/a"), normalizeUrl("https://example.com/a"));
    assert.notEqual(normalizeUrl("https://example.com/A"), normalizeUrl("https://example.com/a"));
  });

  it("drops tracking parameters and non-route fragments", () => {
    assert.equal(normalizeUrl("https://example.com/a?utm_medium=email#top"), "https://example.com/a");
  });

  it("keeps non-default ports", () => {
    assert.equal(normalizeUrl("https://example.com:8443/a"), "https://example.com:8443/a");
    assert.equal(normalizeUrl("http://example.com:80/a"), "https://example.com/a");
  });
});

describe("tracking parameters", () => {
  it("recognizes generic and host-specific tracking", () => {
    assert.ok(isTrackingParam("utm_campaign"));
    assert.ok(isTrackingParam("UTM_Source"));
    assert.ok(isTrackingParam("gclid"));
    assert.ok(isTrackingParam("si", "www.youtube.com"));
    assert.ok(isTrackingParam("source", "medium.com"));
    assert.ok(!isTrackingParam("source", "example.com"));
    assert.ok(!isTrackingParam("ref"), "ref is meaningful on GitHub and elsewhere");
    assert.ok(!isTrackingParam("id"));
  });

  it("keeps YouTube video ids", () => {
    assert.equal(ok("https://www.youtube.com/watch?v=abc123&si=tracking").url, "https://www.youtube.com/watch?v=abc123");
  });
});

describe("domainOf", () => {
  it("removes only a leading www", () => {
    assert.equal(domainOf("WWW.Example.COM"), "example.com");
    assert.equal(domainOf("news.example.com"), "news.example.com");
    assert.equal(domainOf("example.com."), "example.com");
  });
});
