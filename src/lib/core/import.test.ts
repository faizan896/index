import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { MAX_IMPORT_ROWS, parseBookmarksCsv, parseImportDate, type ImportCandidate } from "./import";

function only(text: string): ImportCandidate {
  const result = parseBookmarksCsv(text);
  assert.equal(result.candidates.length, 1, `expected one candidate, got ${result.candidates.length}`);
  return result.candidates[0]!;
}

function unixSeconds(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

describe("parseBookmarksCsv: services", () => {
  it("reads a Pocket export", () => {
    const csv = [
      "title,url,time_added,tags,status",
      "How to Read a Book,https://example.com/read?utm_source=pocket,1700000000,books|reading,archive",
      "https://example.org/untitled,https://example.org/untitled,1700000100,,unread",
    ].join("\n");
    const result = parseBookmarksCsv(csv);
    assert.deepEqual(result.recognizedColumns, ["url", "title", "tags", "status", "date"]);
    assert.equal(result.invalid, 0);

    const [first, second] = result.candidates;
    assert.deepEqual(first, {
      url: "https://example.com/read",
      normalizedUrl: "https://example.com/read",
      domain: "example.com",
      title: "How to Read a Book",
      description: null,
      status: "finished",
      isFavorite: false,
      createdAt: unixSeconds(1700000000),
      note: null,
      categories: [],
      tags: ["books", "reading"],
    });
    // Pocket repeats the URL when the page had no title.
    assert.equal(second?.title, null);
    assert.equal(second?.status, "unread");
  });

  it("reads a Raindrop.io export", () => {
    const csv = [
      "id,title,note,excerpt,url,folder,tags,created,cover,highlights,favorite",
      '1,Design Systems,My note,An excerpt,https://raindrop.example/a,Design,"ui, systems",2023-03-01T10:20:30.000Z,https://img.example/x.png,Highlight: the key line,true',
      "2,Other,,,https://raindrop.example/b,Unsorted,,2023-03-02T10:20:30.000Z,,,false",
    ].join("\n");
    const result = parseBookmarksCsv(csv);
    assert.deepEqual(result.recognizedColumns, ["url", "title", "description", "note", "tags", "categories", "favorite", "date"]);

    const [first, second] = result.candidates;
    assert.equal(first?.url, "https://raindrop.example/a");
    assert.equal(first?.title, "Design Systems");
    assert.equal(first?.description, "An excerpt");
    assert.equal(first?.note, "My note\n\nHighlight: the key line");
    assert.deepEqual(first?.categories, ["Design"]);
    assert.deepEqual(first?.tags, ["ui", "systems"]);
    assert.equal(first?.createdAt, "2023-03-01T10:20:30.000Z");
    assert.equal(first?.isFavorite, true);
    assert.equal(first?.status, null);

    // Raindrop's catch-all collection is not a category.
    assert.deepEqual(second?.categories, []);
    assert.equal(second?.isFavorite, false);
  });

  it("reads an Instapaper export, turning its folders into status and stars", () => {
    const csv = [
      "URL,Title,Selection,Folder,Timestamp",
      "https://insta.example/1,One,A selection,Unread,1600000000",
      "https://insta.example/2,Two,,Archive,1600000001",
      "https://insta.example/3,Three,,Starred,1600000002",
      "https://insta.example/4,Four,,Philosophy,1600000003",
    ].join("\r\n");
    const result = parseBookmarksCsv(csv);
    assert.deepEqual(result.recognizedColumns, ["url", "title", "description", "categories", "date"]);
    const [one, two, three, four] = result.candidates;

    assert.equal(one?.description, "A selection");
    assert.equal(one?.status, "unread");
    assert.deepEqual(one?.categories, []);
    assert.equal(one?.createdAt, unixSeconds(1600000000));

    assert.equal(two?.status, "finished");
    assert.deepEqual(two?.categories, []);

    assert.equal(three?.isFavorite, true);
    assert.equal(three?.status, null);
    assert.deepEqual(three?.categories, []);

    assert.deepEqual(four?.categories, ["Philosophy"]);
    assert.equal(four?.status, null);
  });

  it("reads a Readwise Reader export", () => {
    const candidate = only(
      [
        "Title,URL,ID,Document tags,Saved date,Reading progress,Location,Seen",
        `Essay,https://rw.example/e,01h,"['ai', 'machine learning']",2023-05-01 10:30:00+00:00,0.5,archive,True`,
      ].join("\n"),
    );
    assert.deepEqual(candidate.tags, ["ai", "machine learning"]);
    assert.equal(candidate.createdAt, "2023-05-01T10:30:00.000Z");
    assert.equal(candidate.status, "finished");
  });

  it("reads an Omnivore-style export", () => {
    const candidate = only(
      [
        "title,url,description,author,labels,state,savedAt,publishedAt",
        'Article,https://om.example/x,A summary,Jane,"Newsletter,Longform",ARCHIVED,2024-02-03T04:05:06Z,2020-01-01',
      ].join("\n"),
    );
    assert.equal(candidate.description, "A summary");
    assert.deepEqual(candidate.tags, ["Newsletter", "Longform"]);
    assert.equal(candidate.status, "finished");
    // savedAt, not publishedAt.
    assert.equal(candidate.createdAt, "2024-02-03T04:05:06.000Z");
  });

  it("reads a browser bookmarks CSV, dropping the browser's root folder", () => {
    const result = parseBookmarksCsv(
      [
        "Name,URL,Folder,Add Date",
        "Type,https://br.example/t,Bookmarks Bar/Design/Typography,1690000000",
        "Root,https://br.example/r,Bookmarks bar,1690000001",
        "Plain,https://br.example/p,AI/ML,1690000002",
      ].join("\n"),
    );
    const [type, root, plain] = result.candidates;
    assert.equal(type?.title, "Type");
    assert.deepEqual(type?.categories, ["Typography"]);
    assert.equal(type?.createdAt, unixSeconds(1690000000));
    assert.deepEqual(root?.categories, []);
    assert.deepEqual(plain?.categories, ["AI/ML"]);
  });

  it("matches headers regardless of case, spaces and underscores", () => {
    const candidate = only(
      [" Link , Page Title ,TIME_ADDED,Is Favorite,Read,Comment", "https://h.example/a,Hello,2024-01-02,Y,true,Worth it"].join(
        "\n",
      ),
    );
    assert.equal(candidate.title, "Hello");
    assert.equal(candidate.createdAt, "2024-01-02T00:00:00.000Z");
    assert.equal(candidate.isFavorite, true);
    assert.equal(candidate.status, "finished");
    assert.equal(candidate.note, "Worth it");
  });

  it("reads semicolon-delimited files from European spreadsheets", () => {
    const candidate = only("url;title;tags\nhttps://eu.example/a;Bonjour, monde;a, b");
    assert.equal(candidate.title, "Bonjour, monde");
    assert.deepEqual(candidate.tags, ["a", "b"]);
  });
});

describe("parseBookmarksCsv: headerless files", () => {
  it("uses the column of links when there is no header", () => {
    const result = parseBookmarksCsv(
      ["https://a.example/1", "www.b.example/2", "not a link", "https://a.example/1/", "", "c.example"].join("\n"),
    );
    assert.deepEqual(
      result.candidates.map((candidate) => candidate.url),
      ["https://a.example/1", "https://www.b.example/2", "https://c.example/"],
    );
    assert.equal(result.invalid, 1);
    assert.equal(result.duplicatesInFile, 1);
    assert.deepEqual(result.recognizedColumns, ["url"]);
  });

  it("finds the links in whichever column holds them", () => {
    const result = parseBookmarksCsv("Some title,https://x.example/a\nAnother,https://x.example/b");
    assert.deepEqual(
      result.candidates.map((candidate) => candidate.url),
      ["https://x.example/a", "https://x.example/b"],
    );
    assert.equal(result.candidates[0]?.title, null);
  });

  it("uses the data to find the link column under an unfamiliar header", () => {
    const result = parseBookmarksCsv("Bookmark,Saved\nhttps://x.example/a,2024-01-01\nhttps://x.example/b,");
    assert.equal(result.candidates.length, 2);
    assert.equal(result.candidates[0]?.createdAt, "2024-01-01T00:00:00.000Z");
    assert.deepEqual(result.recognizedColumns, ["url", "date"]);
    assert.equal(result.invalid, 0);
  });

  it("counts every row as invalid when no column holds links", () => {
    assert.deepEqual(parseBookmarksCsv("title,notes\nA,B\nC,D"), {
      candidates: [],
      invalid: 2,
      duplicatesInFile: 0,
      skipped: 0,
      recognizedColumns: ["title", "note"],
    });
    const prose = parseBookmarksCsv("hello\nworld");
    assert.equal(prose.invalid, 2);
    assert.deepEqual(prose.recognizedColumns, []);
  });
});

describe("parseBookmarksCsv: values", () => {
  function statusOf(value: string, column = "status") {
    return only(`url,${column}\nhttps://s.example/a,${value}`).status;
  }

  function favoriteOf(value: string) {
    return only(`url,favorite\nhttps://f.example/a,${value}`).isFavorite;
  }

  it("maps reading states", () => {
    for (const value of ["unread", "Unread", "new", "later"]) assert.equal(statusOf(value), "unread", value);
    for (const value of ["read", "archive", "Archived", "finished", "done", "DONE"]) assert.equal(statusOf(value), "finished", value);
    for (const value of ["reading", "in progress", "In_Progress", "in-progress"]) assert.equal(statusOf(value), "reading", value);
    for (const value of ["", "weird", "true", "SUCCEEDED"]) assert.equal(statusOf(value), null, value);
  });

  it("reads a true/false \"read\" column", () => {
    assert.equal(statusOf("true", "read"), "finished");
    assert.equal(statusOf("1", "is_read"), "finished");
    assert.equal(statusOf("false", "read"), "unread");
    assert.equal(statusOf("", "read"), null);
    assert.equal(statusOf("yes", "archived"), "finished");
    assert.equal(statusOf("no", "archived"), null);
  });

  it("reads favorite flags", () => {
    for (const value of ["true", "TRUE", "1", "yes", "Y", "x", "X"]) assert.equal(favoriteOf(value), true, value);
    for (const value of ["false", "0", "no", "", "maybe"]) assert.equal(favoriteOf(value), false, value);
    assert.equal(only("url,starred\nhttps://f.example/a,1").isFavorite, true);
    assert.equal(only("url,is_favorite\nhttps://f.example/a,yes").isFavorite, true);
  });

  it("splits, cleans and de-duplicates tags", () => {
    const candidate = only(`url,tags\nhttps://t.example/a,"a, b; c|d , #design, Design,DESIGN, , \u200b,'quoted'"`);
    assert.deepEqual(candidate.tags, ["a", "b", "c", "d", "design", "quoted"]);
  });

  it("drops names over 60 characters and caps the counts", () => {
    const long = "x".repeat(61);
    const tags = Array.from({ length: 30 }, (_, index) => `tag${index}`).join("|");
    const categories = Array.from({ length: 15 }, (_, index) => `Shelf ${index}`).join(";");
    const candidate = only(`url,tags,categories\nhttps://t.example/a,"${long}|${tags}",${categories}`);
    assert.equal(candidate.tags.length, 20);
    assert.equal(candidate.tags[0], "tag0");
    assert.equal(candidate.categories.length, 10);
    assert.equal(candidate.categories[9], "Shelf 9");
    assert.ok(only(`url,tags\nhttps://t.example/a,${"y".repeat(60)}`).tags[0]?.length === 60);
  });

  it("de-duplicates categories ignoring case and keeps the first spelling", () => {
    assert.deepEqual(only("url,categories\nhttps://c.example/a,Economics; economics; History").categories, [
      "Economics",
      "History",
    ]);
  });

  it("bounds titles and descriptions to what the database accepts", () => {
    const candidate = only(`url,title,description\nhttps://b.example/a,${"word ".repeat(200)},${"text ".repeat(600)}`);
    assert.ok((candidate.title ?? "").length <= 500);
    assert.ok((candidate.description ?? "").length <= 2000);
    assert.ok(candidate.title?.endsWith("…"));
  });

  it("cleans markup and entities from titles but keeps note line breaks", () => {
    const candidate = only(`url,title,note\nhttps://b.example/a,"Tom &amp; <b>Jerry</b>","First line\r\n\r\n\r\n\r\nSecond line  "`);
    assert.equal(candidate.title, "Tom & Jerry");
    assert.equal(candidate.note, "First line\n\nSecond line");
  });

  it("undoes the spreadsheet formula guard", () => {
    const candidate = only(`url,title,note\nhttps://g.example/a,'=SUM(1),'- first point`);
    assert.equal(candidate.title, "=SUM(1)");
    assert.equal(candidate.note, "- first point");
  });

  it("ignores rows of empty cells and counts rows without a usable link", () => {
    const result = parseBookmarksCsv(
      ["url,title", ",,", "https://ok.example/a,A", ",No link", "ftp://files.example/x,FTP", "http://localhost/x,Local", "javascript:alert(1),X"].join(
        "\n",
      ),
    );
    assert.equal(result.candidates.length, 1);
    assert.equal(result.invalid, 4);
  });

  it("strips tracking parameters and counts repeats of the same page", () => {
    const result = parseBookmarksCsv(
      [
        "url,title",
        "https://d.example/post?utm_source=x,First",
        "http://www.d.example/post/,Second",
        "https://d.example/post#section,Third",
        "https://d.example/other,Other",
      ].join("\n"),
    );
    assert.deepEqual(
      result.candidates.map((candidate) => candidate.title),
      ["First", "Other"],
    );
    assert.equal(result.duplicatesInFile, 2);
  });

  it("falls back to the next URL column when the first is empty", () => {
    const candidate = only("url,link\n,https://fallback.example/a");
    assert.equal(candidate.url, "https://fallback.example/a");
  });
});

describe("parseBookmarksCsv: limits", () => {
  const csv = ["url", ...Array.from({ length: 10 }, (_, index) => `https://m.example/${index}`)].join("\n");

  it("reads at most maxRows rows and reports the rest as skipped", () => {
    const result = parseBookmarksCsv(csv, { maxRows: 3 });
    assert.equal(result.candidates.length, 3);
    assert.equal(result.skipped, 7);
  });

  it("counts invalid and duplicate rows toward the limit", () => {
    const result = parseBookmarksCsv("url\nnope\nhttps://m.example/1\nhttps://m.example/1\nhttps://m.example/2", { maxRows: 3 });
    assert.equal(result.invalid, 1);
    assert.equal(result.duplicatesInFile, 1);
    assert.equal(result.candidates.length, 1);
    assert.equal(result.skipped, 1);
  });

  it("defaults to MAX_IMPORT_ROWS", () => {
    assert.equal(MAX_IMPORT_ROWS, 5000);
    const big = ["url", ...Array.from({ length: MAX_IMPORT_ROWS + 5 }, (_, index) => `https://n.example/${index}`)].join("\n");
    const result = parseBookmarksCsv(big);
    assert.equal(result.candidates.length, MAX_IMPORT_ROWS);
    assert.equal(result.skipped, 5);
    assert.equal(parseBookmarksCsv(csv, { maxRows: Number.NaN }).candidates.length, 10);
    assert.equal(parseBookmarksCsv(csv, { maxRows: 0 }).skipped, 10);
  });

  it("never throws on empty or odd input", () => {
    const empty = { candidates: [], invalid: 0, duplicatesInFile: 0, skipped: 0, recognizedColumns: [] };
    assert.deepEqual(parseBookmarksCsv(""), empty);
    assert.deepEqual(parseBookmarksCsv("\uFEFF\r\n\r\n"), empty);
    assert.deepEqual(parseBookmarksCsv(undefined as unknown as string), empty);
    assert.equal(parseBookmarksCsv("url\n").candidates.length, 0);
    // An unterminated quote swallows the rest of the file into one title.
    const broken = parseBookmarksCsv('url,title\nhttps://u.example/a,"unterminated\nhttps://u.example/b,B');
    assert.equal(broken.candidates.length, 1);
    assert.equal(broken.candidates[0]?.title, "unterminated https://u.example/b,B");
  });
});

describe("parseImportDate", () => {
  const now = Date.UTC(2026, 9, 16, 12);

  it("reads ISO timestamps, with or without time and offset", () => {
    assert.equal(parseImportDate("2024-03-05T10:00:00Z", now), "2024-03-05T10:00:00.000Z");
    assert.equal(parseImportDate("2024-03-05T10:00:00+02:00", now), "2024-03-05T08:00:00.000Z");
    assert.equal(parseImportDate("2024-03-05T10:00:00-0530", now), "2024-03-05T15:30:00.000Z");
    assert.equal(parseImportDate("2024-03-05T10:00:00.123456+00:00", now), "2024-03-05T10:00:00.123Z");
    assert.equal(parseImportDate("2024-03-05 10:00", now), "2024-03-05T10:00:00.000Z");
    assert.equal(parseImportDate("  2024-03-05  ", now), "2024-03-05T00:00:00.000Z");
    assert.equal(parseImportDate("2024/3/5", now), "2024-03-05T00:00:00.000Z");
  });

  it("reads unix seconds and milliseconds", () => {
    assert.equal(parseImportDate("1700000000", now), "2023-11-14T22:13:20.000Z");
    assert.equal(parseImportDate("1700000000123", now), "2023-11-14T22:13:20.123Z");
    assert.equal(parseImportDate("1700000000.5", now), "2023-11-14T22:13:20.500Z");
  });

  it("reads day/month/year forms and written-out dates", () => {
    assert.equal(parseImportDate("16.10.2025", now), "2025-10-16T00:00:00.000Z");
    assert.equal(parseImportDate("10/16/2025", now), "2025-10-16T00:00:00.000Z");
    assert.equal(parseImportDate("16/10/2025", now), "2025-10-16T00:00:00.000Z");
    assert.equal(parseImportDate("03/05/2024 10:30 PM", now), "2024-03-05T22:30:00.000Z");
    assert.equal(parseImportDate("03/05/2024 12:15 am", now), "2024-03-05T00:15:00.000Z");
    assert.equal(parseImportDate("Tue, 05 Mar 2024 10:00:00 GMT", now), "2024-03-05T10:00:00.000Z");
  });

  it("rejects garbage, impossible dates and placeholders", () => {
    for (const value of ["", "  ", "soon", "2024-13-01", "2024-02-30", "2024-03-05T25:00", "0", "-1", "1969-07-20", "0099-01-01", "13/13/2024", "03/05/2024 13:00 PM", "May the force", "March 5"]) {
      assert.equal(parseImportDate(value, now), null, value);
    }
    assert.equal(parseImportDate(undefined as unknown as string, now), null);
  });

  it("rejects dates in the future, allowing a day for time zones", () => {
    assert.equal(parseImportDate("2999-01-01", now), null);
    assert.equal(parseImportDate(String(Math.floor(now / 1000) + 3 * 86400), now), null);
    assert.equal(parseImportDate("2026-10-17", now), "2026-10-17T00:00:00.000Z");
    assert.equal(parseImportDate("2026-10-18T12:00:01Z", now), null);
  });
});
