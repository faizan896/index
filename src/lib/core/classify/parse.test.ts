import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseClassification } from "./parse";

const valid = {
  categories: ["Finance", "Payments"],
  tags: ["Stablecoins", "Cross-border Payments", "Financial Infrastructure"],
  collections: [],
};

describe("parseClassification", () => {
  it("accepts a parsed object", () => {
    assert.deepEqual(parseClassification(valid), valid);
  });

  it("accepts JSON text", () => {
    assert.deepEqual(parseClassification(JSON.stringify(valid)), valid);
    assert.deepEqual(parseClassification(`  ${JSON.stringify(valid, null, 2)}\n`), valid);
  });

  it("accepts a fenced json block", () => {
    assert.deepEqual(parseClassification("```json\n" + JSON.stringify(valid) + "\n```"), valid);
    assert.deepEqual(parseClassification("```\n" + JSON.stringify(valid) + "\n```"), valid);
    assert.deepEqual(parseClassification("Here you go:\n```json\n" + JSON.stringify(valid) + "\n```\nDone."), valid);
  });

  it("accepts an object with prose around it", () => {
    assert.deepEqual(parseClassification(`Sure. ${JSON.stringify(valid)} Hope that helps.`), valid);
  });

  it("accepts JSON encoded twice", () => {
    assert.deepEqual(parseClassification(JSON.stringify(JSON.stringify(valid))), valid);
  });

  it("treats empty lists as a valid answer", () => {
    assert.deepEqual(parseClassification({ categories: [], tags: [], collections: [] }), {
      categories: [],
      tags: [],
      collections: [],
    });
  });

  it("fills in missing lists", () => {
    assert.deepEqual(parseClassification({ categories: ["Finance"] }), {
      categories: ["Finance"],
      tags: [],
      collections: [],
    });
    assert.deepEqual(parseClassification({ tags: ["Porsche"], collections: null }), {
      categories: [],
      tags: ["Porsche"],
      collections: [],
    });
  });

  it("coerces items to trimmed, distinct strings", () => {
    assert.deepEqual(
      parseClassification({
        categories: [" Finance ", "Finance", "", "   ", null, 42, { name: "Payments" }, { label: "x" }, true, ["nested"]],
        tags: "Stablecoins, Payments; Infrastructure",
        collections: ["Weekend Reading"],
      }),
      {
        categories: ["Finance", "42", "Payments"],
        tags: ["Stablecoins", "Payments", "Infrastructure"],
        collections: ["Weekend Reading"],
      },
    );
  });

  it("caps oversize lists and items", () => {
    const many = Array.from({ length: 50 }, (_, index) => `Item ${index}`);
    const parsed = parseClassification({ categories: many, tags: many, collections: many });
    assert.ok(parsed);
    assert.equal(parsed.categories.length, 8);
    assert.equal(parsed.tags.length, 16);
    assert.equal(parsed.collections.length, 4);
    assert.deepEqual(parsed.categories.slice(0, 2), ["Item 0", "Item 1"]);

    const long = parseClassification({ categories: ["x".repeat(101), "Finance"], tags: [] });
    assert.deepEqual(long?.categories, ["Finance"]);
  });

  it("ignores a malformed collections list", () => {
    assert.deepEqual(parseClassification({ categories: ["Finance"], tags: [], collections: 7 })?.collections, []);
  });

  it("rejects wrong types", () => {
    assert.equal(parseClassification({ categories: 5, tags: [] }), null);
    assert.equal(parseClassification({ categories: ["Finance"], tags: { a: 1 } }), null);
    assert.equal(parseClassification({ categories: true, tags: [] }), null);
  });

  it("rejects things that aren't a classification", () => {
    for (const raw of [
      null,
      undefined,
      42,
      true,
      [],
      ["Finance"],
      {},
      { categories: null, tags: null },
      { answer: "Finance" },
      "",
      "   ",
      "Finance, Payments",
      "{not json",
      "```json\n{oops\n```",
      '"just a string"',
      "x".repeat(60_000),
    ]) {
      assert.equal(parseClassification(raw), null, JSON.stringify(raw)?.slice(0, 40));
    }
  });
});
