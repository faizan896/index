import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isEmail, isReadingStatus, isUuid, optionalLine, optionalText, parseDateInput, safeNextPath } from "./validate";

describe("validate", () => {
  it("recognizes UUIDs and statuses", () => {
    assert.ok(isUuid("3f1c2b9e-8a7d-4c6b-9e5f-0a1b2c3d4e5f"));
    assert.ok(!isUuid("3f1c2b9e-8a7d-4c6b-9e5f-0a1b2c3d4e5"));
    assert.ok(!isUuid(42));
    assert.ok(!isUuid("'; drop table saved_links; --"));
    assert.ok(isReadingStatus("finished"));
    assert.ok(!isReadingStatus("archived"));
  });

  it("cleans optional single-line fields", () => {
    assert.equal(optionalLine(undefined, 10), undefined);
    assert.equal(optionalLine(5, 10), undefined);
    assert.equal(optionalLine("   ", 10), null);
    assert.equal(optionalLine("  A \n title\t", 50), "A title");
    assert.equal(optionalLine("abcdefghijkl", 5), "abcde");
    assert.equal(optionalLine("a\u0000b", 5), "ab");
  });

  it("keeps paragraphs in multi-line text", () => {
    assert.equal(optionalText("one\r\n\r\n\r\n\r\ntwo  \nthree", 100), "one\n\ntwo\nthree");
    assert.equal(optionalText("", 100), null);
  });

  it("parses date inputs strictly", () => {
    assert.equal(parseDateInput("2024-02-29"), "2024-02-29T00:00:00.000Z");
    assert.equal(parseDateInput(""), null);
    assert.equal(parseDateInput("2023-02-29"), "invalid");
    assert.equal(parseDateInput("29/02/2024"), "invalid");
    assert.equal(parseDateInput("0001-01-01"), "invalid");
  });

  it("only allows same-site next paths", () => {
    assert.equal(safeNextPath("/item/abc?x=1"), "/item/abc?x=1");
    assert.equal(safeNextPath("//evil.com"), "/");
    assert.equal(safeNextPath("/\\evil.com"), "/");
    assert.equal(safeNextPath("https://evil.com"), "/");
    assert.equal(safeNextPath("/login?next=/"), "/");
    assert.equal(safeNextPath("/auth/callback"), "/");
    assert.equal(safeNextPath(undefined, "/settings"), "/settings");
  });

  it("checks emails pragmatically", () => {
    assert.ok(isEmail("reader@example.com"));
    assert.ok(!isEmail("reader@example"));
    assert.ok(!isEmail("two words@example.com"));
  });
});
