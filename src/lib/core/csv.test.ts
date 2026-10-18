import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseCsv, toCsv } from "./csv";

describe("parseCsv", () => {
  it("splits plain rows and fields", () => {
    assert.deepEqual(parseCsv("a,b,c\n1,2,3"), [
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("reads quoted fields with commas, doubled quotes and line breaks", () => {
    const text = 'title,note\n"Hello, world","She said ""hi""\nthen left"\n';
    assert.deepEqual(parseCsv(text), [
      ["title", "note"],
      ["Hello, world", 'She said "hi"\nthen left'],
    ]);
  });

  it("accepts CRLF, LF and CR line endings, and CRLF inside quotes becomes \\n", () => {
    assert.deepEqual(parseCsv("a,b\r\n1,2\r\n"), [
      ["a", "b"],
      ["1", "2"],
    ]);
    assert.deepEqual(parseCsv("a,b\r1,2\r"), [
      ["a", "b"],
      ["1", "2"],
    ]);
    assert.deepEqual(parseCsv('a\r\n"x\r\ny\rz"\r\n'), [["a"], ["x\ny\nz"]]);
  });

  it("strips a leading byte-order mark", () => {
    assert.deepEqual(parseCsv("\uFEFFurl,title\nhttps://a.com,A"), [
      ["url", "title"],
      ["https://a.com", "A"],
    ]);
  });

  it("ignores the trailing newline and blank lines, but keeps empty cells", () => {
    assert.deepEqual(parseCsv("a,b\n\n1,\n,2\n\n\n"), [
      ["a", "b"],
      ["1", ""],
      ["", "2"],
    ]);
    assert.deepEqual(parseCsv('a\n""\n'), [["a"], [""]]);
    assert.deepEqual(parseCsv(",,\n"), [["", "", ""]]);
  });

  it("detects semicolon and tab delimiters from the header line", () => {
    assert.deepEqual(parseCsv("url;title;tags\nhttps://a.com;A, B;x"), [
      ["url", "title", "tags"],
      ["https://a.com", "A, B", "x"],
    ]);
    assert.deepEqual(parseCsv("url\ttitle\nhttps://a.com\tA, B"), [
      ["url", "title"],
      ["https://a.com", "A, B"],
    ]);
    // A semicolon inside a quoted header doesn't count.
    assert.deepEqual(parseCsv('"a;b",c\n1;2,3'), [
      ["a;b", "c"],
      ["1;2", "3"],
    ]);
    // Commas win ties and ordinary headers.
    assert.deepEqual(parseCsv("a,b;c\n1,2;3"), [
      ["a", "b;c"],
      ["1", "2;3"],
    ]);
  });

  it("honours Excel's sep= hint", () => {
    assert.deepEqual(parseCsv("sep=;\r\na;b\r\n1;2"), [
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("treats an unterminated quote as running to the end", () => {
    assert.deepEqual(parseCsv('a,b\n1,"never closed\n2,3'), [
      ["a", "b"],
      ["1", "never closed\n2,3"],
    ]);
  });

  it("keeps stray quotes and text after a closing quote", () => {
    assert.deepEqual(parseCsv('a 5" screen,"quoted"tail'), [['a 5" screen', "quotedtail"]]);
  });

  it("allows spaces before an opening quote", () => {
    assert.deepEqual(parseCsv('a, "b, c"'), [["a", "b, c"]]);
  });

  it("returns rows of different widths as they are", () => {
    const rows = parseCsv("a,b\n1,2,3,4,5\n6");
    assert.deepEqual(rows, [["a", "b"], ["1", "2", "3", "4", "5"], ["6"]]);
  });

  it("handles a wide row", () => {
    const cells = Array.from({ length: 500 }, (_, index) => `c${index}`);
    const [row] = parseCsv(cells.join(","));
    assert.equal(row?.length, 500);
    assert.equal(row?.[499], "c499");
  });

  it("returns nothing for empty input and never throws on junk", () => {
    assert.deepEqual(parseCsv(""), []);
    assert.deepEqual(parseCsv("\uFEFF"), []);
    assert.deepEqual(parseCsv("\n\r\n"), []);
    assert.deepEqual(parseCsv('"'), [[""]]);
    assert.deepEqual(parseCsv('""""'), [['"']]);
    assert.deepEqual(parseCsv(undefined as unknown as string), []);
  });
});

describe("toCsv", () => {
  it("writes CRLF rows and quotes only where needed", () => {
    assert.equal(
      toCsv([
        ["url", "title"],
        ["https://a.com", 'Say "hi", then go'],
        ["https://b.com", "Line one\nline two"],
        ["https://c.com", "a; b"],
      ]),
      'url,title\r\nhttps://a.com,"Say ""hi"", then go"\r\nhttps://b.com,"Line one\nline two"\r\nhttps://c.com,"a; b"\r\n',
    );
  });

  it("writes empty values for null, undefined and non-finite numbers", () => {
    assert.equal(toCsv([[null, undefined, Number.NaN, 0, true, false]]), ",,,0,true,false\r\n");
  });

  it("adds a byte-order mark on request", () => {
    assert.equal(toCsv([["a"]], { bom: true }), "\uFEFFa\r\n");
    assert.equal(toCsv([]), "");
  });

  it("guards text that would run as a spreadsheet formula", () => {
    assert.equal(toCsv([["=SUM(A1:A9)"]]), "'=SUM(A1:A9)\r\n");
    assert.equal(toCsv([["+1 555"]]), "'+1 555\r\n");
    assert.equal(toCsv([["-2 points"]]), "'-2 points\r\n");
    assert.equal(toCsv([["@cmd"]]), "'@cmd\r\n");
    assert.equal(toCsv([["\tindented"]]), "\"'\tindented\"\r\n");
    assert.equal(toCsv([["\rx"]]), "\"'\rx\"\r\n");
    assert.equal(toCsv([['=HYPERLINK("http://x","y")']]), '"\'=HYPERLINK(""http://x"",""y"")"\r\n');
    // Text in the middle is harmless, and numbers stay numbers.
    assert.equal(toCsv([["a=b", -5, 3.5]]), "a=b,-5,3.5\r\n");
    // A negative number written as text is still guarded.
    assert.equal(toCsv([["-5"]]), "'-5\r\n");
  });

  it("keeps a row with one empty cell from turning into a blank line", () => {
    assert.equal(toCsv([["a"], [""], [null]]), 'a\r\n""\r\n""\r\n');
    assert.deepEqual(parseCsv(toCsv([["a"], [""]])), [["a"], [""]]);
  });

  it("round-trips through parseCsv", () => {
    const rows = [
      ["url", "title", "notes"],
      ["https://a.com/?q=1,2", 'Quote "this"', "first\n\nsecond"],
      ["https://b.com", "", "semi;colon, comma\ttab"],
      ["https://c.com", "  padded  ", "émoji 🙂 and 漢字"],
    ];
    assert.deepEqual(parseCsv(toCsv(rows, { bom: true })), rows);
  });
});
