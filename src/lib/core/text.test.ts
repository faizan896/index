import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { cleanText, countWords } from "./text";

describe("cleanText", () => {
  it("returns null for nothing at all", () => {
    assert.equal(cleanText(null), null);
    assert.equal(cleanText(undefined), null);
    assert.equal(cleanText(""), null);
    assert.equal(cleanText(" \n\t "), null);
    assert.equal(cleanText("&nbsp;&#8203;"), null);
    assert.equal(cleanText("<p> </p><br>"), null);
  });

  it("collapses whitespace and trims", () => {
    assert.equal(cleanText("  Hello \n\n  world\t!  "), "Hello world !");
    assert.equal(cleanText("a\u00a0b\u3000c\u2028d"), "a b c d");
  });

  it("strips markup, keeping words inside a line together", () => {
    assert.equal(cleanText("<p>Hello <b>world</b></p>"), "Hello world");
    assert.equal(cleanText("an un<em>usual</em> word"), "an unusual word");
    assert.equal(cleanText("<p>one</p><p>two</p>"), "one two");
    assert.equal(cleanText('<img src="x.png" alt="">caption'), "caption");
    assert.equal(cleanText("before<!-- hidden -->after"), "before after");
    assert.equal(cleanText("kept <!-- never closed"), "kept");
  });

  it("leaves angle brackets that are not markup", () => {
    assert.equal(cleanText("a < b and c > d"), "a < b and c > d");
    assert.equal(cleanText("I <3 this"), "I <3 this");
  });

  it("decodes entities, including double-encoded ones", () => {
    assert.equal(cleanText("Tom &amp; Jerry&#8217;s"), "Tom & Jerry’s");
    assert.equal(cleanText("It&amp;#8217;s here &amp;mdash; now"), "It’s here — now");
  });

  it("removes markup that only appears once entities are decoded", () => {
    assert.equal(cleanText("&lt;p&gt;Hello &lt;strong&gt;there&lt;/strong&gt;&lt;/p&gt;"), "Hello there");
    assert.equal(cleanText("Using the &lt;dialog&gt; element"), "Using the <dialog> element");
  });

  it("removes control and invisible characters", () => {
    assert.equal(cleanText("A\u0000B\u0007C\u200bD\u00adE\ufeffF\u202eG"), "ABCDEFG");
    assert.equal(cleanText("👩\u200d💻 coder"), "👩\u200d💻 coder");
  });

  it("replaces lone surrogates instead of passing them on", () => {
    assert.equal(cleanText("bad \ud800 pair"), "bad \ufffd pair");
  });

  it("truncates at a word boundary with an ellipsis", () => {
    const text = "The quick brown fox jumps over the lazy dog";
    assert.equal(cleanText(text, 20), "The quick brown fox…");
    assert.equal(cleanText(text, 19), "The quick brown…");
    assert.equal(cleanText(text, text.length), text);
    for (let max = 2; max <= text.length; max++) {
      const result = cleanText(text, max) ?? "";
      assert.ok(result.length <= max, `${max}: ${result}`);
    }
  });

  it("drops punctuation left dangling before the ellipsis", () => {
    assert.equal(cleanText("First part, second part, third part", 25), "First part, second part…");
    assert.equal(cleanText("Alpha — beta gamma", 9), "Alpha…");
  });

  it("cuts text without spaces mid-word, but never inside a surrogate pair", () => {
    assert.equal(cleanText("東京の小さな本屋が守り続けるもの", 8), "東京の小さな本…");
    assert.equal(cleanText("😀😀😀😀", 4), "😀…");
    assert.equal(cleanText("abcdef", 1), "a");
  });

  it("ignores a meaningless maximum", () => {
    assert.equal(cleanText("some text", 0), "some text");
    assert.equal(cleanText("some text", Number.NaN), "some text");
  });

  it("never throws", () => {
    assert.equal(cleanText(42 as unknown as string), null);
    const hostile = "<a".repeat(5000) + "<!--".repeat(5000) + "&lt;p ".repeat(5000);
    assert.equal(typeof cleanText(hostile, 100), "string");
  });
});

describe("countWords", () => {
  it("counts space-separated words", () => {
    assert.deepEqual(countWords(""), { words: 0, cjk: 0 });
    assert.deepEqual(countWords("Hello, world!"), { words: 2, cjk: 0 });
    assert.deepEqual(countWords("  one\ttwo\nthree  "), { words: 3, cjk: 0 });
    assert.deepEqual(countWords("In 2024, 3 things"), { words: 4, cjk: 0 });
  });

  it("treats joined punctuation as part of a word and lone punctuation as nothing", () => {
    assert.deepEqual(countWords("state-of-the-art don't o’clock"), { words: 3, cjk: 0 });
    assert.deepEqual(countWords("a — b … c"), { words: 3, cjk: 0 });
    assert.deepEqual(countWords("🚀 · ★ ¶"), { words: 0, cjk: 0 });
  });

  it("counts words in other scripts that use spaces", () => {
    assert.deepEqual(countWords("Привет мир"), { words: 2, cjk: 0 });
    assert.deepEqual(countWords("café naïve Ελλάδα"), { words: 3, cjk: 0 });
    assert.deepEqual(countWords("안녕하세요 세계"), { words: 2, cjk: 0 });
    assert.deepEqual(countWords("مرحبا بالعالم"), { words: 2, cjk: 0 });
  });

  it("counts Chinese and Japanese characters one by one", () => {
    assert.deepEqual(countWords("東京の本屋"), { words: 0, cjk: 5 });
    assert.deepEqual(countWords("「本屋」です。"), { words: 0, cjk: 4 });
    assert.deepEqual(countWords("AIの技術 2024年"), { words: 2, cjk: 4 });
    assert.deepEqual(countWords("ＧＰＴ４"), { words: 1, cjk: 0 });
  });

  it("never throws", () => {
    assert.deepEqual(countWords(undefined as unknown as string), { words: 0, cjk: 0 });
  });
});
