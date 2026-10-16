import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  EMPTY_FILTERS,
  buildLinkQuery,
  effectiveSort,
  filtersToQueryString,
  filtersToSearchParams,
  hasActiveFilters,
  readFilters,
  savedWithinRange,
} from "./library-query";

describe("readFilters", () => {
  it("reads every supported parameter", () => {
    const filters = readFilters(
      new URLSearchParams("q=  stable   coins &status=reading&fav=1&category=finance&source=Stripe.com&saved=month&sort=alpha"),
    );
    assert.deepEqual(filters, {
      q: "stable coins",
      status: "reading",
      favorite: true,
      category: "finance",
      source: "stripe.com",
      saved: "month",
      sort: "alpha",
    });
  });

  it("discards malformed values instead of failing", () => {
    const filters = readFilters({
      status: "archived",
      fav: "yes",
      category: "../etc",
      source: "exa mple.com",
      saved: "decade",
      sort: "random",
    });
    assert.deepEqual(filters, EMPTY_FILTERS);
  });

  it("accepts Next.js searchParams objects, taking the first of repeated keys", () => {
    assert.equal(readFilters({ q: ["first", "second"] }).q, "first");
  });

  it("caps the search length", () => {
    assert.equal(readFilters({ q: "x".repeat(500) }).q.length, 200);
  });
});

describe("filtersToSearchParams", () => {
  it("round-trips and omits defaults", () => {
    const filters = readFilters(new URLSearchParams("q=ai&status=unread&sort=relevance"));
    assert.equal(filtersToSearchParams(filters).toString(), "q=ai&status=unread");
    assert.deepEqual(readFilters(filtersToSearchParams(filters)), { ...filters, sort: null });
  });

  it("produces an empty string for no filters", () => {
    assert.equal(filtersToQueryString(EMPTY_FILTERS), "");
    assert.equal(filtersToQueryString({ ...EMPTY_FILTERS, sort: "oldest" }), "?sort=oldest");
  });
});

describe("sorting", () => {
  it("defaults to relevance while searching and to recent otherwise", () => {
    assert.equal(effectiveSort(EMPTY_FILTERS), "recent");
    assert.equal(effectiveSort({ ...EMPTY_FILTERS, q: "banking" }), "relevance");
    assert.equal(effectiveSort({ ...EMPTY_FILTERS, q: "banking", sort: "oldest" }), "oldest");
    assert.equal(effectiveSort({ ...EMPTY_FILTERS, sort: "relevance" }), "recent");
  });
});

describe("hasActiveFilters", () => {
  it("ignores sort, which is an ordering rather than a filter", () => {
    assert.equal(hasActiveFilters({ ...EMPTY_FILTERS, sort: "alpha" }), false);
    assert.equal(hasActiveFilters({ ...EMPTY_FILTERS, favorite: true }), true);
  });
});

describe("savedWithinRange", () => {
  const now = new Date("2026-06-01T00:00:00.000Z");
  it("computes half-open windows", () => {
    assert.deepEqual(savedWithinRange("week", now), { from: "2026-05-25T00:00:00.000Z", to: null });
    assert.deepEqual(savedWithinRange("older", now), { from: null, to: "2025-06-01T00:00:00.000Z" });
    assert.deepEqual(savedWithinRange(null, now), { from: null, to: null });
  });
});

describe("buildLinkQuery", () => {
  it("lets the route preset win over a conflicting filter", () => {
    const filters = { ...EMPTY_FILTERS, status: "finished" as const };
    const query = buildLinkQuery({ kind: "status", status: "unread" }, filters, { categoryId: null });
    assert.equal(query.status, "unread");
  });

  it("maps the category slug to the resolved id", () => {
    const filters = { ...EMPTY_FILTERS, category: "finance" };
    const query = buildLinkQuery({ kind: "all" }, filters, { categoryId: "c-1" });
    assert.equal(query.categoryId, "c-1");
  });

  it("matches nothing for an unknown category instead of everything", () => {
    const filters = { ...EMPTY_FILTERS, category: "nope" };
    const query = buildLinkQuery({ kind: "all" }, filters, { categoryId: null });
    assert.equal(query.categoryId, "00000000-0000-0000-0000-000000000000");
  });

  it("clamps paging", () => {
    const query = buildLinkQuery({ kind: "all" }, EMPTY_FILTERS, { categoryId: null, limit: 10_000, offset: -5 });
    assert.equal(query.limit, 200);
    assert.equal(query.offset, 0);
  });

  it("carries favorites, unsorted, tag and collection presets", () => {
    assert.equal(buildLinkQuery({ kind: "favorites" }, EMPTY_FILTERS, { categoryId: null }).favorite, true);
    assert.equal(buildLinkQuery({ kind: "unsorted" }, EMPTY_FILTERS, { categoryId: null }).unsorted, true);
    assert.equal(buildLinkQuery({ kind: "tag", tagId: "t" }, EMPTY_FILTERS, { categoryId: null }).tagId, "t");
    assert.equal(
      buildLinkQuery({ kind: "collection", collectionId: "k" }, EMPTY_FILTERS, { categoryId: null }).collectionId,
      "k",
    );
  });
});

describe("presets as a URL parameter", () => {
  it("round-trips every preset kind", async () => {
    const { presetFromParam, presetToParam } = await import("./library-query");
    const id = "3f1c2b9e-8a7d-4c6b-9e5f-0a1b2c3d4e5f";
    const presets = [
      { kind: "all" },
      { kind: "favorites" },
      { kind: "unsorted" },
      { kind: "status", status: "reading" },
      { kind: "category", categoryId: id },
      { kind: "tag", tagId: id },
      { kind: "collection", collectionId: id },
    ] as const;
    for (const preset of presets) {
      assert.deepEqual(presetFromParam(presetToParam(preset)), preset);
    }
  });

  it("treats junk as the whole library", async () => {
    const { presetFromParam } = await import("./library-query");
    assert.deepEqual(presetFromParam("category:../../x"), { kind: "all" });
    assert.deepEqual(presetFromParam("archived"), { kind: "all" });
    assert.deepEqual(presetFromParam(null), { kind: "all" });
  });
});
