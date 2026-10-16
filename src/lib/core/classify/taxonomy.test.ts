import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { slugify } from "@/lib/core/slug";

import { cleanTermName, resolveCategories, resolveTags, termKey, validateManualTerm } from "./taxonomy";
import type { Term } from "./taxonomy";

function terms(...names: string[]): Term[] {
  return names.map((name, index) => ({ id: `id-${index + 1}`, name, slug: slugify(name) }));
}

function names(resolved: Array<{ name: string }>): string[] {
  return resolved.map((term) => term.name);
}

describe("cleanTermName", () => {
  const cases: Array<[string, string | null]> = [
    ["Finance", "Finance"],
    ["  finance  ", "Finance"],
    ["venture   capital", "Venture Capital"],
    ["\"Payments\"", "Payments"],
    ["“Design”", "Design"],
    ["'History'", "History"],
    ["#AI", "AI"],
    ["#machine_learning", "Machine Learning"],
    ["- Finance", "Finance"],
    ["• Design", "Design"],
    ["1. Finance", "Finance"],
    ["Finance.", "Finance"],
    ["Payments;", "Payments"],
    ["Engineering!", "Engineering"],
    ["(Payments)", "Payments"],
    ["[Design]", "Design"],
    ["cross-border payments", "Cross-border Payments"],
    ["the future of work", "The Future of Work"],
    ["history of science", "History of Science"],
    ["women's health", "Women's Health"],
    // Acronyms and brands keep (or regain) their casing.
    ["ai", "AI"],
    ["AI", "AI"],
    ["vc funding", "VC Funding"],
    ["iphone", "iPhone"],
    ["iPhone", "iPhone"],
    ["DeFi", "DeFi"],
    ["defi", "DeFi"],
    ["ai-powered tools", "AI-powered Tools"],
    ["ui/ux", "UI/UX"],
    ["covid-19", "COVID-19"],
    ["node.js", "Node.js"],
    ["u.s. politics", "U.S. Politics"],
    ["NASA", "NASA"],
    ["McDonald's", "McDonald's"],
    ["Machine learning", "Machine Learning"],
    ["e-commerce", "E-commerce"],
    // Symbols that are part of the name survive.
    ["C++", "C++"],
    ["C#", "C#"],
    ["R&D", "R&D"],
    ["401(k)", "401(k)"],
    ["3D Printing", "3D Printing"],
    ["1960s", "1960s"],
    ["Économie", "Économie"],
    ["建築", "建築"],
    ["a​i", "AI"],
    // Junk.
    ["", null],
    ["   ", null],
    ["#", null],
    ["—", null],
    ["2024", null],
    ["...", null],
    ["https://example.com/finance", null],
    ["www.example.com", null],
    ["<b>Finance</b>", null],
    ["{\"name\": \"x\"}", null],
    ["a".repeat(41), null],
  ];

  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () => {
      assert.equal(cleanTermName(input), expected);
    });
  }

  it("accepts names up to 40 characters", () => {
    const forty = `Abcdefghij K${"k".repeat(28)}`;
    assert.equal(forty.length, 40);
    assert.equal(cleanTermName(forty), forty);
  });

  it("tolerates non-string input at runtime", () => {
    assert.equal(cleanTermName(42 as unknown as string), null);
    assert.equal(cleanTermName(null as unknown as string), null);
  });
});

describe("termKey", () => {
  const same: Array<[string, string]> = [
    ["Payments", "Payment"],
    ["payments", "PAYMENTS"],
    ["Venture Capital", "venture-capital"],
    ["AI", "Artificial Intelligence"],
    ["ai", "artificial intelligence"],
    ["AI Ethics", "Artificial Intelligence Ethics"],
    ["ML", "Machine Learning"],
    ["VC", "Venture Capital"],
    ["VCs", "Venture Capital"],
    ["Automotive", "Automobiles"],
    ["Automotive", "Cars"],
    ["Car", "Cars"],
    ["Car Design", "Automotive Design"],
    ["Crypto", "Cryptocurrency"],
    ["Crypto", "Cryptocurrencies"],
    ["Tech", "Technology"],
    ["Technologies", "Technology"],
    ["Tech Policy", "Technology Policy"],
    ["Startup", "Startups"],
    ["Start-ups", "Startups"],
    ["Econ", "Economics"],
    ["Economy", "Economics"],
    ["UX", "User Experience"],
    ["UX Design", "User Experience Design"],
    ["LLMs", "Large Language Models"],
    ["E-commerce", "Ecommerce"],
    ["Health Care", "Healthcare"],
    ["Movies", "Film"],
    ["Films", "Film"],
    ["Maths", "Mathematics"],
    ["TV", "Television"],
    ["Companies", "Company"],
    ["Strategies", "Strategy"],
    ["Approaches", "Approach"],
    ["Niches", "Niche"],
    ["Classes", "Class"],
    ["Taxes", "Tax"],
    ["Photos", "Photo"],
    ["Engines", "Engine"],
    ["Stablecoins", "Stablecoin"],
    ["Cross-border Payments", "Cross-Border Payment"],
    ["APIs", "API"],
    ["KPIs", "KPI"],
  ];
  for (const [a, b] of same) {
    it(`merges ${a} and ${b}`, () => {
      assert.equal(termKey(a), termKey(b));
      assert.notEqual(termKey(a), "");
    });
  }

  const different: Array<[string, string]> = [
    ["Finance", "Fintech"],
    ["Finance", "Banking"],
    ["Fintech", "Banking"],
    ["Design", "Industrial Design"],
    ["Engineering", "Software Engineering"],
    ["Economics", "Finance"],
    ["Security", "Securities"],
    ["Future", "Futures"],
    ["Glass", "Glasses"],
    ["Window", "Windows"],
    ["Humanity", "Humanities"],
    ["Cryptography", "Cryptocurrency"],
    ["Attention Economy", "Attention Economics"],
    ["Medical Coding", "Medical Programming"],
    ["AI", "AR"],
    ["1990s", "1990"],
    ["Art", "Arts Policy"],
  ];
  for (const [a, b] of different) {
    it(`keeps ${a} and ${b} apart`, () => {
      assert.notEqual(termKey(a), termKey(b));
    });
  }

  it("leaves words that only look plural alone", () => {
    assert.equal(termKey("Economics"), "economics");
    assert.equal(termKey("Analysis"), "analysis");
    assert.equal(termKey("Bus"), "bus");
    assert.equal(termKey("Glass"), "glass");
    assert.equal(termKey("News"), "news");
    assert.equal(termKey("Series"), "series");
    assert.equal(termKey("Physics"), "physics");
    assert.equal(termKey("Chaos Engineering"), "chaos-engineering");
  });

  it("returns an empty key when there is nothing to key on", () => {
    assert.equal(termKey(""), "");
    assert.equal(termKey("   "), "");
  });

  it("gives non-Latin names a stable key", () => {
    assert.equal(termKey("建築"), termKey("建築"));
    assert.notEqual(termKey("建築"), termKey("時計"));
  });
});

describe("resolveCategories", () => {
  const library = terms(
    "Finance",
    "Payments",
    "Artificial Intelligence",
    "Design",
    "History",
    "Cars",
    "Behaviour",
    "E-commerce",
    "Economics",
  );

  it("reuses existing categories and keeps their names", () => {
    const resolved = resolveCategories(["finance", "Payments"], library);
    assert.deepEqual(resolved, [
      { name: "Finance", slug: "finance", existingId: "id-1" },
      { name: "Payments", slug: "payments", existingId: "id-2" },
    ]);
  });

  it("folds near-duplicates into the existing category", () => {
    const cases: Array<[string, string]> = [
      ["Payment", "Payments"],
      ["AI", "Artificial Intelligence"],
      ["Artificial intelligence", "Artificial Intelligence"],
      ["Automotive", "Cars"],
      ["Automobiles", "Cars"],
      ["Behavior", "Behaviour"],
      ["Ecommerce", "E-commerce"],
      ["Economy", "Economics"],
      ["Economic", "Economics"],
      ["Histories", "History"],
    ];
    for (const [proposal, existing] of cases) {
      const [resolved] = resolveCategories([proposal], library);
      assert.ok(resolved, proposal);
      assert.equal(resolved.name, existing, proposal);
      assert.notEqual(resolved.existingId, null, proposal);
    }
  });

  it("folds spelling variants but not different words one letter apart", () => {
    const existing = terms("Organisation", "Travelling", "Defence", "Theatre", "Painting", "Fiction", "Banking", "Typography");
    const reuse = (name: string) => resolveCategories([name], existing, { maxNew: 1 })[0];
    assert.equal(reuse("Organization")?.name, "Organisation");
    assert.equal(reuse("Traveling")?.name, "Travelling");
    assert.equal(reuse("Defense")?.name, "Defence");
    assert.equal(reuse("Theater")?.name, "Theatre");
    assert.deepEqual(reuse("Printing"), { name: "Printing", slug: "printing", existingId: null });
    assert.equal(reuse("Friction")?.existingId, null);
    assert.equal(reuse("Ranking")?.existingId, null);
    assert.equal(reuse("Topography")?.existingId, null);
  });

  it("does not merge genuinely different subjects", () => {
    const existing = terms("Finance", "Design", "Engineering", "Security");
    const resolved = resolveCategories(["Fintech", "Industrial Design", "Software Engineering"], existing, {
      maxNew: 3,
    });
    assert.deepEqual(names(resolved), ["Fintech", "Industrial Design", "Software Engineering"]);
    assert.ok(resolved.every((term) => term.existingId === null));
    assert.equal(resolveCategories(["Securities"], existing)[0]?.existingId, null);
  });

  it("drops junk and generic names", () => {
    const junk = [
      "General",
      "Misc",
      "Miscellaneous",
      "Other",
      "Uncategorized",
      "Article",
      "Articles",
      "News",
      "Blog",
      "Interesting",
      "Read Later",
      "Web",
      "Internet",
      "Bookmarks",
      "",
      "   ",
    ];
    assert.deepEqual(resolveCategories(junk, [], { maxNew: 20, maxTotal: 20 }), []);
  });

  it("keeps a generic name the user already uses as a category", () => {
    const resolved = resolveCategories(["News", "Misc"], terms("News", "Misc"));
    assert.deepEqual(names(resolved), ["News"]);
  });

  it("drops new categories that are too specific", () => {
    const resolved = resolveCategories(
      ["Air-Cooled Porsche Engine Design", "The Economics of Stablecoin Regulation", "Engineering"],
      [],
      { maxNew: 3 },
    );
    assert.deepEqual(names(resolved), ["Engineering"]);
  });

  it("accepts new names of up to 3 words and 32 characters", () => {
    assert.deepEqual(names(resolveCategories(["Science Fiction Literature"], [])), ["Science Fiction Literature"]);
    assert.deepEqual(resolveCategories(["Interdisciplinary Neuroeconomics"], []), [
      { name: "Interdisciplinary Neuroeconomics", slug: "interdisciplinary-neuroeconomics", existingId: null },
    ]);
    assert.deepEqual(resolveCategories(["Interdisciplinary Neuroeconomicss"], []), []);
  });

  it("creates at most one new category in an established library", () => {
    const established = terms("Finance", "Design", "History", "Science", "Politics", "Music", "Travel", "Food");
    const resolved = resolveCategories(["Payments", "Cryptography", "Finance"], established);
    assert.deepEqual(names(resolved), ["Payments", "Finance"]);
    assert.equal(resolved[0]?.existingId, null);
  });

  it("allows two new categories while the library is young", () => {
    const resolved = resolveCategories(["Payments", "Cryptography", "Finance"], terms("Finance"));
    assert.deepEqual(names(resolved), ["Payments", "Cryptography", "Finance"]);
  });

  it("respects maxTotal and maxNew", () => {
    const proposals = ["Finance", "Payments", "Design", "History"];
    assert.deepEqual(names(resolveCategories(proposals, library)), ["Finance", "Payments", "Design"]);
    assert.deepEqual(names(resolveCategories(proposals, library, { maxTotal: 1 })), ["Finance"]);
    assert.deepEqual(names(resolveCategories(["Payments", "Opera"], [], { maxNew: 0 })), []);
    assert.deepEqual(names(resolveCategories(["Opera", "Ballet", "Jazz"], [], { maxNew: 5 })), ["Opera", "Ballet", "Jazz"]);
    assert.deepEqual(resolveCategories(["Finance"], library, { maxTotal: 0 }), []);
  });

  it("preserves the model's order and removes duplicates", () => {
    const resolved = resolveCategories(["Design", "AI", "Artificial Intelligence", "design", "Finance"], library);
    assert.deepEqual(names(resolved), ["Design", "Artificial Intelligence", "Finance"]);
  });

  it("removes duplicates among new categories", () => {
    const resolved = resolveCategories(["Stablecoins", "stablecoin", "Opera"], []);
    assert.deepEqual(names(resolved), ["Stablecoins", "Opera"]);
  });

  it("cleans new names before creating them", () => {
    assert.deepEqual(resolveCategories(["  #machine_learning. "], []), [
      { name: "Machine Learning", slug: "machine-learning", existingId: null },
    ]);
  });

  it("handles a large library", () => {
    const big = terms(...Array.from({ length: 400 }, (_, index) => `Subject ${index}`), "Payments");
    const resolved = resolveCategories(["Payment", "Subject 12"], big);
    assert.deepEqual(names(resolved), ["Payments", "Subject 12"]);
  });
});

describe("resolveTags", () => {
  it("reuses existing tags by key and keeps new specific tags", () => {
    const existing = terms("Stablecoins", "Porsche");
    const resolved = resolveTags(["stablecoin", "Cross-border Payments", "Financial Infrastructure"], existing);
    assert.deepEqual(resolved, [
      { name: "Stablecoins", slug: "stablecoins", existingId: "id-1" },
      { name: "Cross-border Payments", slug: "cross-border-payments", existingId: null },
      { name: "Financial Infrastructure", slug: "financial-infrastructure", existingId: null },
    ]);
  });

  it("drops tags that repeat a chosen category", () => {
    const resolved = resolveTags(["Payments", "Payment", "Stablecoins", "finance"], [], {
      exclude: ["Finance", "Payments"],
    });
    assert.deepEqual(names(resolved), ["Stablecoins"]);
  });

  it("allows up to 4 words and 40 characters", () => {
    assert.deepEqual(names(resolveTags(["Air-Cooled Flat-Six Engine Design"], [])), ["Air-Cooled Flat-Six Engine Design"]);
    assert.deepEqual(resolveTags(["The History of Air-Cooled Porsche Engines"], []), []);
    assert.deepEqual(resolveTags(["Supercalifragilisticexpialidocious Tooling"], []), []);
  });

  it("caps the count at 6 by default", () => {
    const proposals = ["One Tag", "Two Tag", "Three Tag", "Four Tag", "Five Tag", "Six Tag", "Seven Tag", "Eight Tag"];
    assert.equal(resolveTags(proposals, []).length, 6);
    assert.equal(resolveTags(proposals, [], { max: 2 }).length, 2);
  });

  it("removes junk and duplicates", () => {
    const resolved = resolveTags(["Misc", "Porsche", "porsche", "#Porsche", "Article", "Engines", "Engine"], []);
    assert.deepEqual(names(resolved), ["Porsche", "Engines"]);
  });
});

describe("validateManualTerm", () => {
  it("accepts a name and keeps the user's casing", () => {
    assert.deepEqual(validateManualTerm("  machine   learning "), { ok: true, name: "machine learning", slug: "machine-learning" });
    assert.deepEqual(validateManualTerm("iOS"), { ok: true, name: "iOS", slug: "ios" });
    assert.deepEqual(validateManualTerm("C#"), { ok: true, name: "C#", slug: "c-sharp" });
    assert.deepEqual(validateManualTerm("建築"), { ok: true, name: "建築", slug: slugify("建築") });
  });

  it("allows up to 60 characters", () => {
    assert.equal(validateManualTerm("a".repeat(60)).ok, true);
    const tooLong = validateManualTerm("a".repeat(61));
    assert.equal(tooLong.ok, false);
    if (!tooLong.ok) assert.equal(tooLong.error, "Names can be up to 60 characters.");
  });

  it("explains what is missing, calmly", () => {
    for (const [input, error] of [
      ["", "Enter a name."],
      ["   ", "Enter a name."],
      ["​", "Enter a name."],
      ["—", "Use at least one letter or number."],
      ["!!!", "Use at least one letter or number."],
    ] as const) {
      const result = validateManualTerm(input);
      assert.equal(result.ok, false, input);
      if (!result.ok) {
        assert.equal(result.error, error, input);
        assert.doesNotMatch(result.error, /!|oops/i);
      }
    }
    assert.equal(validateManualTerm(undefined as unknown as string).ok, false);
  });
});
