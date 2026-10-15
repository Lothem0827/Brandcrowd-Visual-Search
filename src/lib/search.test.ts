import { describe, expect, it } from "vitest";
import fixture from "../../tests/fixtures/templates.fixture.json";
import { parseTemplates } from "./schema";
import { buildSearchIndex } from "./search";
import { createLocalSearchClient } from "./search-client";
import { smallThumbnail, withRetry } from "./images";

const { templates } = parseTemplates(fixture);
const nameOf = (id: string) => templates.find((t) => t.templateId === id)?.name;

describe("text search", () => {
  const index = buildSearchIndex(templates);

  it("returns nothing for empty or whitespace queries", () => {
    expect(index.search("").size).toBe(0);
    expect(index.search("   ").size).toBe(0);
  });

  it("finds templates by title words, best match first", () => {
    const hits = [...index.search("burger").keys()].map(nameOf);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.slice(0, 2).every((n) => /burger/i.test(n ?? ""))).toBe(true);
  });

  it("tolerates typos and prefixes", () => {
    expect([...index.search("cofee").keys()].map(nameOf)).toContain("Coffee Time");
    expect([...index.search("renov").keys()].map(nameOf)).toContain("House Renovation");
  });

  it("scores full-coverage matches above partial ones (soft-AND)", () => {
    const full = index.search("coffee promo");
    expect([...full.keys()].map(nameOf)[0]).toBe("Coffee Promo");
    // a partial match still surfaces, but strictly weaker than a clean full-coverage search
    const partial = index.search("burger zzqqxxunmatched");
    expect(partial.size).toBeGreaterThan(0);
    const burger = templates.find((t) => t.name === "National Burger Day")!;
    const clean = index.search("burger").get(burger.templateId)!;
    expect(partial.get(burger.templateId) ?? 0).toBeLessThan(clean);
  });

  it("returns no results for nonsense", () => {
    expect(index.search("zzqqxx").size).toBe(0);
  });
});

describe("local search client (worker fallback)", () => {
  it("builds the index lazily on first search", async () => {
    let calls = 0;
    const client = createLocalSearchClient(() => {
      calls++;
      return templates;
    });
    expect(calls).toBe(0);
    const a = await client.search("fitness");
    const b = await client.search("sale");
    expect(calls).toBe(1);
    expect(a.size).toBeGreaterThan(0);
    expect(b.size).toBeGreaterThan(0);
  });
});

describe("thumbnail URLs", () => {
  const big =
    "https://dynamic.design.com/template/preview/design/abc?v=4&designTemplateVersion=1&size=design-preview-tall-2x&layout=auto";
  it("swaps the 600px rendering for the 200px one", () => {
    expect(smallThumbnail(big)).toBe(
      "https://dynamic.design.com/template/preview/design/abc?v=4&designTemplateVersion=1&size=design-preview-tall&layout=auto",
    );
  });
  it("leaves other URLs untouched", () => {
    expect(smallThumbnail("https://example.com/a.png?size=huge")).toBe("https://example.com/a.png?size=huge");
    expect(smallThumbnail("https://dynamic.design.com/x.png")).toBe("https://dynamic.design.com/x.png");
  });
  it("adds a cache-busting retry counter", () => {
    expect(withRetry("https://a.com/x.png", 0)).toBe("https://a.com/x.png");
    expect(withRetry("https://a.com/x.png", 2)).toBe("https://a.com/x.png?retry=2");
    expect(withRetry("https://a.com/x.png?v=1", 1)).toBe("https://a.com/x.png?v=1&retry=1");
  });
});
