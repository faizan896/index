import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { slugify } from "@/lib/core/slug";

import { parseClassification } from "./parse";
import { resolveClassification } from "./resolve";
import type { Term } from "./taxonomy";

function terms(prefix: string, ...names: string[]): Term[] {
  return names.map((name, index) => ({ id: `${prefix}-${index + 1}`, name, slug: slugify(name) }));
}

const noCollections: Array<{ id: string; name: string }> = [];

describe("resolveClassification", () => {
  it("files the stablecoins example in a young library", () => {
    const raw = parseClassification(
      JSON.stringify({
        categories: ["Finance", "Payments"],
        tags: ["Stablecoins", "Cross-border Payments", "Financial Infrastructure"],
        collections: [],
      }),
    );
    assert.ok(raw);
    const outcome = resolveClassification(raw, {
      existingCategories: terms("cat", "Finance", "Design"),
      existingTags: [],
      collections: noCollections,
    });
    assert.deepEqual(outcome, {
      categories: [
        { name: "Finance", slug: "finance", existingId: "cat-1" },
        { name: "Payments", slug: "payments", existingId: null },
      ],
      tags: [
        { name: "Stablecoins", slug: "stablecoins", existingId: null },
        { name: "Cross-border Payments", slug: "cross-border-payments", existingId: null },
        { name: "Financial Infrastructure", slug: "financial-infrastructure", existingId: null },
      ],
      collectionIds: [],
    });
  });

  it("files the Porsche example, reusing near-identical names", () => {
    const raw = parseClassification({
      categories: ["Automotive", "Engineering"],
      tags: ["Porsche", "Engines", "Mechanical Design"],
      collections: [],
    });
    assert.ok(raw);
    const outcome = resolveClassification(raw, {
      existingCategories: terms("cat", "Cars", "Engineering", "Finance", "Design", "History", "Music", "Travel", "Food"),
      existingTags: terms("tag", "porsche", "Engine"),
      collections: noCollections,
    });
    assert.deepEqual(outcome.categories, [
      { name: "Cars", slug: "cars", existingId: "cat-1" },
      { name: "Engineering", slug: "engineering", existingId: "cat-2" },
    ]);
    assert.deepEqual(outcome.tags, [
      { name: "porsche", slug: "porsche", existingId: "tag-1" },
      { name: "Engine", slug: "engine", existingId: "tag-2" },
      { name: "Mechanical Design", slug: "mechanical-design", existingId: null },
    ]);
  });

  it("limits new categories in an established library", () => {
    const outcome = resolveClassification(
      { categories: ["Payments", "Cryptography", "Finance"], tags: [], collections: [] },
      {
        existingCategories: terms("cat", "Finance", "Design", "History", "Science", "Politics", "Music", "Travel", "Food"),
        existingTags: [],
        collections: noCollections,
      },
    );
    assert.deepEqual(
      outcome.categories.map((category) => [category.name, category.existingId]),
      [
        ["Payments", null],
        ["Finance", "cat-1"],
      ],
    );
  });

  it("drops tags that repeat a chosen category but keeps one naming a category that wasn't created", () => {
    const outcome = resolveClassification(
      {
        categories: ["Payments", "Cryptography", "General"],
        tags: ["Cryptography", "payment", "General", "Stablecoins"],
        collections: [],
      },
      {
        existingCategories: terms("cat", "Finance", "Design", "History", "Science", "Politics", "Music", "Travel", "Food"),
        existingTags: [],
        collections: noCollections,
      },
    );
    assert.deepEqual(
      outcome.categories.map((category) => category.name),
      ["Payments"],
    );
    assert.deepEqual(
      outcome.tags.map((tag) => tag.name),
      ["Cryptography", "Stablecoins"],
    );
  });

  it("suggests at most two collections by exact name, ignoring case", () => {
    const collections = [
      { id: "col-1", name: "Weekend Reading" },
      { id: "col-2", name: "Payments Research" },
      { id: "col-3", name: "Cars" },
    ];
    const outcome = resolveClassification(
      {
        categories: [],
        tags: [],
        collections: ["weekend  reading", "Payment Research", "PAYMENTS RESEARCH", "Weekend Reading", "Cars"],
      },
      { existingCategories: [], existingTags: [], collections },
    );
    assert.deepEqual(outcome.collectionIds, ["col-1", "col-2"]);
  });

  it("suggests nothing when no collection matches", () => {
    const outcome = resolveClassification(
      { categories: [], tags: [], collections: ["Reading List", ""] },
      { existingCategories: [], existingTags: [], collections: [{ id: "col-1", name: "Weekend Reading" }] },
    );
    assert.deepEqual(outcome, { categories: [], tags: [], collectionIds: [] });
  });
});
