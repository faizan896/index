import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  asSentence,
  byName,
  displayUrl,
  isSameAddress,
  itemMetaParts,
  languageName,
  processingPhase,
  safeHref,
  sharedNames,
  splitNames,
  truncateMiddle,
} from "./item-format";

describe("processingPhase", () => {
  it("reports fetching first, then sorting, then idle", () => {
    assert.equal(processingPhase({ metadataStatus: "pending", classificationStatus: "pending" }), "fetching");
    assert.equal(processingPhase({ metadataStatus: "processing", classificationStatus: "done" }), "fetching");
    assert.equal(processingPhase({ metadataStatus: "done", classificationStatus: "processing" }), "sorting");
    assert.equal(processingPhase({ metadataStatus: "failed", classificationStatus: "pending" }), "sorting");
    assert.equal(processingPhase({ metadataStatus: "done", classificationStatus: "skipped" }), "idle");
    assert.equal(processingPhase({ metadataStatus: "failed", classificationStatus: "failed" }), "idle");
  });
});

describe("itemMetaParts", () => {
  const base = { author: null, siteName: null, domain: "example.com", publishedAt: null, readingMinutes: null };

  it("always names the source", () => {
    assert.deepEqual(itemMetaParts(base), ["example.com"]);
  });

  it("lists author, source, publication date and reading time in order", () => {
    assert.deepEqual(
      itemMetaParts({
        author: "Ana Ruiz",
        siteName: "The Atlantic",
        domain: "theatlantic.com",
        publishedAt: "2025-01-12T09:30:00Z",
        readingMinutes: 8,
      }),
      ["Ana Ruiz", "The Atlantic", "Published 12 Jan 2025", "8 min read"],
    );
  });

  it("doesn't repeat an author that is just the site's name", () => {
    assert.deepEqual(itemMetaParts({ ...base, author: "stripe", siteName: "Stripe" }), ["Stripe"]);
  });

  it("skips blank authors and unusable dates", () => {
    assert.deepEqual(itemMetaParts({ ...base, author: "  ", publishedAt: "not a date", readingMinutes: 0 }), ["example.com"]);
  });
});

describe("asSentence", () => {
  it("adds a full stop only when one is missing", () => {
    assert.equal(asSentence("The page took too long to respond."), "The page took too long to respond.");
    assert.equal(asSentence("Timed out"), "Timed out.");
    assert.equal(asSentence("  "), "");
    assert.equal(asSentence(null), "");
  });
});

describe("truncateMiddle", () => {
  it("leaves short text alone", () => {
    assert.equal(truncateMiddle("example.com/a", 20), "example.com/a");
  });

  it("cuts the middle and keeps both ends", () => {
    const result = truncateMiddle("example.com/2024/05/a-very-long-article-slug-indeed/final-part", 30);
    assert.equal([...result].length, 30);
    assert.ok(result.startsWith("example.com/2024/"));
    assert.ok(result.endsWith("final-part"));
    assert.ok(result.includes("…"));
  });

  it("never splits a character in two", () => {
    const result = truncateMiddle("😀".repeat(40), 9);
    assert.equal([...result].length, 9);
    assert.ok([...result].every((char) => char === "😀" || char === "…"));
  });

  it("handles tiny limits", () => {
    assert.equal(truncateMiddle("abcdef", 1), "…");
    assert.equal(truncateMiddle("abcdef", 2), "a…");
  });
});

describe("displayUrl", () => {
  it("drops the scheme and a trailing slash", () => {
    assert.equal(displayUrl("https://example.com/"), "example.com");
    assert.equal(displayUrl("http://www.example.com/a/b/"), "www.example.com/a/b");
    assert.equal(displayUrl("https://example.com/a?b=1"), "example.com/a?b=1");
  });
});

describe("safeHref", () => {
  it("allows only web addresses", () => {
    assert.equal(safeHref("https://example.com/a"), "https://example.com/a");
    assert.equal(safeHref("http://example.com"), "http://example.com/");
    assert.equal(safeHref("javascript:alert(1)"), null);
    assert.equal(safeHref("data:text/html,hi"), null);
    assert.equal(safeHref("not a url"), null);
    assert.equal(safeHref(null), null);
  });
});

describe("isSameAddress", () => {
  it("ignores a trailing slash and host case", () => {
    assert.ok(isSameAddress("https://Example.com/a/", "https://example.com/a"));
    assert.ok(isSameAddress("https://example.com", "https://example.com/"));
  });

  it("tells different addresses apart", () => {
    assert.ok(!isSameAddress("https://example.com/a", "https://example.com/b"));
    assert.ok(!isSameAddress("http://example.com/a", "https://example.com/a"));
  });
});

describe("languageName", () => {
  it("names common languages and falls back to the code", () => {
    assert.equal(languageName("en"), "English");
    assert.equal(languageName("ja"), "Japanese");
    assert.equal(languageName("not_a_tag!"), "not_a_tag!");
    assert.equal(languageName(null), "");
    assert.equal(languageName(" "), "");
  });
});

describe("sharedNames", () => {
  it("lists categories before tags, at most three, without duplicates", () => {
    assert.deepEqual(
      sharedNames({ sharedCategories: ["Payments", "Stablecoins"], sharedTags: ["payments", "regulation", "defi"] }),
      ["Payments", "Stablecoins", "regulation"],
    );
  });

  it("respects a custom limit and skips blanks", () => {
    assert.deepEqual(sharedNames({ sharedCategories: [" ", "AI"], sharedTags: ["agents"] }, 1), ["AI"]);
    assert.deepEqual(sharedNames({ sharedCategories: [], sharedTags: [] }), []);
  });
});

describe("splitNames", () => {
  it("splits on commas and new lines and trims", () => {
    assert.deepEqual(splitNames(" Payments, Stablecoins ,,\nDeFi "), ["Payments", "Stablecoins", "DeFi"]);
    assert.deepEqual(splitNames(" , "), []);
  });
});

describe("byName", () => {
  it("sorts alphabetically, ignoring case", () => {
    const sorted = [{ name: "beta" }, { name: "Alpha" }, { name: "gamma" }].sort(byName).map((entry) => entry.name);
    assert.deepEqual(sorted, ["Alpha", "beta", "gamma"]);
  });
});
