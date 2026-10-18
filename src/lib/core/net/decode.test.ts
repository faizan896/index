import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { charsetFromContentType, decodeHtml, sniffHtmlCharset } from "./decode";

const ascii = (text: string) => new Uint8Array(Buffer.from(text, "latin1"));
const utf8 = (text: string) => new Uint8Array(Buffer.from(text, "utf8"));

/** windows-1252 bytes for the few non-ASCII characters these tests use. */
function cp1252(text: string): Uint8Array {
  const high: Record<string, number> = { "“": 0x93, "”": 0x94, "‘": 0x91, "’": 0x92, "—": 0x97, "€": 0x80, é: 0xe9 };
  return new Uint8Array([...text].map((char) => high[char] ?? char.charCodeAt(0)));
}

describe("charsetFromContentType", () => {
  it("reads the charset parameter", () => {
    const cases: Array<[string | null, string | null]> = [
      [null, null],
      ["", null],
      ["text/html", null],
      ["text/html;", null],
      ["text/html; charset=", null],
      ["text/html; charset=UTF-8", "utf-8"],
      ["text/html;charset=ISO-8859-1", "iso-8859-1"],
      ["TEXT/HTML; CHARSET = Windows-1252", "windows-1252"],
      ['text/html; charset="windows-1252"', "windows-1252"],
      ["text/html; charset='Shift_JIS'", "shift_jis"],
      ["text/html; charset=utf-8; foo=bar", "utf-8"],
      ["text/html; foo=bar; charset=euc-kr", "euc-kr"],
      ["text/html; charset=  utf-8  ", "utf-8"],
      ['text/html; charset=" utf-8 "', "utf-8"],
      ["text/html; xcharset=utf-8", null],
      ["charset=koi8-r", "koi8-r"],
      ["text/html; charset=made-up-encoding", "made-up-encoding"],
    ];
    for (const [input, expected] of cases) {
      assert.equal(charsetFromContentType(input), expected, `charsetFromContentType(${JSON.stringify(input)})`);
    }
  });
});

describe("sniffHtmlCharset", () => {
  it("recognises byte order marks", () => {
    assert.equal(sniffHtmlCharset(new Uint8Array([0xef, 0xbb, 0xbf, 0x3c])), "utf-8");
    assert.equal(sniffHtmlCharset(new Uint8Array([0xfe, 0xff, 0x00, 0x3c])), "utf-16be");
    assert.equal(sniffHtmlCharset(new Uint8Array([0xff, 0xfe, 0x3c, 0x00])), "utf-16le");
    assert.equal(sniffHtmlCharset(new Uint8Array([0xef, 0xbb])), null);
  });

  it("reads <meta charset> and <meta http-equiv>", () => {
    const cases: Array<[string, string | null]> = [
      ['<meta charset="windows-1252">', "windows-1252"],
      ["<meta charset=windows-1252>", "windows-1252"],
      ["<META CHARSET='Shift_JIS'>", "shift_jis"],
      ['<meta charset="  UTF-8  ">', "utf-8"],
      ['<meta charset="iso-8859-1">', "windows-1252"],
      ['<meta charset="latin1">', "windows-1252"],
      ['<meta charset="ascii">', "windows-1252"],
      ['<meta charset="utf8">', "utf-8"],
      ["<meta/charset=gbk>", "gbk"],
      ['<meta name="viewport" content="width=device-width" charset="koi8-r" />', "koi8-r"],
      ['<meta http-equiv="Content-Type" content="text/html; charset=euc-kr">', "euc-kr"],
      ["<meta http-equiv=content-type content='text/html;charset=big5'>", "big5"],
      ['<meta content="text/html; charset=koi8-r" http-equiv="content-type">', "koi8-r"],
      ['<meta http-equiv="Content-Type" content="text/html; charset=\'gb18030\'">', "gb18030"],
      ['<!doctype html>\n<html lang="en">\n<head>\n  <title>x</title>\n  <meta charset="windows-1250">', "windows-1250"],
    ];
    for (const [html, expected] of cases) {
      assert.equal(sniffHtmlCharset(ascii(html)), expected, html);
    }
  });

  it("ignores declarations that don't count", () => {
    const cases: Array<[string, string | null]> = [
      ["", null],
      ["<!doctype html><html><head><title>No charset</title></head></html>", null],
      ['<meta http-equiv="refresh" content="0; charset=gbk">', null],
      ['<meta name="description" content="charset=gbk">', null],
      ['<meta content="text/html; charset=gbk">', null],
      ['<metadata charset="gbk">', null],
      ['<meta charset="">', null],
      ['<meta charset="bogus">', null],
      ['<!-- <meta charset="gbk"> -->', null],
      ['<!-- unterminated <meta charset="gbk">', null],
      ['<p>Use <code>charset="gbk"</code></p>', null],
    ];
    for (const [html, expected] of cases) {
      assert.equal(sniffHtmlCharset(ascii(html)), expected, html);
    }
  });

  it("follows the browser rules for the first usable declaration", () => {
    assert.equal(sniffHtmlCharset(ascii('<!-- <meta charset="gbk"> --><meta charset="big5">')), "big5");
    assert.equal(sniffHtmlCharset(ascii('<meta charset="bogus"><meta charset="koi8-r">')), "koi8-r");
    assert.equal(sniffHtmlCharset(ascii('<meta charset="euc-kr"><meta charset="big5">')), "euc-kr");
    // A page readable as ASCII can't really be UTF-16.
    assert.equal(sniffHtmlCharset(ascii('<meta charset="utf-16">')), "utf-8");
    assert.equal(sniffHtmlCharset(ascii('<meta charset="utf-16be">')), "utf-8");
    assert.equal(sniffHtmlCharset(ascii('<meta charset="x-user-defined">')), "windows-1252");
  });

  it("only looks at the first 4 KB", () => {
    const filler = `<html><head><!-- ${"x".repeat(5000)} -->`;
    assert.equal(sniffHtmlCharset(ascii(`${"<p></p>".repeat(600)}<meta charset="gbk">`)), null);
    assert.equal(sniffHtmlCharset(ascii(`${filler}<meta charset="gbk">`)), null);
    assert.equal(sniffHtmlCharset(ascii(`${"<p></p>".repeat(500)}<meta charset="gbk">`)), "gbk");
  });
});

describe("decodeHtml", () => {
  it("defaults to UTF-8", () => {
    assert.equal(decodeHtml(utf8("<p>Café — “quoted” 日本語</p>"), null), "<p>Café — “quoted” 日本語</p>");
    assert.equal(decodeHtml(utf8("<p>Café</p>"), "text/html"), "<p>Café</p>");
    assert.equal(decodeHtml(new Uint8Array(), null), "");
  });

  it("uses the charset from the Content-Type header", () => {
    const bytes = cp1252("<title>“Quoted” café — ‘single’ €5</title>");
    assert.equal(decodeHtml(bytes, "text/html; charset=windows-1252"), "<title>“Quoted” café — ‘single’ €5</title>");
    // Browsers read ISO-8859-1 and ASCII labels as windows-1252.
    assert.equal(decodeHtml(bytes, "text/html; charset=ISO-8859-1"), "<title>“Quoted” café — ‘single’ €5</title>");
    assert.equal(decodeHtml(bytes, "text/html; charset=us-ascii"), "<title>“Quoted” café — ‘single’ €5</title>");
    assert.equal(decodeHtml(new Uint8Array([0x93, 0xfa, 0x96, 0x7b]), "text/html; charset=Shift_JIS"), "日本");
    assert.equal(decodeHtml(new Uint8Array([0xc7, 0xd1, 0xb1, 0xdb]), "text/html; charset=euc-kr"), "한글");
  });

  it("uses a <meta> declaration when the header has none", () => {
    const page = '<html><head><meta charset="windows-1252"><title>“Quoted” café</title></head></html>';
    assert.equal(decodeHtml(cp1252(page), "text/html"), page);
    assert.equal(decodeHtml(cp1252(page), null), page);
    const legacy = '<meta http-equiv="Content-Type" content="text/html; charset=windows-1252"><p>It’s here</p>';
    assert.equal(decodeHtml(cp1252(legacy), "text/html"), legacy);
  });

  it("prefers the header charset to the <meta> declaration", () => {
    const page = '<meta charset="windows-1252"><p>Café</p>';
    assert.equal(decodeHtml(utf8(page), "text/html; charset=utf-8"), page);
  });

  it("lets a byte order mark win, and strips it", () => {
    const bom = [0xef, 0xbb, 0xbf];
    assert.equal(decodeHtml(new Uint8Array([...bom, ...utf8("<p>Café</p>")]), "text/html; charset=iso-8859-1"), "<p>Café</p>");
    const utf16le = new Uint8Array(Buffer.from("\ufeff<p>Café 日本</p>", "utf16le"));
    assert.equal(decodeHtml(utf16le, "text/html"), "<p>Café 日本</p>");
    const utf16be = new Uint8Array(Buffer.from("\ufeff<p>Hé</p>", "utf16le").swap16());
    assert.equal(decodeHtml(utf16be, null), "<p>Hé</p>");
  });

  it("skips encodings it can't decode", () => {
    const page = '<meta charset="windows-1252"><p>“Quoted”</p>';
    assert.equal(decodeHtml(cp1252(page), "text/html; charset=made-up"), page);
    assert.equal(decodeHtml(utf8("<p>Café</p>"), "text/html; charset=made-up"), "<p>Café</p>");
    assert.equal(decodeHtml(utf8('<meta charset="made-up"><p>Café</p>'), null), '<meta charset="made-up"><p>Café</p>');
  });

  it("maps every windows-1252 byte the way browsers do", () => {
    const bytes = new Uint8Array(32).map((_, index) => 0x80 + index);
    const expected =
      "\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u008d\u017d\u008f" +
      "\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u009d\u017e\u0178";
    assert.equal(decodeHtml(bytes, "text/html; charset=windows-1252"), expected);
    const latin = new Uint8Array([0x41, 0x7f, 0xa0, 0xe9, 0xff]);
    assert.equal(decodeHtml(latin, "text/html; charset=windows-1252"), "A\u007f\u00a0éÿ");
  });

  it("decodes long windows-1252 bodies across chunk boundaries", () => {
    const bytes = new Uint8Array(20_001).fill(0x93);
    bytes[20_000] = 0x41;
    const text = decodeHtml(bytes, "text/html; charset=windows-1252");
    assert.equal(text.length, 20_001);
    assert.equal(text, `${"“".repeat(20_000)}A`);
  });

  it("replaces malformed bytes instead of throwing", () => {
    assert.equal(decodeHtml(new Uint8Array([0x41, 0xff, 0x42]), null), "A�B");
    assert.equal(decodeHtml(new Uint8Array([0x41, 0xe2, 0x80]), "text/html; charset=utf-8"), "A�");
    assert.equal(typeof decodeHtml(null as unknown as Uint8Array, null), "string");
    assert.equal(typeof decodeHtml(undefined as unknown as Uint8Array, "text/html; charset=windows-1252"), "string");
  });

  it("accepts a Buffer", () => {
    assert.equal(decodeHtml(Buffer.from("<p>Café</p>"), null), "<p>Café</p>");
  });
});
