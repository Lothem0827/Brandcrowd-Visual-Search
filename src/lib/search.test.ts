import { describe, expect, it } from "vitest";
import fixture from "../../tests/fixtures/templates.fixture.json";
import { parseTemplates } from "./schema";
import { buildSearchIndex } from "./search";
import { createLocalSearchClient, createSearchClient } from "./search-client";
import {
  IMAGE_BASE,
  imageBaseOrigin,
  normalizeImageBase,
  templateImageUrl,
  templateThumbSmUrl,
  templateThumbUrl,
  withRetry,
} from "./images";

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

  it("reuses the cached result for a repeated query", async () => {
    const client = createLocalSearchClient(() => templates);
    const first = client.search("burger");
    const second = client.search("burger");
    expect(second).toBe(first);
    expect((await first).size).toBeGreaterThan(0);
  });

  it("caches through the worker-less client too", async () => {
    // In this environment there is no Worker, so createSearchClient resolves to the local
    // (cached) client; the same query must not be recomputed.
    const client = createSearchClient({ dataUrl: "/data/templates.json", getTemplates: () => templates });
    const first = client.search("burger");
    const second = client.search(" burger ");
    expect(second).toBe(first);
    expect((await first).size).toBeGreaterThan(0);
    client.dispose();
  });
});

describe("template image URLs", () => {
  const id = "31347748-881c-4053-a849-18ccd44709ed";
  it("defaults to self-hosted /images/<templateId>.webp", () => {
    expect(IMAGE_BASE).toBe("/images");
    expect(templateImageUrl(id)).toBe(`/images/${id}.webp`);
  });
  it("uses a configurable base (e.g. Cloudflare R2), ignoring trailing slashes", () => {
    expect(templateImageUrl(id, "https://img.example.com/templates/")).toBe(`https://img.example.com/templates/${id}.webp`);
    expect(templateImageUrl(id, "  ")).toBe(`/images/${id}.webp`);
    expect(normalizeImageBase(undefined)).toBe("/images");
  });
  it("never points at design.com", () => {
    expect(templateImageUrl(id)).not.toMatch(/design\.com/);
  });
  it("reports the origin of an absolute base only", () => {
    expect(imageBaseOrigin("https://img.example.com/templates")).toBe("https://img.example.com");
    expect(imageBaseOrigin("/images")).toBeNull();
    expect(imageBaseOrigin(undefined)).toBeNull();
  });
  it("puts grid thumbnails in thumbs/ under the same base", () => {
    expect(templateThumbUrl(id)).toBe(`/images/thumbs/${id}.webp`);
    expect(templateThumbUrl(id, "https://img.example.com/templates/")).toBe(
      `https://img.example.com/templates/thumbs/${id}.webp`,
    );
  });
  it("puts compact thumbnails in thumbs-sm/ under the same base", () => {
    expect(templateThumbSmUrl(id)).toBe(`/images/thumbs-sm/${id}.webp`);
    expect(templateThumbSmUrl(id, "https://img.example.com/templates/")).toBe(
      `https://img.example.com/templates/thumbs-sm/${id}.webp`,
    );
  });
  it("adds a cache-busting retry counter", () => {
    expect(withRetry("https://a.com/x.png", 0)).toBe("https://a.com/x.png");
    expect(withRetry("https://a.com/x.png", 2)).toBe("https://a.com/x.png?retry=2");
    expect(withRetry("https://a.com/x.png?v=1", 1)).toBe("https://a.com/x.png?v=1&retry=1");
  });
});
