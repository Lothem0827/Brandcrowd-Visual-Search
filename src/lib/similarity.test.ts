import { describe, expect, it } from "vitest";
import fixture from "../../tests/fixtures/templates.fixture.json";
import { parseTemplates, type Template } from "./schema";
import {
  colorSimilarity, layoutSimilarity, styleSimilarity, overallSimilarity, findSimilar, findAllSimilar, jaccard, rankByPalette,
} from "./similarity";
import { deltaE, extractPalette, hexToRgb, paletteSimilarity } from "./color";

const { templates } = parseTemplates(fixture);
const bySlug = (s: string) => templates.find((t) => t.slug.startsWith(s)) as Template;
const pro = bySlug("professional-home-construction");
const earth = bySlug("earthworks-construction");
const coffeeTime = bySlug("coffee-time");
const flash = bySlug("flash-sale");

describe("color maths", () => {
  it("deltaE is 0 for identical colours and large for black vs white", () => {
    expect(deltaE("#123456", "#123456")).toBe(0);
    expect(deltaE("#000000", "#FFFFFF")).toBeGreaterThan(0.9);
  });
  it("palette similarity is symmetric-ish and 1 for identical palettes", () => {
    expect(paletteSimilarity(pro.colors, pro.colors)).toBeCloseTo(1, 5);
    expect(colorSimilarity(pro, earth)).toBeGreaterThan(colorSimilarity(pro, coffeeTime));
  });
  it("extracts the dominant colour as background", () => {
    const px: number[] = [];
    const push = (hex: string, n: number) => {
      const [r, g, b] = hexToRgb(hex);
      for (let i = 0; i < n; i++) px.push(r, g, b, 255);
    };
    push("#1E1E17", 600);
    push("#F27C31", 250);
    push("#9D958D", 150);
    const pal = extractPalette(px);
    expect(pal).toHaveLength(3);
    expect(pal[0].role).toBe("background");
    expect(deltaE(pal[0].hex, "#1E1E17")).toBeLessThan(0.03);
    expect(deltaE(pal[1].hex, "#F27C31")).toBeLessThan(0.03);
  });
});

describe("similarity scores", () => {
  it("all scores are within 0..1 and self-similarity is maximal", () => {
    for (const fn of [colorSimilarity, layoutSimilarity, styleSimilarity, overallSimilarity]) {
      for (const b of templates) {
        const s = fn(pro, b);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1.000001);
        expect(fn(pro, pro)).toBeGreaterThanOrEqual(s - 1e-9);
      }
    }
  });
  it("jaccard handles overlap and empties", () => {
    expect(jaccard(["a", "b"], ["b", "c"])).toBeCloseTo(1 / 3);
    expect(jaccard([], [])).toBe(1);
    expect(jaccard(["a"], [])).toBe(0);
  });
  it("bold construction designs are more style-similar to each other than to a cute coffee post", () => {
    expect(styleSimilarity(pro, earth)).toBeGreaterThan(styleSimilarity(pro, coffeeTime));
  });
  it("text-only designs are layout-similar on imagery", () => {
    const brutal = bySlug("brutalism-under-renovation");
    expect(layoutSimilarity(flash, brutal)).toBeGreaterThan(layoutSimilarity(flash, pro));
  });
});

describe("findSimilar", () => {
  it("excludes the target, returns n results sorted by score with reasons", () => {
    const hits = findSimilar(pro, templates, "colors", 5);
    expect(hits).toHaveLength(5);
    expect(hits.some((h) => h.template.templateId === pro.templateId)).toBe(false);
    for (let i = 1; i < hits.length; i++) expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
    expect(hits.every((h) => h.reason.length > 0)).toBe(true);
  });
  it("is deterministic", () => {
    const a = findAllSimilar(pro, templates, 6);
    const b = findAllSimilar(pro, templates, 6);
    expect(a.overall.map((h) => h.template.templateId)).toEqual(b.overall.map((h) => h.template.templateId));
  });
  it("respects a restricted candidate pool (In <Industry>)", () => {
    const pool = templates.filter((t) => t.industry === pro.industry);
    const hits = findSimilar(pro, pool, "overall", 6);
    expect(hits.every((h) => h.template.industry === "Construction")).toBe(true);
  });
  it("ranks by an uploaded palette", () => {
    const ranked = rankByPalette(pro.colors, templates);
    expect(ranked[0].template.templateId).toBe(pro.templateId);
  });
});
