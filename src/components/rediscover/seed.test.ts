import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { dailySeed, nextSeed, readSeed } from "./seed";

describe("readSeed", () => {
  it("accepts short URL-safe seeds", () => {
    assert.equal(readSeed("2026-10-16"), "2026-10-16");
    assert.equal(readSeed("k3x9a"), "k3x9a");
    assert.equal(readSeed("  abc  "), "abc");
  });

  it("takes the first of repeated params", () => {
    assert.equal(readSeed(["first", "second"]), "first");
  });

  it("ignores missing, empty and malformed seeds", () => {
    assert.equal(readSeed(undefined), null);
    assert.equal(readSeed([]), null);
    assert.equal(readSeed(""), null);
    assert.equal(readSeed("a b"), null);
    assert.equal(readSeed("<script>"), null);
    assert.equal(readSeed("x".repeat(65)), null);
  });
});

describe("dailySeed", () => {
  it("is the UTC date", () => {
    assert.equal(dailySeed(new Date("2026-10-16T23:59:59Z")), "2026-10-16");
    assert.equal(dailySeed(new Date("2026-10-17T00:00:00Z")), "2026-10-17");
  });
});

describe("nextSeed", () => {
  it("is deterministic", () => {
    assert.equal(nextSeed("2026-10-16"), nextSeed("2026-10-16"));
  });

  it("differs from its input and from the previous seeds", () => {
    const seen = new Set<string>();
    let seed = "2026-10-16";
    for (let step = 0; step < 200; step++) {
      seen.add(seed);
      seed = nextSeed(seed);
      assert.equal(seen.has(seed), false, `seed ${seed} repeated after ${step + 1} steps`);
    }
  });

  it("is always a valid seed", () => {
    let seed = "2026-10-16";
    for (let step = 0; step < 200; step++) {
      seed = nextSeed(seed);
      assert.equal(readSeed(seed), seed);
    }
  });

  it("changes when the input changes", () => {
    assert.notEqual(nextSeed("2026-10-16"), nextSeed("2026-10-17"));
  });
});
