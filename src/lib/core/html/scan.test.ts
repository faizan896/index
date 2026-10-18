import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { elementRanges, scanHtml, visibleText, type HtmlScan } from "./scan";

/** Start tag names in order. */
const names = (scan: HtmlScan) => scan.tags.map((tag) => tag.name);

/** Every token as a compact string, for asserting structure. */
function shape(scan: HtmlScan): string[] {
  return scan.tokens.map((token) => {
    if (token.type === "open") return `<${token.tag.name}${token.selfClosing ? "/" : ""}>`;
    if (token.type === "close") return `</${token.name}>`;
    return `"${scan.html.slice(token.start, token.end)}"`;
  });
}

describe("scanHtml: tags and attributes", () => {
  it("lowercases tag and attribute names and records offsets", () => {
    const html = '<DIV Class="Intro" ID=main>Hi</DIV>';
    const scan = scanHtml(html);
    const [div] = scan.tags;
    assert.ok(div);
    assert.equal(div.name, "div");
    assert.deepEqual({ ...div.attrs }, { class: "Intro", id: "main" });
    assert.equal(html.slice(div.start, div.end), '<DIV Class="Intro" ID=main>');
    assert.deepEqual(shape(scan), ["<div>", '"Hi"', "</div>"]);
  });

  it("reads quoted, unquoted and valueless attributes", () => {
    const scan = scanHtml(`<input type=checkbox checked value = 'a b' data-x="1"  disabled>`);
    assert.deepEqual({ ...scan.tags[0]?.attrs }, { type: "checkbox", checked: "", value: "a b", "data-x": "1", disabled: "" });
  });

  it("does not end a tag at a > inside quotes", () => {
    const scan = scanHtml(`<meta content="a > b" name='x>y'><p>after</p>`);
    assert.deepEqual({ ...scan.tags[0]?.attrs }, { content: "a > b", name: "x>y" });
    assert.deepEqual(names(scan), ["meta", "p"]);
  });

  it("keeps the first of duplicate attributes and decodes values", () => {
    const scan = scanHtml(`<a href="/a?x=1&amp;y=2" href="/b" title="Tom &amp; Jerry&#8217;s">x</a>`);
    assert.deepEqual({ ...scan.tags[0]?.attrs }, { href: "/a?x=1&y=2", title: "Tom & Jerry’s" });
  });

  it("notes self-closing tags", () => {
    const scan = scanHtml(`<br/><img src="a.png" /><hr>`);
    assert.deepEqual(shape(scan), ["<br/>", "<img/>", "<hr>"]);
  });

  it("is not confused by attribute names that collide with object properties", () => {
    const attrs = scanHtml(`<div constructor="x" __proto__="y" toString>`).tags[0]?.attrs ?? {};
    assert.deepEqual(Object.keys(attrs), ["constructor", "__proto__", "tostring"]);
    assert.equal(attrs.constructor, "x");
    assert.equal(attrs["__proto__"], "y");
    assert.equal(scanHtml("<div>").tags[0]?.attrs.constructor, undefined);
    assert.equal(scanHtml("<div id=a>").tags[0]?.attrs.toString, undefined);
  });

  it("drops a tag the input ends inside, as browsers do", () => {
    assert.deepEqual(shape(scanHtml(`<p>hello<a href="x`)), ["<p>", '"hello"']);
    assert.deepEqual(shape(scanHtml(`<p>hello</p`)), ["<p>", '"hello"']);
  });
});

describe("scanHtml: things that are not tags", () => {
  it("skips comments, the doctype, processing instructions and CDATA", () => {
    const scan = scanHtml(`<!DOCTYPE html><?xml version="1.0"?><!-- <p>no</p> --><p>a<![CDATA[ <b>no</b> ]]>b</p><!---->`);
    assert.deepEqual(shape(scan), ["<p>", '"a"', '"b"', "</p>"]);
  });

  it("handles the odd empty comments", () => {
    assert.deepEqual(shape(scanHtml("a<!-->b<!--->c")), ['"a"', '"b"', '"c"']);
  });

  it("lets an unclosed comment run to the end", () => {
    assert.deepEqual(shape(scanHtml("<p>kept</p><!-- <p>gone</p>")), ["<p>", '"kept"', "</p>"]);
  });

  it("treats a < that starts no tag as text", () => {
    assert.deepEqual(shape(scanHtml("<p>a < b <3 c</p>")), ["<p>", '"a < b <3 c"', "</p>"]);
    assert.deepEqual(shape(scanHtml("x </ y> z </> w")), ['"x "', '" z "', '" w"']);
  });
});

describe("scanHtml: raw-text elements", () => {
  it("does not read script content as markup", () => {
    const scan = scanHtml(`<script>if (a < b) document.write("<div>" + '</p>');</script><p>x</p>`);
    assert.deepEqual(names(scan), ["script", "p"]);
    const open = scan.tokens[0];
    assert.ok(open?.type === "open");
    assert.equal(open.content, `if (a < b) document.write("<div>" + '</p>');`);
  });

  it("matches the end tag case-insensitively, with spaces before >", () => {
    const scan = scanHtml(`<SCRIPT>x = "</scripts>";</Script ><b>y</b>`);
    assert.deepEqual(names(scan), ["script", "b"]);
  });

  it("lets an unclosed raw-text element take the rest of the document", () => {
    const scan = scanHtml(`<p>a</p><script>var x = "<p>b</p>";`);
    assert.deepEqual(names(scan), ["p", "script"]);
  });

  it("ignores the self-closing slash on raw-text elements, like browsers", () => {
    const scan = scanHtml(`<script src="a.js" /></script><p>x</p>`);
    assert.deepEqual(names(scan), ["script", "p"]);
  });

  it("covers style, textarea, noscript, template and title", () => {
    const scan = scanHtml(
      `<style>a > b { content: "<i>" }</style><textarea><b>t</b></textarea><noscript><img src=x></noscript><template><div>t</div></template><title><b>T</b></title>`,
    );
    assert.deepEqual(names(scan), ["style", "textarea", "noscript", "template", "title"]);
  });
});

describe("scanHtml: title and JSON-LD", () => {
  it("reads the first title, decoded and untrimmed", () => {
    assert.equal(scanHtml("<TITLE> Tom &amp; Jerry </TITLE><title>Second</title>").title, " Tom & Jerry ");
    assert.equal(scanHtml("<p>No title here</p>").title, null);
  });

  it("ignores <title> inside SVG", () => {
    const scan = scanHtml(`<body><svg><title>Icon</title><path d="M0 0"/></svg><title>Page</title></body>`);
    assert.equal(scan.title, "Page");
    assert.equal(scanHtml(`<svg><title>Icon</title></svg>`).title, null);
  });

  it("collects every JSON-LD block, raw", () => {
    const scan = scanHtml(
      `<script type="application/ld+json">{"a":1}</script>` +
        `<script type=" APPLICATION/LD+JSON; charset=utf-8">{"b":"&amp;"}</script>` +
        `<script type="application/json">{"c":3}</script><script>{"d":4}</script>`,
    );
    assert.deepEqual(scan.jsonLd, ['{"a":1}', '{"b":"&amp;"}']);
  });
});

describe("scanHtml: SVG and MathML", () => {
  it("honours self-closing tags in foreign content", () => {
    const scan = scanHtml(`<svg/><title>Page</title>`);
    assert.equal(scan.title, "Page");
  });

  it("closes unclosed SVG when an HTML element appears", () => {
    const scan = scanHtml(`<svg><path d="M0"><p>Text</p><title>Page</title>`);
    assert.deepEqual(shape(scan), ["<svg>", "<path>", "</svg>", "<p>", '"Text"', "</p>", "<title>", "</title>"]);
    assert.equal(scan.title, "Page");
  });
});

describe("elementRanges", () => {
  it("returns the outermost elements of a name", () => {
    const scan = scanHtml(`<article>a<article>b</article>c</article><p>x</p><article>d</article>`);
    const ranges = elementRanges(scan, "article");
    assert.equal(ranges.length, 2);
    assert.deepEqual(
      ranges.map((range) => visibleText(scan, range.open + 1, range.close)),
      ["a b c", "d"],
    );
  });

  it("runs an unclosed element to the end", () => {
    const scan = scanHtml(`<main><p>a</p>`);
    assert.deepEqual(elementRanges(scan, "main"), [{ open: 0, close: scan.tokens.length }]);
  });

  it("finds nothing when there is nothing", () => {
    assert.deepEqual(elementRanges(scanHtml("<p>x</p>"), "article"), []);
  });
});

describe("visibleText", () => {
  it("keeps words in a line together and separates blocks", () => {
    const scan = scanHtml(`<p>un<em>usual</em> <a href="#">link</a></p><p>next</p><div>block</div>text<br>more`);
    assert.equal(visibleText(scan), "unusual link next block text more");
  });

  it("decodes entities and collapses whitespace", () => {
    const scan = scanHtml(`<p>Tom&nbsp;&amp;\n\n   Jerry&#8217;s</p>`);
    assert.equal(visibleText(scan), "Tom & Jerry’s");
  });

  it("leaves out page furniture and raw text", () => {
    const scan = scanHtml(
      `<header>Site</header><nav>Menu</nav><p>Body</p><aside>Related</aside><form>Email <button>Go</button></form>` +
        `<select><option>One</option></select><svg><text>Chart</text></svg><script>code()</script><style>p{}</style>` +
        `<noscript>Enable JS</noscript><template>Hidden</template><footer>Copyright</footer><p>End</p>`,
    );
    assert.equal(visibleText(scan), "Body End");
  });

  it("handles nested hidden elements of the same name", () => {
    const scan = scanHtml(`<aside>a<aside>b</aside>c</aside>visible`);
    assert.equal(visibleText(scan), "visible");
  });

  it("reads only the requested token range", () => {
    const scan = scanHtml(`<p>one</p><p>two</p><p>three</p>`);
    assert.equal(visibleText(scan, 3, 6), "two");
    assert.equal(visibleText(scan, -5, 1000), "one two three");
  });
});

describe("scanHtml: robustness", () => {
  it("accepts anything without throwing", () => {
    const pieces = ["<", ">", "/", "!", "-", "--", "?", "=", '"', "'", " ", "a", "p", "script", "svg", "title", "&", "#", ";", "]]>", "<![CDATA[", "\n", "é", "\ud800"];
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let round = 0; round < 500; round++) {
      let html = "";
      const length = Math.floor(random() * 80);
      for (let index = 0; index < length; index++) html += pieces[Math.floor(random() * pieces.length)];
      const scan = scanHtml(html);
      for (const token of scan.tokens) {
        const start = token.type === "open" ? token.tag.start : token.start;
        const end = token.type === "open" ? token.tag.end : token.end;
        assert.ok(start >= 0 && end <= html.length && start <= end, html);
      }
      assert.equal(typeof visibleText(scan), "string");
    }
  });

  it("returns an empty scan for non-strings", () => {
    const scan = scanHtml(undefined as unknown as string);
    assert.deepEqual([scan.tokens.length, scan.tags.length, scan.title, scan.jsonLd.length], [0, 0, null, 0]);
  });

  it("stays linear on deeply nested markup", () => {
    const html = "<div>".repeat(200_000);
    const started = performance.now();
    const scan = scanHtml(html);
    assert.equal(scan.tags.length, 200_000);
    assert.ok(performance.now() - started < 1000);
  });
});
