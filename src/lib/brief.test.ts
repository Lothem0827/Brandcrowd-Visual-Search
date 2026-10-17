import { describe, expect, it } from "vitest";
import fixture from "../../tests/fixtures/templates.fixture.json";
import { parseTemplates } from "./schema";
import { deltaE, hexToHsv } from "./color";
import { generateBrief, MAX_BRIEF_OPTIONS } from "./brief";

const { templates } = parseTemplates(fixture);

const construction = templates.filter((t) => t.industry === "Construction");
const constructionTags = new Set(construction.flatMap((t) => t.tags.map((tag) => tag.toLowerCase())));
const existingTitles = new Set(
  templates.flatMap((t) => [t.name.toLowerCase(), t.displayTitle.toLowerCase()]),
);

const hueGap = (a: string, b: string) => {
  const d = Math.abs(hexToHsv(a).h - hexToHsv(b).h) % 360;
  return d > 180 ? 360 - d : d;
};

describe("generateBrief", () => {
  it("resolves an exact industry and reports how many designs it used", () => {
    const brief = generateBrief(templates, "Construction");
    expect(brief?.match).toEqual({
      kind: "industry",
      label: "Construction",
      templates: construction.length,
    });
    expect(brief?.tags).toHaveLength(6);
  });

  it("resolves extra words around the industry", () => {
    expect(generateBrief(templates, "construction company")?.match.label).toBe("Construction");
    expect(generateBrief(templates, "  CONSTRUCTION  ")?.match.label).toBe("Construction");
  });

  it("accepts either half of a paired industry label", () => {
    expect(generateBrief(templates, "food")?.match.label).toBe("Food & Drink");
    expect(generateBrief(templates, "drink")?.match.label).toBe("Food & Drink");
    expect(generateBrief(templates, "food & drink")?.match.label).toBe("Food & Drink");
  });

  it("builds three distinct, valid palette colours in role order", () => {
    const brief = generateBrief(templates, "Construction");
    expect(brief?.palette.map((c) => c.role)).toEqual(["main", "secondary", "accent"]);
    expect(new Set(brief?.palette.map((c) => c.hex)).size).toBe(3);
    for (const color of brief?.palette ?? []) {
      expect(color.hex).toMatch(/^#[0-9A-F]{6}$/);
      expect(color.name.length).toBeGreaterThan(0);
    }
    expect(brief?.anchor.hex).toMatch(/^#[0-9A-F]{6}$/);
    expect(brief?.anchor.share).toBeGreaterThan(0);
    expect(brief?.anchor.share).toBeLessThanOrEqual(1);
  });

  it("returns only common tags that really appear in the slice", () => {
    const brief = generateBrief(templates, "Construction");
    expect(brief?.tags).toHaveLength(6);
    expect(new Set(brief?.tags).size).toBe(6);
    for (const tag of brief?.tags ?? []) expect(constructionTags.has(tag)).toBe(true);
    expect(brief?.tags).toContain("construction");
  });

  it("generates titles that are about the industry and do not already exist", () => {
    const brief = generateBrief(templates, "Construction");
    expect(brief?.titles.length).toBeGreaterThan(0);
    expect(brief?.title).toBe(brief?.titles[0]);
    for (const title of brief?.titles ?? []) {
      expect(title.toLowerCase()).toContain("construction");
      expect(existingTitles.has(title.toLowerCase())).toBe(false);
    }
    expect(new Set(brief?.titles.map((t) => t.toLowerCase())).size).toBe(brief?.titles.length);
  });

  it("is deterministic", () => {
    expect(generateBrief(templates, "Construction")).toEqual(generateBrief(templates, "Construction"));
  });

  it("falls back to tag matching when the query is not an industry", () => {
    const brief = generateBrief(templates, "coffee");
    expect(brief?.match.kind).toBe("tag");
    expect(brief?.match.label).toBe("coffee");
    expect(brief?.tags).toContain("coffee");
    expect(brief?.titles.every((title) => title.toLowerCase().includes("coffee"))).toBe(true);
  });

  it("returns null when nothing matches or the query is empty", () => {
    expect(generateBrief(templates, "zzzzxq")).toBeNull();
    expect(generateBrief(templates, "   ")).toBeNull();
    expect(generateBrief([], "Construction")).toBeNull();
  });

  it("aliases the first option for single-option callers", () => {
    const brief = generateBrief(templates, "Construction");
    expect(brief?.options).toHaveLength(1);
    expect(brief?.palette).toBe(brief?.options[0].palette);
    expect(brief?.anchor).toBe(brief?.options[0].anchor);
    expect(brief?.title).toBe(brief?.options[0].title);
  });

  it("offers visibly different palettes with their own titles", () => {
    const brief = generateBrief(templates, "Construction", 3);
    const options = brief?.options ?? [];
    expect(options.length).toBeGreaterThan(0);
    expect(options.length).toBeLessThanOrEqual(MAX_BRIEF_OPTIONS);

    // Every card is a complete, valid palette in role order.
    for (const option of options) {
      expect(option.palette.map((c) => c.role)).toEqual(["main", "secondary", "accent"]);
      expect(new Set(option.palette.map((c) => c.hex)).size).toBe(3);
      for (const color of option.palette) expect(color.hex).toMatch(/^#[0-9A-F]{6}$/);
    }

    // Distinct mains, distinct titles, and no repeated title text.
    for (let i = 0; i < options.length; i++) {
      for (let j = i + 1; j < options.length; j++) {
        expect(deltaE(options[i].palette[0].hex, options[j].palette[0].hex)).toBeGreaterThanOrEqual(
          0.1,
        );
        expect(options[i].title).not.toBe(options[j].title);
      }
    }
  });

  it("keeps palettes saturated", () => {
    const brief = generateBrief(templates, "Construction", 3);
    for (const option of brief?.options ?? []) {
      const [main, secondary, accent] = option.palette;
      expect(hexToHsv(main.hex).s).toBeGreaterThanOrEqual(0.62);
      expect(hexToHsv(secondary.hex).s).toBeGreaterThanOrEqual(0.52);
      expect(hexToHsv(accent.hex).s).toBeGreaterThanOrEqual(0.72);
    }
  });

  it("pairs a saturated analogous secondary with a near-complementary accent", () => {
    const brief = generateBrief(templates, "Construction", 3);
    for (const option of brief?.options ?? []) {
      const [main, secondary, accent] = option.palette;
      const secondaryGap = hueGap(main.hex, secondary.hex);
      expect(secondaryGap).toBeGreaterThanOrEqual(20);
      expect(secondaryGap).toBeLessThanOrEqual(55);
      expect(hueGap(main.hex, accent.hex)).toBeGreaterThanOrEqual(150);
    }
  });

  it("shares one tag list across every option", () => {
    const single = generateBrief(templates, "Construction", 1);
    const many = generateBrief(templates, "Construction", 3);
    expect(many?.tags).toEqual(single?.tags);
    expect(many?.tags).toHaveLength(6);
    for (const tag of many?.tags ?? []) expect(constructionTags.has(tag)).toBe(true);
  });

  it("clamps the requested option count into range", () => {
    expect(generateBrief(templates, "Construction", 0)?.options).toHaveLength(1);
    expect(generateBrief(templates, "Construction", -5)?.options).toHaveLength(1);
    expect(generateBrief(templates, "Construction", 99)?.options.length).toBeLessThanOrEqual(
      MAX_BRIEF_OPTIONS,
    );
  });

  it("is deterministic for a given option count", () => {
    expect(generateBrief(templates, "Construction", 3)).toEqual(
      generateBrief(templates, "Construction", 3),
    );
  });
});
