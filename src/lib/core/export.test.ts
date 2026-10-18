import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseCsv } from "./csv";
import { buildLibraryExport, EXPORT_CSV_COLUMNS, exportFilename, libraryExportToCsv } from "./export";
import { parseBookmarksCsv } from "./import";

const exportedAt = new Date("2026-10-16T09:30:00.000Z");

/** What export_library() returns, as PostgREST hands it over. */
const raw = {
  links: [
    {
      url: "https://essays.example/on-money",
      canonical_url: "https://essays.example/on-money",
      title: "On Money, \"Value\" and Time",
      description: "=A spreadsheet formula, in a description",
      author: "A. Writer",
      site_name: "Essays",
      domain: "essays.example",
      published_at: "2024-02-01T00:00:00+00:00",
      reading_minutes: 12,
      status: "finished",
      is_favorite: true,
      saved_at: "2025-06-01T08:15:30.123456+00:00",
      finished_at: "2025-06-03T20:00:00+00:00",
      categories: ["Economics", "History"],
      tags: ["money", "time preference"],
      collections: ["Best of 2025"],
      notes: [
        { body: "- first point\n- second point", created_at: "2025-06-02T10:00:00+00:00" },
        { body: "A later thought.", created_at: "2025-06-04T10:00:00+00:00" },
      ],
    },
    {
      url: "https://news.example/story",
      canonical_url: null,
      title: null,
      description: null,
      author: null,
      site_name: null,
      domain: "news.example",
      published_at: null,
      reading_minutes: null,
      status: "unread",
      is_favorite: false,
      saved_at: "2025-05-01T00:00:00+00:00",
      finished_at: null,
      categories: [],
      tags: [],
      collections: [],
      notes: [],
    },
  ],
  collections: [{ name: "Best of 2025", description: null, created_at: "2025-01-01T00:00:00+00:00" }],
  categories: ["Economics", "History"],
};

describe("buildLibraryExport", () => {
  it("reshapes export_library() into the download document", () => {
    const doc = buildLibraryExport(raw, exportedAt);
    assert.equal(doc.format, "index-library");
    assert.equal(doc.version, 1);
    assert.equal(doc.exportedAt, "2026-10-16T09:30:00.000Z");
    assert.deepEqual(doc.categories, ["Economics", "History"]);
    assert.deepEqual(doc.collections, [{ name: "Best of 2025", description: null, createdAt: "2025-01-01T00:00:00.000Z" }]);
    assert.equal(doc.links.length, 2);
    assert.deepEqual(doc.links[0], {
      url: "https://essays.example/on-money",
      canonicalUrl: "https://essays.example/on-money",
      title: 'On Money, "Value" and Time',
      description: "=A spreadsheet formula, in a description",
      author: "A. Writer",
      siteName: "Essays",
      domain: "essays.example",
      publishedAt: "2024-02-01T00:00:00.000Z",
      readingMinutes: 12,
      status: "finished",
      isFavorite: true,
      savedAt: "2025-06-01T08:15:30.123Z",
      finishedAt: "2025-06-03T20:00:00.000Z",
      categories: ["Economics", "History"],
      tags: ["money", "time preference"],
      collections: ["Best of 2025"],
      notes: [
        { body: "- first point\n- second point", createdAt: "2025-06-02T10:00:00.000Z" },
        { body: "A later thought.", createdAt: "2025-06-04T10:00:00.000Z" },
      ],
    });
    assert.equal(doc.links[1]?.title, null);
    assert.deepEqual(doc.links[1]?.notes, []);
  });

  it("skips malformed entries and fills in defaults without throwing", () => {
    const doc = buildLibraryExport(
      {
        links: [
          null,
          "https://string.example",
          { title: "No URL" },
          { url: "   " },
          {
            url: "https://www.odd.example/a",
            status: "deleted",
            is_favorite: "true",
            reading_minutes: -3,
            saved_at: "not a date",
            categories: ["Kept", 7, null, ""],
            tags: "not-a-list",
            notes: [{ body: "" }, { body: "Kept note", created_at: null }, "loose"],
          },
        ],
        collections: [{ description: "no name" }, { name: "Named", created_at: 5 }],
        categories: "nope",
      },
      exportedAt,
    );
    assert.equal(doc.links.length, 1);
    const [link] = doc.links;
    assert.equal(link?.domain, "odd.example");
    assert.equal(link?.status, "unread");
    assert.equal(link?.isFavorite, false);
    assert.equal(link?.readingMinutes, null);
    assert.equal(link?.savedAt, "2026-10-16T09:30:00.000Z");
    assert.deepEqual(link?.categories, ["Kept"]);
    assert.deepEqual(link?.tags, []);
    assert.deepEqual(link?.notes, [{ body: "Kept note", createdAt: "2026-10-16T09:30:00.000Z" }]);
    assert.deepEqual(doc.collections, [{ name: "Named", description: null, createdAt: "1970-01-01T00:00:00.005Z" }]);
    assert.deepEqual(doc.categories, []);
  });

  it("returns an empty library for anything that isn't the document", () => {
    for (const value of [null, undefined, 42, "text", [], { links: "nope" }]) {
      const doc = buildLibraryExport(value, exportedAt);
      assert.deepEqual(doc.links, []);
      assert.deepEqual(doc.collections, []);
      assert.deepEqual(doc.categories, []);
    }
    assert.doesNotThrow(() => buildLibraryExport(raw, new Date(Number.NaN)));
  });
});

describe("libraryExportToCsv", () => {
  it("writes one row per link under the documented columns", () => {
    const csv = libraryExportToCsv(buildLibraryExport(raw, exportedAt));
    assert.ok(csv.startsWith("\uFEFFurl,title,author,source,domain,published_at,saved_at,status,favorite,"));
    assert.ok(csv.includes("\r\n"));

    const rows = parseCsv(csv);
    assert.deepEqual(rows[0], [...EXPORT_CSV_COLUMNS]);
    assert.equal(rows.length, 3);
    const record = Object.fromEntries(EXPORT_CSV_COLUMNS.map((column, index) => [column, rows[1]?.[index]]));
    assert.deepEqual(record, {
      url: "https://essays.example/on-money",
      title: 'On Money, "Value" and Time',
      author: "A. Writer",
      source: "Essays",
      domain: "essays.example",
      published_at: "2024-02-01T00:00:00.000Z",
      saved_at: "2025-06-01T08:15:30.123Z",
      status: "finished",
      favorite: "yes",
      categories: "Economics; History",
      tags: "money; time preference",
      collections: "Best of 2025",
      notes: "'- first point\n- second point\n\nA later thought.",
      reading_minutes: "12",
      description: "'=A spreadsheet formula, in a description",
    });
    assert.deepEqual(rows[2], [
      "https://news.example/story",
      "",
      "",
      "",
      "news.example",
      "",
      "2025-05-01T00:00:00.000Z",
      "unread",
      "no",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
  });

  it("writes just the header for an empty library", () => {
    assert.equal(libraryExportToCsv(buildLibraryExport(null, exportedAt)), `\uFEFF${EXPORT_CSV_COLUMNS.join(",")}\r\n`);
  });
});

describe("export → import round trip", () => {
  it("recovers what Index's own import can store", () => {
    const csv = libraryExportToCsv(buildLibraryExport(raw, exportedAt));
    const result = parseBookmarksCsv(csv);
    assert.equal(result.invalid, 0);
    assert.equal(result.duplicatesInFile, 0);
    assert.deepEqual(result.recognizedColumns, ["url", "title", "description", "note", "tags", "categories", "status", "favorite", "date"]);

    const [essay, story] = result.candidates;
    assert.deepEqual(essay, {
      url: "https://essays.example/on-money",
      normalizedUrl: "https://essays.example/on-money",
      domain: "essays.example",
      title: 'On Money, "Value" and Time',
      description: "=A spreadsheet formula, in a description",
      status: "finished",
      isFavorite: true,
      createdAt: "2025-06-01T08:15:30.123Z",
      note: "- first point\n- second point\n\nA later thought.",
      categories: ["Economics", "History"],
      tags: ["money", "time preference"],
    });
    assert.deepEqual(story, {
      url: "https://news.example/story",
      normalizedUrl: "https://news.example/story",
      domain: "news.example",
      title: null,
      description: null,
      status: "unread",
      isFavorite: false,
      createdAt: "2025-05-01T00:00:00.000Z",
      note: null,
      categories: [],
      tags: [],
    });
  });
});

describe("exportFilename", () => {
  it("names the file after the export date", () => {
    assert.equal(exportFilename("json", exportedAt), "index-library-2026-10-16.json");
    assert.equal(exportFilename("csv", new Date("2026-01-02T23:59:59Z")), "index-library-2026-01-02.csv");
    assert.equal(exportFilename("csv", new Date(Number.NaN)), "index-library.csv");
  });
});
