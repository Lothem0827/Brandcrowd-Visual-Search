import { describe, expect, it } from "vitest";
import fixture from "../../tests/fixtures/templates.fixture.json";
import { parseTemplates } from "./schema";
import { buildVocab, parseQuery, removeChipFromQuery, suggest, completeQuery, chipsToSelection } from "./query";
import { applyFilters } from "./facets";

const { templates } = parseTemplates(fixture);
const vocab = buildVocab(templates);

describe("parseQuery", () => {
  it("turns 'construction bold design' into Industry + Style chips with no leftover text", () => {
    const p = parseQuery("construction bold design", vocab);
    expect(p.chips.map((c) => [c.facet, c.value])).toEqual([
      ["industry", "Construction"],
      ["aesthetic", "bold"],
    ]);
    expect(p.text).toBe("");
    expect(p.label).toBe("construction bold");
  });

  it("matches multi-word phrases before single words", () => {
    const p = parseQuery("real estate full bleed photo", vocab);
    expect(p.chips).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ facet: "industry", value: "Real Estate" }),
        expect.objectContaining({ facet: "structure", value: "full-bleed photo" }),
      ]),
    );
  });

  it("understands synonyms and plurals", () => {
    const p = parseQuery("minimal framed photos sans", vocab);
    const pairs = p.chips.map((c) => `${c.facet}:${c.value}`);
    expect(pairs).toContain("aesthetic:minimalist");
    expect(pairs).toContain("placement:frame");
    expect(pairs).toContain("fontStyle:sans serif");
  });

  it("keeps unknown words as free text and drops stop words", () => {
    const p = parseQuery("retro coffee mascot template", vocab);
    expect(p.chips.map((c) => `${c.facet}:${c.value}`)).toEqual(["aesthetic:retro", "topic:Coffee"]);
    expect(p.text).toBe("mascot");
  });

  it("is case and punctuation insensitive", () => {
    const p = parseQuery("  CONSTRUCTION,  Bold!! ", vocab);
    expect(p.chips).toHaveLength(2);
  });

  it("maps 'text only' to the no-image type", () => {
    const p = parseQuery("text only quote", vocab);
    expect(p.chips.map((c) => `${c.facet}:${c.value}`)).toEqual(["imageType:none", "contentType:quote"]);
  });

  it("chips filter the dataset to construction + bold templates", () => {
    const p = parseQuery("construction bold design", vocab);
    const res = applyFilters(templates, { facets: chipsToSelection(p.chips), color: null });
    expect(res.length).toBeGreaterThan(3);
    expect(res.every((t) => t.industry === "Construction" && t.style.aesthetic.includes("bold"))).toBe(true);
  });

  it("removes a chip's words from the query", () => {
    const p = parseQuery("construction bold design", vocab);
    expect(removeChipFromQuery("construction bold design", p.chips[1])).toBe("construction design");
  });
});

describe("autocomplete", () => {
  const tagCounts = new Map<string, number>();
  templates.forEach((t) => t.tags.forEach((g) => tagCounts.set(g, (tagCounts.get(g) ?? 0) + 1)));
  it("suggests vocab terms for a partial word", () => {
    const s = suggest("constr", vocab, tagCounts);
    expect(s[0]).toMatchObject({ facet: "industry", value: "Construction" });
  });
  it("completes the trailing partial word", () => {
    expect(completeQuery("bold constr", "Construction")).toBe("bold construction ");
  });
});
