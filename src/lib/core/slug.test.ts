import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { slugify } from "./slug";

describe("slugify", () => {
  it("produces lowercase hyphenated keys", () => {
    assert.equal(slugify("Venture Capital"), "venture-capital");
    assert.equal(slugify("  Artificial   Intelligence "), "artificial-intelligence");
    assert.equal(slugify("R&D"), "r-and-d");
    assert.equal(slugify("C++"), "c-plus-plus");
    assert.equal(slugify("C#"), "c-sharp");
    assert.equal(slugify("Café Culture"), "cafe-culture");
    assert.equal(slugify("Web3 / DeFi"), "web3-defi");
  });

  it("matches the database's slug format", () => {
    const pattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    for (const name of ["Finance", "AI & ML", "建築", "日本の時計", "—", "a".repeat(200), "Über-Design!!"]) {
      const slug = slugify(name);
      if (slug) assert.match(slug, pattern, name);
      assert.ok(slug.length <= 80, name);
    }
  });

  it("gives non-Latin names a stable key", () => {
    assert.equal(slugify("建築"), slugify("建築"));
    assert.notEqual(slugify("建築"), slugify("時計"));
    assert.match(slugify("建築"), /^u-/);
  });

  it("returns an empty string when there is nothing to key on", () => {
    assert.equal(slugify("   "), "");
  });
});
