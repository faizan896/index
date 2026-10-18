import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { extractMetadata, metadataFromUrl, type PageMetadata } from "./metadata";

function fixture(name: string): string {
  return readFileSync(new URL(`./__fixtures__/${name}.html`, import.meta.url), "utf8");
}

/** A minimal page: `head` goes in <head>, `body` in <body>. */
function page(head: string, body = ""): string {
  return `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
}

/** Some ordinary prose, `count` words long. */
function words(count: number): string {
  const vocabulary = ["the", "harbor", "council", "voted", "late", "on", "monday", "to", "approve", "a", "plan", "for", "homes"];
  return Array.from({ length: count }, (_, index) => vocabulary[index % vocabulary.length]).join(" ");
}

function meta(head: string, body = "", url = "https://example.com/articles/a-post"): PageMetadata {
  return extractMetadata(page(head, body), url);
}

function isoInDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

function between(value: number | null, min: number, max: number, label: string): void {
  assert.ok(value !== null && value >= min && value <= max, `${label}: ${value} not in [${min}, ${max}]`);
}

describe("extractMetadata: fixtures", () => {
  it("reads a Substack post (JSON-LD for the date and publication)", () => {
    const result = extractMetadata(fixture("substack"), "https://longcontext.substack.com/p/why-small-models-keep-winning");
    assert.equal(result.title, "Why Small Models Keep Winning");
    assert.equal(result.description, "The case for the model that fits on your laptop, and what the benchmarks leave out.");
    assert.equal(result.author, "Priya Raman");
    assert.equal(result.siteName, "The Long Context");
    assert.equal(result.publishedAt, "2024-03-05T13:01:22.000Z");
    assert.equal(result.canonicalUrl, "https://longcontext.substack.com/p/why-small-models-keep-winning");
    assert.equal(result.lang, "en");
    assert.equal(result.type, "article");
    between(result.wordCount, 650, 780, "wordCount");
    assert.equal(result.readingMinutes, 3);
    assert.deepEqual(result.keywords, []);
    assert.equal(result.blocked, false);
    const excerpt = result.excerpt ?? "";
    assert.ok(excerpt.includes("Every few months a new frontier model arrives"));
    for (const furniture of ["Archive", "Sign in", "Type your email", "Substack is the home", "Collection notice"]) {
      assert.ok(!excerpt.includes(furniture), `excerpt includes "${furniture}"`);
    }
  });

  it("reads a Medium story (ignores the profile URL in article:author)", () => {
    const result = extractMetadata(fixture("medium"), "https://medium.com/@dokonkwo/how-we-cut-our-build-times-in-half-3f9a1c2b7d4e");
    assert.equal(result.title, "How We Cut Our Build Times in Half");
    assert.equal(result.description, "Our CI pipeline took forty minutes. Six weeks later it took eighteen. Here is what moved the needle, and what didn’t.");
    assert.equal(result.author, "Daniel Okonkwo");
    assert.equal(result.siteName, "Medium");
    assert.equal(result.publishedAt, "2023-11-14T16:42:07.118Z");
    assert.equal(result.canonicalUrl, "https://medium.com/@dokonkwo/how-we-cut-our-build-times-in-half-3f9a1c2b7d4e");
    assert.equal(result.lang, "en");
    assert.equal(result.type, "article");
    between(result.wordCount, 600, 700, "wordCount");
    assert.equal(result.readingMinutes, 3);
    assert.deepEqual(result.keywords, []);
    assert.equal(result.blocked, false);
    const excerpt = result.excerpt ?? "";
    assert.ok(excerpt.includes("Eighteen months ago a full run of our continuous integration pipeline"));
    for (const furniture of ["Open in app", "Sign up", "Written by", "Text to speech"]) {
      assert.ok(!excerpt.includes(furniture), `excerpt includes "${furniture}"`);
    }
  });

  it("reads a news site with a Yoast JSON-LD @graph", () => {
    const result = extractMetadata(fixture("news-yoast"), "https://harborledger.com/2024/05/14/city-council-approves-waterfront-housing-plan/");
    // twitter:title carries the site suffix; the publisher (an @id reference) names the site.
    assert.equal(result.title, "City Council Approves Waterfront Housing Plan After Six-Hour Debate");
    assert.equal(
      result.description,
      "The 7-2 vote clears the way for 1,150 homes on the former shipyard site, a fifth of them priced for families earning below the area median.",
    );
    assert.equal(result.author, "Maria Lopez");
    assert.equal(result.siteName, "The Harbor Ledger");
    assert.equal(result.publishedAt, "2024-05-14T13:30:00.000Z");
    assert.equal(result.canonicalUrl, "https://harborledger.com/2024/05/14/city-council-approves-waterfront-housing-plan/");
    assert.equal(result.lang, "en-us");
    assert.equal(result.type, null);
    assert.deepEqual(result.keywords, ["Housing", "City Council", "Waterfront", "Zoning"]);
    between(result.wordCount, 500, 620, "wordCount");
    assert.equal(result.readingMinutes, 2);
    const excerpt = result.excerpt ?? "";
    assert.ok(excerpt.includes("After more than six hours of public comment and debate"));
    // The post is the largest <article>; the comments are articles too, and the sidebar is an <aside>.
    for (const furniture of ["Finally. My rent", "Leave a Reply", "Most Read", "Ferry schedule", "All rights reserved", "not markup"]) {
      assert.ok(!excerpt.includes(furniture), `excerpt includes "${furniture}"`);
    }
  });

  it("reads an arXiv abstract page (citation_* tags, many authors)", () => {
    const result = extractMetadata(fixture("arxiv"), "https://arxiv.org/abs/2401.01234v2");
    assert.equal(result.title, "Sparse Mixture Routing for Long-Context Retrieval");
    assert.equal(result.author, "Chidi Okafor, Maja Lindqvist, Hiroshi Tanaka et al.");
    assert.equal(result.siteName, "arXiv.org");
    assert.equal(result.publishedAt, "2024-01-03T00:00:00.000Z");
    assert.equal(result.canonicalUrl, "https://arxiv.org/abs/2401.01234");
    assert.equal(result.lang, "en");
    assert.equal(result.type, "website");
    assert.ok(result.description?.startsWith("Retrieval-augmented language models struggle"));
    assert.ok((result.description?.length ?? 0) <= 600);
    assert.ok(result.excerpt?.includes("We introduce Sparse Mixture Routing (SMR)"));
    assert.ok(!result.excerpt?.includes("Simons Foundation"), "header text in excerpt");
    assert.ok(!result.excerpt?.includes("Web Accessibility Assistance"), "footer text in excerpt");
    between(result.wordCount, 250, 400, "wordCount");
    assert.equal(result.readingMinutes, 1);
    assert.deepEqual(result.keywords, []);
  });

  it("reads a GitHub repository (site prefix removed, README as content)", () => {
    const result = extractMetadata(fixture("github"), "https://github.com/acme/quill");
    assert.equal(result.title, "acme/quill: A tiny, fast Markdown parser written in Rust");
    assert.equal(result.description, "A tiny, fast Markdown parser written in Rust. Contribute to acme/quill development by creating an account on GitHub.");
    assert.equal(result.author, null);
    assert.equal(result.siteName, "GitHub");
    assert.equal(result.publishedAt, null);
    assert.equal(result.canonicalUrl, "https://github.com/acme/quill");
    assert.equal(result.lang, "en");
    assert.equal(result.type, "object");
    between(result.wordCount, 320, 400, "wordCount");
    assert.equal(result.readingMinutes, 2);
    assert.deepEqual(result.keywords, []);
    assert.equal(result.blocked, false);
    const excerpt = result.excerpt ?? "";
    assert.ok(excerpt.startsWith("quill A tiny, fast Markdown parser written in Rust. Quill turns CommonMark into HTML"));
    // The README copy inside the embedded JSON is script text, never markup.
    for (const furniture of ["This copy lives in a JSON string", "Automate any workflow", "Sign in", "4.2k", "Terms"]) {
      assert.ok(!excerpt.includes(furniture), `excerpt includes "${furniture}"`);
    }
  });

  it("reads a personal blog with only a <title> and paragraphs", () => {
    const result = extractMetadata(fixture("personal-blog"), "https://anaruiz.net/notes/commonplace-book.html");
    // The " — Ana Ruiz" suffix matches the domain, so it goes.
    assert.equal(result.title, "On Keeping a Commonplace Book");
    assert.equal(result.description, null);
    assert.equal(result.author, null);
    assert.equal(result.siteName, null);
    assert.equal(result.publishedAt, null);
    assert.equal(result.canonicalUrl, null);
    assert.equal(result.lang, "en-gb");
    assert.equal(result.type, null);
    between(result.wordCount, 380, 460, "wordCount");
    assert.equal(result.readingMinutes, 2);
    assert.deepEqual(result.keywords, []);
    assert.ok(result.excerpt?.includes("For about twelve years I have kept a commonplace book"));
    assert.ok(!result.excerpt?.includes("should never be counted"), "commented-out text in excerpt");
    assert.ok(!result.excerpt?.includes("Georgia"), "stylesheet in excerpt");
  });

  it("keeps the <title> suffix when it does not name the site", () => {
    const result = extractMetadata(fixture("personal-blog"), "https://reader.example.org/archive/42");
    assert.equal(result.title, "On Keeping a Commonplace Book — Ana Ruiz");
  });

  it("decodes entity-heavy and double-encoded text", () => {
    const result = extractMetadata(fixture("entities"), "https://cafesociety.example/2022/10/its-complicated/?utm_source=feed");
    assert.equal(result.title, "It’s Complicated: Café Culture & the “Third Place”");
    assert.equal(result.description, "Ray Oldenburg’s idea — that we need a place that’s neither home nor work … still holds.");
    assert.equal(result.author, "Zoë Black");
    assert.equal(result.siteName, "Café Society");
    assert.equal(result.publishedAt, "2022-10-03T07:00:00.000Z");
    assert.equal(result.canonicalUrl, "https://cafesociety.example/2022/10/its-complicated/");
    assert.equal(result.lang, "en-us");
    assert.equal(result.type, "article");
    assert.deepEqual(result.keywords, ["Cafés", "Urbanism", "Ray Oldenburg"]);
    between(result.wordCount, 280, 340, "wordCount");
    assert.equal(result.readingMinutes, 1);
    const excerpt = result.excerpt ?? "";
    assert.ok(excerpt.includes("described what he called the “third place”"));
    assert.ok(!/&[a-z#0-9]+;/i.test(excerpt), "undecoded entity in excerpt");
  });

  it("recognises a Cloudflare challenge and reports nothing from it", () => {
    const result = extractMetadata(fixture("cloudflare"), "https://www.example-news.com/2024/05/14/the-story-you-wanted");
    assert.equal(result.blocked, true);
    assert.equal(result.title, null);
    assert.equal(result.description, null);
    assert.equal(result.author, null);
    assert.equal(result.siteName, null);
    assert.equal(result.publishedAt, null);
    assert.equal(result.canonicalUrl, null);
    assert.equal(result.lang, null);
    assert.equal(result.type, null);
    assert.equal(result.wordCount, null);
    assert.equal(result.readingMinutes, null);
    assert.equal(result.excerpt, null);
    assert.deepEqual(result.keywords, []);
  });

  it("reads a Japanese article, timing it by characters", () => {
    const result = extractMetadata(fixture("japanese"), "https://kurashi-bunka.jp/articles/20240920-tomoshibi-shobo");
    assert.equal(result.title, "東京の小さな本屋が守り続けるもの");
    assert.equal(result.description, "西荻窪の商店街で四十年以上続く小さな本屋。二代目店主が語る、本と偶然出会う場所の大切さ。");
    assert.equal(result.author, "山田 花子");
    assert.equal(result.siteName, "暮らしと文化");
    assert.equal(result.publishedAt, "2024-09-19T23:00:00.000Z");
    assert.equal(result.canonicalUrl, "https://kurashi-bunka.jp/articles/20240920-tomoshibi-shobo");
    assert.equal(result.lang, "ja");
    assert.equal(result.type, "article");
    assert.deepEqual(result.keywords, ["本屋", "書店", "西荻窪", "読書会"]);
    // About 900 characters at 500 a minute; counted as words that would be a 4-minute read.
    between(result.wordCount, 850, 980, "wordCount");
    assert.equal(result.readingMinutes, 2);
    assert.ok(result.excerpt?.includes("東京・西荻窪の商店街の外れに"));
    assert.ok(!result.excerpt?.includes("関連記事"), "related links in excerpt");
  });

  it("does not guess about a JavaScript app shell", () => {
    const result = extractMetadata(fixture("app-shell"), "https://tessellate.app/");
    assert.equal(result.title, "Tessellate");
    assert.equal(result.description, "Plan, sketch and share floor plans in your browser.");
    assert.equal(result.author, null);
    assert.equal(result.siteName, null);
    assert.equal(result.publishedAt, null);
    assert.equal(result.canonicalUrl, null);
    assert.equal(result.lang, "en");
    assert.equal(result.type, null);
    assert.equal(result.wordCount, null);
    assert.equal(result.readingMinutes, null);
    assert.equal(result.excerpt, null);
    assert.deepEqual(result.keywords, []);
    assert.equal(result.blocked, false);
  });

  it("never returns markup in any field, and flags none of the real pages", () => {
    for (const name of ["substack", "medium", "news-yoast", "arxiv", "github", "personal-blog", "entities", "japanese", "app-shell"]) {
      const result = extractMetadata(fixture(name), "https://example.com/x/y");
      assert.equal(result.blocked, false, name);
      for (const [field, value] of Object.entries(result)) {
        const texts = Array.isArray(value) ? value : [value];
        for (const text of texts) {
          if (typeof text === "string") assert.ok(!/<\/?[a-z][a-z0-9]*[\s>/]/i.test(text), `${name}.${field}: ${text.slice(0, 80)}`);
        }
      }
    }
  });
});

describe("extractMetadata: title", () => {
  it("prefers og:title, then twitter:title, citation_title, JSON-LD, Dublin Core and <title>", () => {
    const all = [
      `<meta property="og:title" content="OG">`,
      `<meta name="twitter:title" content="Twitter">`,
      `<meta name="citation_title" content="Citation">`,
      `<script type="application/ld+json">{"@type":"Article","headline":"Headline"}</script>`,
      `<meta name="DC.title" content="Dublin">`,
      `<title>Document</title>`,
    ];
    const expected = ["OG", "Twitter", "Citation", "Headline", "Dublin", "Document"];
    expected.forEach((title, index) => assert.equal(meta(all.slice(index).join("")).title, title));
  });

  it("skips empty candidates", () => {
    assert.equal(meta(`<meta property="og:title" content=" &nbsp; "><title>Real</title>`).title, "Real");
  });

  it("uses JSON-LD headline before name, and only from article-like types", () => {
    assert.equal(meta(`<script type="application/ld+json">{"@type":"BlogPosting","name":"Name","headline":"Headline"}</script>`).title, "Headline");
    assert.equal(meta(`<script type="application/ld+json">{"@type":"WebPage","name":"Page name"}</script>`).title, "Page name");
    assert.equal(meta(`<script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script><title>Doc</title>`).title, "Doc");
  });

  it("removes a site suffix or prefix that names the site", () => {
    const site = `<meta property="og:site_name" content="The Atlantic">`;
    assert.equal(meta(`${site}<title>The Last Lighthouse Keeper | The Atlantic</title>`).title, "The Last Lighthouse Keeper");
    assert.equal(meta(`${site}<title>The Last Lighthouse Keeper - The Atlantic</title>`).title, "The Last Lighthouse Keeper");
    assert.equal(meta(`${site}<title>The Last Lighthouse Keeper — Atlantic</title>`).title, "The Last Lighthouse Keeper");
    assert.equal(meta(`${site}<title>The Atlantic | The Last Lighthouse Keeper</title>`).title, "The Last Lighthouse Keeper");
    assert.equal(
      extractMetadata(page(`<title>Why Rust? – Example.com</title>`), "https://www.example.com/why").title,
      "Why Rust?",
    );
    assert.equal(extractMetadata(page(`<title>Post title | Example</title>`), "https://blog.example.co.uk/p").title, "Post title");
  });

  it("removes a trailing byline naming the author", () => {
    const author = `<meta name="author" content="Jane Doe">`;
    assert.equal(meta(`${author}<title>Title Here | by Jane Doe | Medium</title>`, "", "https://medium.com/@jane/x").title, "Title Here");
    assert.equal(meta(`${author}<title>Title Here - by Jane Doe</title>`).title, "Title Here");
    assert.equal(meta(`<meta name="author" content="Kim Lee, Jane Doe"><title>Notes - By Jane Doe</title>`).title, "Notes");
    assert.equal(meta(`${author}<title>Love and Robots | By the Numbers</title>`).title, "Love and Robots | By the Numbers");
    assert.equal(meta(`<title>Title Here - by Jane Doe</title>`).title, "Title Here - by Jane Doe");
  });

  it("keeps dashes and pipes that are part of the title", () => {
    assert.equal(meta(`<title>Six-Hour Debate - What Comes Next</title>`).title, "Six-Hour Debate - What Comes Next");
    assert.equal(meta(`<meta property="og:site_name" content="Example"><title>Example</title>`).title, "Example");
    assert.equal(meta(`<meta property="og:site_name" content="Example"><title>Example | Example</title>`).title, "Example");
  });

  it("caps the length at 300 characters", () => {
    const title = meta(`<title>${words(200)}</title>`).title ?? "";
    assert.ok(title.length <= 300 && title.endsWith("…"));
  });
});

describe("extractMetadata: description", () => {
  it("follows og, twitter, meta, JSON-LD, Dublin Core", () => {
    const all = [
      `<meta property="og:description" content="OG">`,
      `<meta name="twitter:description" content="Twitter">`,
      `<meta name="description" content="Meta">`,
      `<script type="application/ld+json">{"@type":"NewsArticle","description":"LD"}</script>`,
      `<meta name="dc.description" content="DC">`,
    ];
    ["OG", "Twitter", "Meta", "LD", "DC"].forEach((description, index) =>
      assert.equal(meta(all.slice(index).join("")).description, description),
    );
  });

  it("caps the length at 600 characters", () => {
    const description = meta(`<meta name="description" content="${words(300)}">`).description ?? "";
    assert.ok(description.length <= 600 && description.endsWith("…"));
  });
});

describe("extractMetadata: author", () => {
  const ld = (author: string) => `<script type="application/ld+json">{"@type":"Article","author":${author}}</script>`;

  it("lists up to three citation authors, then et al.", () => {
    const authors = ["Smith, Jane", "Lee, Kim", "García Márquez, Ana", "Ng, Andrew"];
    const head = authors.map((name) => `<meta name="citation_author" content="${name}">`).join("");
    assert.equal(meta(head).author, "Jane Smith, Kim Lee, Ana García Márquez et al.");
    assert.equal(meta(head.split("<meta").slice(0, 3).join("<meta")).author, "Jane Smith, Kim Lee");
    assert.equal(meta(`<meta name="citation_authors" content="Jane Smith; Kim Lee">`).author, "Jane Smith, Kim Lee");
  });

  it("reads JSON-LD authors in every shape", () => {
    assert.equal(meta(ld(`"Jane Doe"`)).author, "Jane Doe");
    assert.equal(meta(ld(`{"@type":"Person","name":"Jane Doe"}`)).author, "Jane Doe");
    assert.equal(meta(ld(`[{"name":"Jane Doe"},{"name":"John Roe"}]`)).author, "Jane Doe, John Roe");
    assert.equal(meta(ld(`{"@type":"Person","givenName":"Jane","familyName":"Doe"}`)).author, "Jane Doe");
    const graph = `<script type="application/ld+json">{"@graph":[{"@type":"Article","author":{"@id":"#jane"}},{"@type":"Person","@id":"#jane","name":"Jane Doe"}]}</script>`;
    assert.equal(meta(graph).author, "Jane Doe");
  });

  it("follows the source order", () => {
    const citation = `<meta name="citation_author" content="Citation Author">`;
    const json = ld(`"Json Author"`);
    const author = `<meta name="author" content="Meta Author">`;
    const article = `<meta property="article:author" content="Article Author">`;
    const dc = `<meta name="dc.creator" content="Creator, Dublin">`;
    const parsely = `<meta name="parsely-author" content="Parsely Author">`;
    assert.equal(meta(citation + json + author).author, "Citation Author");
    assert.equal(meta(json + author).author, "Json Author");
    assert.equal(meta(author + article).author, "Meta Author");
    assert.equal(meta(article + dc).author, "Article Author");
    assert.equal(meta(dc + parsely).author, "Dublin Creator");
    assert.equal(meta(parsely).author, "Parsely Author");
  });

  it("never returns a URL, an email address or a placeholder", () => {
    assert.equal(meta(`<meta property="article:author" content="https://www.facebook.com/janedoe">`).author, null);
    assert.equal(meta(`<meta name="author" content="www.example.com/team">`).author, null);
    assert.equal(meta(`<meta name="author" content="jane@example.com">`).author, null);
    assert.equal(meta(`<meta name="author" content="admin">`).author, null);
    assert.equal(meta(`<meta name="author" content="Admin"><meta name="parsely-author" content="Jane Doe">`).author, "Jane Doe");
    assert.equal(meta(ld(`"https://example.com/author/jane"`) + `<meta name="author" content="Jane Doe">`).author, "Jane Doe");
  });

  it("drops a leading By and caps the length", () => {
    assert.equal(meta(`<meta name="author" content="By Jane Doe">`).author, "Jane Doe");
    assert.equal(meta(`<meta name="byl" content="By Jane Doe and John Roe">`).author, "Jane Doe and John Roe");
    const long = meta(`<meta name="author" content="${words(80)}">`).author ?? "";
    assert.ok(long.length <= 200);
  });
});

describe("extractMetadata: site name", () => {
  it("follows og:site_name, application-name, JSON-LD publisher, journal", () => {
    const all = [
      `<meta property="og:site_name" content="OG Site">`,
      `<meta name="application-name" content="App Name">`,
      `<script type="application/ld+json">{"@type":"Article","publisher":{"@type":"Organization","name":"Publisher"}}</script>`,
      `<meta name="citation_journal_title" content="Journal of Things">`,
    ];
    ["OG Site", "App Name", "Publisher", "Journal of Things"].forEach((siteName, index) =>
      assert.equal(meta(all.slice(index).join("")).siteName, siteName),
    );
    assert.equal(meta(`<meta name="citation_conference_title" content="ACL 2024">`).siteName, "ACL 2024");
    assert.equal(meta("").siteName, null);
  });
});

describe("extractMetadata: publication date", () => {
  const date = (value: string) => meta(`<meta property="article:published_time" content="${value}">`).publishedAt;

  it("normalizes the formats publishers use", () => {
    const cases: Array<[string, string]> = [
      ["2024-03-05T10:20:30Z", "2024-03-05T10:20:30.000Z"],
      ["2024-03-05T10:20:30.123456+00:00", "2024-03-05T10:20:30.123Z"],
      ["2024-03-05T10:20:30+05:30", "2024-03-05T04:50:30.000Z"],
      ["2024-03-05T10:20:30-0400", "2024-03-05T14:20:30.000Z"],
      ["2024-03-05T10:20", "2024-03-05T10:20:00.000Z"],
      ["2024-03-05 10:20:30", "2024-03-05T10:20:30.000Z"],
      ["2024-03-05", "2024-03-05T00:00:00.000Z"],
      ["2024/03/05", "2024-03-05T00:00:00.000Z"],
      ["2024/3/5", "2024-03-05T00:00:00.000Z"],
      ["2024.03.05", "2024-03-05T00:00:00.000Z"],
      ["2024-03", "2024-03-01T00:00:00.000Z"],
      ["2024", "2024-01-01T00:00:00.000Z"],
      ["20240305", "2024-03-05T00:00:00.000Z"],
      ["March 5, 2024", "2024-03-05T00:00:00.000Z"],
      ["Mar 5 2024", "2024-03-05T00:00:00.000Z"],
      ["5 March 2024", "2024-03-05T00:00:00.000Z"],
      ["Tuesday, 5th March 2024", "2024-03-05T00:00:00.000Z"],
      ["Tue, 05 Mar 2024 10:20:30 GMT", "2024-03-05T10:20:30.000Z"],
      ["Mar 5, 2024 3:15 PM", "2024-03-05T15:15:00.000Z"],
      ["1709634030", "2024-03-05T10:20:30.000Z"],
      ["1709634030000", "2024-03-05T10:20:30.000Z"],
      [" 2024-03-05 ", "2024-03-05T00:00:00.000Z"],
    ];
    for (const [input, expected] of cases) assert.equal(date(input), expected, input);
  });

  it("rejects values that are not plausible publication dates", () => {
    for (const input of ["", "yesterday", "2024-02-30", "2023-02-29", "2024-13-01", "2024-00-10", "2024-03-05T25:00", "1899-12-31", "0001-01-01", "2999-01-01", "Smarch 5, 2024", "12/03/2024"]) {
      assert.equal(date(input), null, input);
    }
    assert.equal(date("2024-02-29"), "2024-02-29T00:00:00.000Z");
  });

  it("accepts dates up to a year ahead, not beyond", () => {
    assert.equal(date(isoInDays(30)), `${isoInDays(30)}T00:00:00.000Z`);
    assert.equal(date(isoInDays(400)), null);
  });

  it("follows the source order", () => {
    const sources = [
      `<meta property="article:published_time" content="2020-01-01">`,
      `<meta name="citation_publication_date" content="2020/02/02">`,
      `<meta name="citation_date" content="2020/03/03">`,
      `<meta name="citation_online_date" content="2020/04/04">`,
      `<script type="application/ld+json">{"@type":"Article","datePublished":"2020-05-05"}</script>`,
      `<meta name="dc.date" content="2020-06-06">`,
      `<meta name="dcterms.created" content="2020-07-07">`,
      `<meta name="parsely-pub-date" content="2020-08-08">`,
      `<meta name="sailthru.date" content="2020-09-09 10:00:00">`,
      `<meta name="pubdate" content="2020-10-10">`,
      `<meta name="date" content="2020-11-11">`,
    ];
    const expected = ["01-01", "02-02", "03-03", "04-04", "05-05", "06-06", "07-07", "08-08", "09-09", "10-10", "11-11"];
    expected.forEach((day, index) => assert.ok(meta(sources.slice(index).join("")).publishedAt?.startsWith(`2020-${day}`), day));
  });

  it("skips an unusable value in favour of the next source", () => {
    assert.equal(
      meta(`<meta property="article:published_time" content="soon"><meta name="citation_date" content="2019/06/12">`).publishedAt,
      "2019-06-12T00:00:00.000Z",
    );
  });

  it("falls back to the first <time datetime> inside an article", () => {
    const body = `<p><time datetime="2001-01-01">old</time></p><article><h1>Post</h1><time>no attribute</time><time datetime="2021-04-05T09:00:00Z">April 5</time></article>`;
    assert.equal(meta("", body).publishedAt, "2021-04-05T09:00:00.000Z");
    assert.equal(meta("", `<p><time datetime="2001-01-01">outside</time></p>`).publishedAt, null);
  });
});

describe("extractMetadata: canonical URL", () => {
  const url = "https://www.example.com/blog/post?utm_source=x";

  it("resolves <link rel=canonical> against the page", () => {
    assert.equal(extractMetadata(page(`<link rel="canonical" href="/blog/post">`), url).canonicalUrl, "https://www.example.com/blog/post");
    assert.equal(extractMetadata(page(`<link rel="Canonical" href="other">`), url).canonicalUrl, "https://www.example.com/blog/other");
    assert.equal(extractMetadata(page(`<link href="//cdn.example.com/p" rel="alternate canonical">`), url).canonicalUrl, "https://cdn.example.com/p");
  });

  it("honours <base href>", () => {
    assert.equal(
      extractMetadata(page(`<base href="https://static.example.com/root/"><link rel="canonical" href="post">`), url).canonicalUrl,
      "https://static.example.com/root/post",
    );
  });

  it("falls back to og:url", () => {
    assert.equal(extractMetadata(page(`<meta property="og:url" content="https://example.com/canonical">`), url).canonicalUrl, "https://example.com/canonical");
    assert.equal(
      extractMetadata(page(`<link rel="canonical" href="javascript:alert(1)"><meta property="og:url" content="/from-og">`), url).canonicalUrl,
      "https://www.example.com/from-og",
    );
  });

  it("accepts only http(s)", () => {
    assert.equal(extractMetadata(page(`<link rel="canonical" href="ftp://example.com/x">`), url).canonicalUrl, null);
    assert.equal(extractMetadata(page(`<link rel="canonical" href="mailto:a@example.com">`), url).canonicalUrl, null);
    assert.equal(extractMetadata(page(`<link rel="canonical" href="">`), url).canonicalUrl, null);
    assert.equal(extractMetadata(page(""), url).canonicalUrl, null);
  });

  it("works with an absolute canonical even when the page URL is unusable", () => {
    assert.equal(extractMetadata(page(`<link rel="canonical" href="https://example.com/a">`), "not a url").canonicalUrl, "https://example.com/a");
    assert.equal(extractMetadata(page(`<link rel="canonical" href="/a">`), "not a url").canonicalUrl, null);
  });
});

describe("extractMetadata: JSON-LD", () => {
  const ld = (json: string) => `<script type="application/ld+json">${json}</script>`;

  it("skips invalid blocks and reads the valid ones", () => {
    const result = meta(ld(`{"@type":"Article","headline":"Broken",}`) + ld(`{"@type":"Article","headline":"Valid"}`));
    assert.equal(result.title, "Valid");
  });

  it("tolerates raw line breaks inside strings, and comment wrappers", () => {
    assert.equal(meta(ld(`{"@type":"Article","headline":"Line\none"}`)).title, "Line one");
    assert.equal(meta(ld(`<!--{"@type":"Article","headline":"Wrapped"}-->`)).title, "Wrapped");
  });

  it("walks @graph, top-level arrays and mainEntity", () => {
    assert.equal(meta(ld(`[{"@type":"Organization","name":"Org"},{"@type":"Article","headline":"In array"}]`)).title, "In array");
    assert.equal(meta(ld(`{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"Site"},{"@type":"Article","headline":"In graph"}]}`)).title, "In graph");
    assert.equal(meta(ld(`{"@type":"WebPage","mainEntity":{"@type":"Article","headline":"Main entity"}}`)).title, "Main entity");
  });

  it("prefers article types over web pages, in the documented order", () => {
    assert.equal(meta(ld(`[{"@type":"WebPage","name":"Page"},{"@type":"Report","headline":"Report"}]`)).title, "Report");
    assert.equal(meta(ld(`[{"@type":"TechArticle","headline":"Tech"},{"@type":"NewsArticle","headline":"News"}]`)).title, "News");
    assert.equal(meta(ld(`[{"@type":"BlogPosting","headline":"Blog"},{"@type":"Article","headline":"Article"}]`)).title, "Article");
  });

  it("understands @type arrays and full schema.org URLs", () => {
    assert.equal(meta(ld(`{"@type":["CreativeWork","NewsArticle"],"headline":"Multi"}`)).title, "Multi");
    assert.equal(meta(ld(`{"@type":"http://schema.org/BlogPosting","headline":"Full URL"}`)).title, "Full URL");
  });

  it("reads keywords as a string or a list", () => {
    assert.deepEqual(meta(ld(`{"@type":"Article","keywords":"Ships, Ports ,Trade"}`)).keywords, ["Ships", "Ports", "Trade"]);
    assert.deepEqual(meta(ld(`{"@type":"Article","keywords":["Ships","Ports"]}`)).keywords, ["Ships", "Ports"]);
  });
});

describe("extractMetadata: language and type", () => {
  it("normalizes <html lang>", () => {
    assert.equal(extractMetadata(`<html lang="EN_us"><p>x</p></html>`, "https://e.com/").lang, "en-us");
    assert.equal(extractMetadata(`<html lang="zh-Hant-TW"></html>`, "https://e.com/").lang, "zh-hant-tw");
    assert.equal(extractMetadata(`<html lang="english please"></html>`, "https://e.com/").lang, null);
  });

  it("falls back to og:locale and Content-Language", () => {
    assert.equal(extractMetadata(`<html lang=""><meta property="og:locale" content="fr_FR"></html>`, "https://e.com/").lang, "fr-fr");
    assert.equal(extractMetadata(`<meta http-equiv="Content-Language" content="de, en">`, "https://e.com/").lang, "de");
    assert.equal(extractMetadata(`<p>none</p>`, "https://e.com/").lang, null);
  });

  it("reads og:type", () => {
    assert.equal(meta(`<meta property="og:type" content="Video.Movie">`).type, "video.movie");
    assert.equal(meta("").type, null);
  });
});

describe("extractMetadata: reading time and excerpt", () => {
  it("counts the main content at 230 words a minute", () => {
    const result = meta("", `<article><p>${words(2300)}</p></article>`);
    assert.equal(result.wordCount, 2300);
    assert.equal(result.readingMinutes, 10);
  });

  it("never reports less than a minute for a real text", () => {
    const result = meta("", `<p>${words(130)}</p>`);
    assert.equal(result.wordCount, 130);
    assert.equal(result.readingMinutes, 1);
  });

  it("does not guess below about 120 words", () => {
    const result = meta("", `<p>${words(100)}</p>`);
    assert.equal(result.wordCount, null);
    assert.equal(result.readingMinutes, null);
    assert.ok(result.excerpt?.startsWith("the harbor council"));
  });

  it("reads Chinese and Japanese at 500 characters a minute", () => {
    const text = "東京の小さな本屋が守り続けるもの。".repeat(100); // 1,600 characters and 100 full stops
    const result = meta("", `<article><p>${text}</p></article>`);
    assert.equal(result.wordCount, 1600);
    assert.equal(result.readingMinutes, 3);
  });

  it("prefers the largest article", () => {
    const body = `<article><p>${words(40)}</p></article><article><p>${words(500)}</p></article><article><p>${words(60)}</p></article>`;
    assert.equal(meta("", body).wordCount, 500);
  });

  it("treats a short article as a teaser rather than counting the page around it", () => {
    const body = `<article><p>${words(60)}</p><p>Subscribe to keep reading.</p></article><div class="related">${words(600)}</div>`;
    const result = meta("", body);
    assert.equal(result.wordCount, null);
    assert.equal(result.readingMinutes, null);
    assert.ok(result.excerpt?.includes("Subscribe to keep reading."));
  });

  it("uses <main> when there is no article, and the body without its furniture otherwise", () => {
    const furniture = `<header>${words(50)}</header><nav>${words(50)}</nav><aside>${words(200)}</aside><footer>${words(200)}</footer>`;
    assert.equal(meta("", `${furniture}<main><p>${words(300)}</p></main><div>${words(100)}</div>`).wordCount, 300);
    assert.equal(meta("", `${furniture}<div><p>${words(300)}</p></div>`).wordCount, 300);
    assert.equal(meta("", `${furniture}<main><p>${words(30)}</p></main><div>${words(200)}</div>`).wordCount, 230);
  });

  it("keeps the excerpt within 4,000 characters", () => {
    const excerpt = meta("", `<article><p>${words(3000)}</p></article>`).excerpt ?? "";
    assert.ok(excerpt.length > 3500 && excerpt.length <= 4000);
    assert.ok(excerpt.endsWith("…"));
  });
});

describe("extractMetadata: keywords", () => {
  it("collects article:tag, JSON-LD, news_keywords and keywords in that order, without duplicates", () => {
    const head =
      `<meta property="article:tag" content="Shipping"><meta property="article:tag" content="Ports">` +
      `<script type="application/ld+json">{"@type":"Article","keywords":["ports","Trade"]}</script>` +
      `<meta name="news_keywords" content="Economy; Shipping">` +
      `<meta name="keywords" content="logistics, https://example.com/tag, , 1234, ${"x".repeat(80)}">`;
    assert.deepEqual(meta(head).keywords, ["Shipping", "Ports", "Trade", "Economy", "logistics"]);
  });

  it("keeps at most twelve", () => {
    const head = `<meta name="keywords" content="${Array.from({ length: 30 }, (_, index) => `topic ${index}`).join(", ")}">`;
    assert.equal(meta(head).keywords.length, 12);
  });
});

describe("extractMetadata: interstitials", () => {
  const blocked = (html: string) => extractMetadata(html, "https://www.example.com/story").blocked;

  it("recognises common bot checks and access-denied pages", () => {
    assert.equal(blocked(page(`<title>Attention Required! | Cloudflare</title>`, `<h1>Sorry, you have been blocked</h1><p>You are unable to access example.com</p>`)), true);
    assert.equal(blocked(page(`<title>Access Denied</title>`, `<h1>Access Denied</h1>You don't have permission to access "http://www.example.com/story" on this server.<p>Reference #18.2f3c1002.1715694200.5a1b2c3</p>`)), true);
    assert.equal(blocked(page(`<title>Access to this page has been denied</title>`, `<div id="px-captcha"></div><p>Press &amp; Hold to confirm you are a human (and not a bot).</p>`)), true);
    assert.equal(blocked(page(`<title>example.com</title>`, `<iframe src="https://geo.captcha-delivery.com/captcha/?initialCid=AHrlqAAA"></iframe>`)), true);
    assert.equal(blocked(page(`<title>Pardon Our Interruption</title>`, `<p>As you were browsing something about your browser made us think you were a bot.</p>`)), true);
    assert.equal(blocked(page(`<title>Are you a robot?</title>`, `<p>Please verify you are a human.</p>`)), true);
    assert.equal(blocked(page(`<title>Robot or human?</title>`, `<p>Activate and hold the button to confirm that you’re human.</p>`)), true);
    assert.equal(blocked(page(`<title>www.example.com</title>`, `<noscript>Enable JavaScript and cookies to continue</noscript>`)), true);
    assert.equal(blocked(page(`<title>Sorry...</title>`, `<p>Our systems have detected unusual traffic from your computer network.</p>`)), true);
    assert.equal(blocked(page(`<title></title>`, `<iframe src="/_Incapsula_Resource?CWUDNSAI=9">Request unsuccessful. Incapsula incident ID: 1234</iframe>`)), true);
  });

  it("returns no title or description for an interstitial", () => {
    const result = extractMetadata(page(`<title>Just a moment...</title><meta property="og:title" content="Leaked">`, ""), "https://e.com/");
    assert.equal(result.blocked, true);
    assert.equal(result.title, null);
    assert.equal(result.description, null);
  });

  it("does not flag real pages that merely mention or load the same things", () => {
    const article = `<article><p>${words(400)}</p><p>Just a moment, said the clerk. Access denied, again.</p></article>`;
    assert.equal(blocked(page(`<title>Access Denied: Inside the Fight Over Library Records</title>`, article)), false);
    assert.equal(blocked(page(`<title>Story</title><script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>`, article)), false);
    assert.equal(blocked(page(`<title>App</title><script src="https://js.datadome.co/tags.js"></script>`, `<div id="root"></div>`)), false);
    assert.equal(blocked(page(`<title>Sign up</title>`, `<form><div class="g-recaptcha"></div><button>Create account</button></form>`)), false);
    const strings = `<script>window.i18n = {"captcha.title": "Verify you are human", "captcha.hint": "Checking your browser before accessing"};</script>`;
    assert.equal(blocked(page(`<title>Tessellate</title>${strings}`, `<div id="root"></div>`)), false);
  });
});

describe("extractMetadata: robustness", () => {
  it("never throws, whatever the input", () => {
    const inputs: unknown[] = [
      "",
      " ",
      "<",
      "<!--",
      "<html",
      "<<<<>>>>",
      `<meta content="unterminated`,
      `<title>unclosed`,
      `<script type="application/ld+json">{"@graph":[[[[[[[[[[[[[[[[[[[[{"@type":"Article"}]]]]]]]]]]]]]]]]]]]}</script>`,
      `<script type="application/ld+json">{"@type":"Article","author":${"[".repeat(5000)}${"]".repeat(5000)}}</script>`,
      `<script type="application/ld+json">null</script><script type="application/ld+json">"string"</script><script type="application/ld+json">42</script>`,
      "\u0000\u0001\ufffd\ud800<p>\udc00</p>",
      null,
      undefined,
      42,
    ];
    for (const input of inputs) {
      const result = extractMetadata(input as string, "https://example.com/");
      assert.equal(typeof result.blocked, "boolean");
      assert.ok(Array.isArray(result.keywords));
    }
    assert.equal(extractMetadata("<p>x</p>", undefined as unknown as string).title, null);
  });

  it("survives binary garbage", () => {
    let seed = 11;
    let garbage = "";
    for (let index = 0; index < 200_000; index++) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      garbage += String.fromCharCode(seed % 65536);
    }
    const result = extractMetadata(garbage, "https://example.com/");
    assert.equal(result.blocked, false);
  });

  it("survives 3 MB of nested tags, unclosed comments and hostile attributes", () => {
    const hostile = [
      "<div>".repeat(600_000),
      `<p>${words(200)}</p><!--${"x".repeat(3_000_000)}`,
      `<meta property="og:title" content="a > b"><a ${'title=">" '.repeat(100_000)}>`,
      "<article>".repeat(300_000),
      `<meta name="date" content="nope">`.repeat(50_000),
    ];
    for (const html of hostile) {
      const started = performance.now();
      const result = extractMetadata(html, "https://example.com/");
      assert.equal(typeof result.blocked, "boolean");
      assert.ok(performance.now() - started < 3000, "took too long");
    }
    assert.equal(extractMetadata(hostile[2] ?? "", "https://example.com/").title, "a > b");
  });

  it("reads a 1 MB page in well under 200 ms", () => {
    const paragraph = `<p>${words(120)} <a href="/related">a link</a> and <em>emphasis</em>.</p>\n`;
    const chrome = `<div class="ad" data-slot="x"><img src="/ad.png" alt=""><span>Advertisement</span></div>\n<script>window.dataLayer.push({"event":"view","html":"<div>"});</script>\n`;
    let html = `<!doctype html><html lang="en"><head><title>Long Read | Example</title><meta property="og:title" content="Long Read"><style>${"p{margin:0}".repeat(2000)}</style></head><body><nav>${"<a href='/'>Home</a>".repeat(200)}</nav><article>`;
    while (html.length < 1_000_000) html += paragraph + chrome;
    html += "</article><footer>Footer</footer></body></html>";

    extractMetadata(html.slice(0, 50_000), "https://example.com/long-read"); // warm up
    let best = Infinity;
    let result: PageMetadata | null = null;
    for (let run = 0; run < 3; run++) {
      const started = performance.now();
      result = extractMetadata(html, "https://example.com/long-read");
      best = Math.min(best, performance.now() - started);
    }
    assert.ok(best < 200, `took ${best.toFixed(1)} ms`);
    assert.equal(result?.title, "Long Read");
    assert.ok((result?.wordCount ?? 0) > 100_000);
  });
});

describe("metadataFromUrl", () => {
  it("makes a readable title from a file name", () => {
    assert.deepEqual(metadataFromUrl("https://example.com/papers/attention-is-all-you-need.pdf", "application/pdf"), {
      title: "Attention Is All You Need",
    });
    assert.deepEqual(metadataFromUrl("https://example.com/files/Annual_Report_2023_final.PDF", null), { title: "Annual Report 2023 Final" });
    assert.deepEqual(metadataFromUrl("https://example.com/docs/The%20iOS%20Handbook.epub", "application/epub+zip"), { title: "The iOS Handbook" });
    assert.deepEqual(metadataFromUrl("https://example.com/a/b/notes+on+GPT-4.txt?download=1#page=2", "text/plain"), { title: "Notes On GPT 4" });
  });

  it("keeps arXiv identifiers as they are", () => {
    assert.deepEqual(metadataFromUrl("https://arxiv.org/pdf/2401.01234v2.pdf", "application/pdf"), { title: "2401.01234v2" });
    assert.deepEqual(metadataFromUrl("https://arxiv.org/pdf/2401.01234", "application/pdf"), { title: "2401.01234" });
  });

  it("invents nothing when the name says nothing", () => {
    for (const url of [
      "https://example.com/",
      "https://example.com/download",
      "https://example.com/files/download?id=3",
      "https://example.com/view/123456.pdf",
      "https://example.com/d/5f9b2cdef1a84e0b9c3d.pdf",
      "https://example.com/x/a1.pdf",
      "https://cdn.example.com/content/10.1101/2024.01.01.123456v1.full.pdf",
      "not a url",
    ]) {
      assert.deepEqual(metadataFromUrl(url, "application/pdf"), {}, url);
    }
  });

  it("ignores machine formats", () => {
    assert.deepEqual(metadataFromUrl("https://example.com/feeds/latest-essays.xml", "application/rss+xml"), {});
    assert.deepEqual(metadataFromUrl("https://example.com/api/reading-list.json", "application/json; charset=utf-8"), {});
    assert.deepEqual(metadataFromUrl("https://example.com/static/reading-list.js", "text/javascript"), {});
    assert.deepEqual(metadataFromUrl("https://example.com/fonts/literata-regular.woff2", "font/woff2"), {});
  });

  it("still names documents and images whose content types mention XML", () => {
    const docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    assert.deepEqual(metadataFromUrl("https://example.com/shared/quarterly-plan.docx", docx), { title: "Quarterly Plan" });
    assert.deepEqual(metadataFromUrl("https://example.com/img/harbor-map.svg", "image/svg+xml"), { title: "Harbor Map" });
  });

  it("never throws", () => {
    assert.deepEqual(metadataFromUrl(undefined as unknown as string, null), {});
    assert.deepEqual(metadataFromUrl("https://example.com/%E0%A4%A.pdf", null), {});
  });
});
