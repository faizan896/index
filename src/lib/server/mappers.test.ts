import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { mapLinkDetail, mapListRow, mapRediscover, mapStats, mapTermList } from "./mappers";
import type { ListLinksRow } from "./database.types";

const row: ListLinksRow = {
  id: "9907648f-e8e9-4825-916a-1e91162a5823",
  url: "https://example.com/a",
  domain: "example.com",
  title: "Stablecoins and global payments",
  description: null,
  author: null,
  site_name: "Example",
  published_at: null,
  reading_minutes: 7,
  status: "reading",
  is_favorite: true,
  created_at: "2026-10-16T05:38:27.909225+00:00",
  metadata_status: "done",
  classification_status: "done",
  categories: [{ id: "c1", name: "Finance", slug: "finance" }, { bogus: true }],
  tags: null,
  rank: 0,
  total_count: 1,
};

describe("mappers", () => {
  it("maps list rows to camelCase items and drops malformed terms", () => {
    const item = mapListRow(row);
    assert.equal(item.siteName, "Example");
    assert.equal(item.isFavorite, true);
    assert.equal(item.status, "reading");
    assert.deepEqual(item.categories, [{ id: "c1", name: "Finance", slug: "finance" }]);
    assert.deepEqual(item.tags, []);
  });

  it("falls back safely on unknown enum values", () => {
    const item = mapListRow({ ...row, status: "weird" as never, metadata_status: "nope" as never });
    assert.equal(item.status, "unread");
    assert.equal(item.metadataStatus, "pending");
  });

  it("maps stats, coercing bigint strings", () => {
    assert.deepEqual(mapStats({ total: "248", unread: 36, categories: 18 }), {
      total: 248,
      unread: 36,
      reading: 0,
      finished: 0,
      favorites: 0,
      unsorted: 0,
      pending: 0,
      categories: 18,
      collections: 0,
    });
    assert.equal(mapStats(null).total, 0);
  });

  it("maps link_detail JSON", () => {
    const detail = mapLinkDetail({
      link: {
        id: row.id,
        url: row.url,
        domain: row.domain,
        created_at: row.created_at,
        updated_at: row.created_at,
        title: "T",
        is_favorite: false,
        status: "finished",
        metadata_status: "failed",
        metadata_error: "The page couldn't be found.",
        classification_status: "skipped",
        word_count: 1800,
      },
      categories: [{ id: "c1", name: "Finance", slug: "finance" }],
      tags: [],
      notes: [{ id: "n1", link_id: row.id, body: "a note", created_at: row.created_at, updated_at: row.created_at }],
      collections: [],
      suggested_collections: [{ id: "k1", name: "Money" }],
    });
    assert.ok(detail);
    assert.equal(detail.status, "finished");
    assert.equal(detail.metadataError, "The page couldn't be found.");
    assert.equal(detail.wordCount, 1800);
    assert.equal(detail.notes[0]?.body, "a note");
    assert.deepEqual(detail.suggestedCollections, [{ id: "k1", name: "Money" }]);
  });

  it("returns null for missing or malformed detail", () => {
    assert.equal(mapLinkDetail(null), null);
    assert.equal(mapLinkDetail({ link: { id: "x" } }), null);
  });

  it("ignores unknown rediscover kinds", () => {
    const base = {
      id: row.id,
      url: row.url,
      domain: row.domain,
      title: null,
      description: null,
      author: null,
      site_name: null,
      reading_minutes: null,
      status: "unread" as const,
      is_favorite: false,
      created_at: row.created_at,
    };
    assert.equal(mapRediscover({ ...base, kind: "forgotten" })?.kind, "forgotten");
    assert.equal(mapRediscover({ ...base, kind: "other" }), null);
  });

  it("maps term lists defensively", () => {
    assert.deepEqual(mapTermList("not an array"), []);
  });
});
