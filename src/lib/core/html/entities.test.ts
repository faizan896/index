import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { decodeEntities } from "./entities";

describe("decodeEntities", () => {
  it("returns text without references unchanged", () => {
    assert.equal(decodeEntities(""), "");
    assert.equal(decodeEntities("Plain text, no references."), "Plain text, no references.");
    assert.equal(decodeEntities("AT&T and R&D"), "AT&T and R&D");
  });

  it("decodes the common named references", () => {
    const cases: Array<[string, string]> = [
      ["&amp;", "&"],
      ["&lt;&gt;", "<>"],
      ["&quot;&apos;", `"'`],
      ["&nbsp;", "\u00a0"],
      ["&ndash;&mdash;&hellip;", "–—…"],
      ["&lsquo;&rsquo;&ldquo;&rdquo;", "‘’“”"],
      ["&laquo;&raquo;&lsaquo;&rsaquo;", "«»‹›"],
      ["&copy;&reg;&trade;", "©®™"],
      ["&middot;&bull;&deg;&times;&divide;", "·•°×÷"],
      ["&eacute;&Eacute;&egrave;&uuml;&ntilde;&ccedil;&szlig;&oslash;&aring;", "éÉèüñçßøå"],
      ["&euro;&pound;&yen;&cent;", "€£¥¢"],
      ["&alpha;&beta;&Omega;&sigmaf;&sigma;", "αβΩςσ"],
      ["&rarr;&larr;&hearts;", "→←♥"],
    ];
    for (const [input, expected] of cases) assert.equal(decodeEntities(input), expected, input);
  });

  it("keeps the Latin-1 table aligned from &nbsp; to &yuml;", () => {
    assert.equal(decodeEntities("&nbsp;"), "\u00a0");
    assert.equal(decodeEntities("&iquest;"), "¿");
    assert.equal(decodeEntities("&Agrave;"), "À");
    assert.equal(decodeEntities("&times;"), "×");
    assert.equal(decodeEntities("&yuml;"), "ÿ");
  });

  it("decodes numeric references in decimal and hex", () => {
    assert.equal(decodeEntities("It&#8217;s"), "It’s");
    assert.equal(decodeEntities("It&#x2019;s"), "It’s");
    assert.equal(decodeEntities("&#X41;&#x6a;"), "Aj");
    assert.equal(decodeEntities("&#128512;"), "😀");
    assert.equal(decodeEntities("&#0000065;"), "A");
  });

  it("decodes numeric references without a semicolon, as browsers do", () => {
    assert.equal(decodeEntities("&#39hello"), "'hello");
    assert.equal(decodeEntities("&#x41 B"), "A B");
  });

  it("turns invalid code points into U+FFFD", () => {
    assert.equal(decodeEntities("&#0;"), "\ufffd");
    assert.equal(decodeEntities("&#xD800;"), "\ufffd");
    assert.equal(decodeEntities("&#xDFFF;"), "\ufffd");
    assert.equal(decodeEntities("&#x110000;"), "\ufffd");
    assert.equal(decodeEntities("&#99999999999999999999999999;"), "\ufffd");
    assert.equal(decodeEntities(`&#x${"f".repeat(500)};`), "\ufffd");
  });

  it("maps &#128;–&#159; to their windows-1252 characters", () => {
    assert.equal(decodeEntities("&#150;&#151;"), "–—");
    assert.equal(decodeEntities("&#145;&#146;&#147;&#148;"), "‘’“”");
    assert.equal(decodeEntities("&#128;"), "€");
  });

  it("leaves unknown or incomplete references as written", () => {
    assert.equal(decodeEntities("&bogus;"), "&bogus;");
    assert.equal(decodeEntities("&#;"), "&#;");
    assert.equal(decodeEntities("&#x;"), "&#x;");
    assert.equal(decodeEntities("& alone"), "& alone");
    assert.equal(decodeEntities("trailing &"), "trailing &");
    assert.equal(decodeEntities("&eacute"), "&eacute");
    assert.equal(decodeEntities("&AMP;"), "&");
    assert.equal(decodeEntities("&Amp;"), "&Amp;");
  });

  it("decodes legacy names without a semicolon only where browsers do", () => {
    assert.equal(decodeEntities("&copy 2024"), "© 2024");
    assert.equal(decodeEntities("Tom &amp Jerry"), "Tom & Jerry");
    assert.equal(decodeEntities("end &amp"), "end &");
    assert.equal(decodeEntities("?a=1&copy=2"), "?a=1&copy=2");
    assert.equal(decodeEntities("?a=1&ampfoo=2"), "?a=1&ampfoo=2");
  });

  it("decodes one level only", () => {
    assert.equal(decodeEntities("&amp;amp;"), "&amp;");
    assert.equal(decodeEntities("&amp;#8217;"), "&#8217;");
    assert.equal(decodeEntities("&amp;&amp;"), "&&");
  });

  it("never throws", () => {
    assert.equal(decodeEntities(undefined as unknown as string), "");
    assert.equal(decodeEntities(42 as unknown as string), "");
    const noisy = "&#".repeat(10_000) + "&x".repeat(10_000) + "&".repeat(10_000);
    assert.equal(typeof decodeEntities(noisy), "string");
  });

  it("is fast on dense input", () => {
    const text = "Tom &amp; Jerry&#8217;s &ldquo;show&rdquo; ".repeat(20_000);
    const started = performance.now();
    const decoded = decodeEntities(text);
    assert.ok(performance.now() - started < 200);
    assert.ok(decoded.startsWith("Tom & Jerry’s “show” Tom"));
  });
});
