import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  displaySource,
  displayTitle,
  formatAge,
  formatDate,
  formatMonthYear,
  formatReadingTime,
  formatRelativeDate,
  pluralize,
  toDateInputValue,
} from "./format";

const now = new Date("2026-06-15T12:00:00.000Z");

describe("dates", () => {
  it("formats absolute dates in UTC", () => {
    assert.equal(formatDate("2026-03-03T23:30:00.000Z"), "3 Mar 2026");
    assert.equal(formatMonthYear("2025-12-01T00:00:00.000Z"), "Dec 2025");
    assert.equal(formatDate(null), "");
    assert.equal(formatDate("not a date"), "");
  });

  it("formats relative dates quietly", () => {
    assert.equal(formatRelativeDate("2026-06-15T01:00:00.000Z", now), "Today");
    assert.equal(formatRelativeDate("2026-06-14T23:00:00.000Z", now), "Yesterday");
    assert.equal(formatRelativeDate("2026-06-11T12:00:00.000Z", now), "4 days ago");
    assert.equal(formatRelativeDate("2026-06-01T12:00:00.000Z", now), "2 weeks ago");
    assert.equal(formatRelativeDate("2026-03-01T12:00:00.000Z", now), "1 Mar 2026");
    assert.equal(formatRelativeDate("2026-07-01T12:00:00.000Z", now), "Today");
  });

  it("describes ages", () => {
    assert.equal(formatAge("2026-06-14T12:00:00.000Z", now), "1 day");
    assert.equal(formatAge("2025-04-15T12:00:00.000Z", now), "14 months");
    assert.equal(formatAge("2023-06-15T12:00:00.000Z", now), "3 years");
  });

  it("produces date input values", () => {
    assert.equal(toDateInputValue("2024-02-29T10:00:00.000Z"), "2024-02-29");
    assert.equal(toDateInputValue(null), "");
  });
});

describe("text", () => {
  it("formats reading time", () => {
    assert.equal(formatReadingTime(8), "8 min");
    assert.equal(formatReadingTime(60), "1 h");
    assert.equal(formatReadingTime(95), "1 h 35 min");
    assert.equal(formatReadingTime(null), "");
  });

  it("pluralizes with thousands separators", () => {
    assert.equal(pluralize(1, "category", "categories"), "1 category");
    assert.equal(pluralize(1248, "item"), "1,248 items");
  });

  it("falls back to the domain while a title is missing", () => {
    assert.equal(displayTitle({ title: null, domain: "example.com", url: "https://example.com/a" }), "example.com");
    assert.equal(displayTitle({ title: "  A title ", domain: "example.com", url: "" }), "A title");
    assert.equal(displaySource({ siteName: null, domain: "example.com" }), "example.com");
    assert.equal(displaySource({ siteName: "Stratechery", domain: "stratechery.com" }), "Stratechery");
  });
});
