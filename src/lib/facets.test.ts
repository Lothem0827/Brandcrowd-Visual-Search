import { describe, expect, it } from "vitest";
import fixture from "../../tests/fixtures/templates.fixture.json";
import { parseTemplates } from "./schema";
import { facetOptions, mergeSelections, removeSelections, replaceSelections, restoreSelections, sentenceCase, titleCase, type FilterState } from "./facets";

const state = (facets: FilterState["facets"]): FilterState => ({ facets, color: null });

describe("removeSelections", () => {
  it("removes a value and keeps the rest of the facet", () => {
    const f = state({ aesthetic: ["bold", "minimal"], industry: ["construction"] });
    expect(removeSelections(f, { aesthetic: ["bold"] }).facets).toEqual({
      aesthetic: ["minimal"],
      industry: ["construction"],
    });
  });

  it("drops the facet key entirely when its last value is removed", () => {
    const f = state({ aesthetic: ["bold"] });
    expect(removeSelections(f, { aesthetic: ["bold"] }).facets).toEqual({});
  });

  it("ignores values that are not selected", () => {
    const f = state({ aesthetic: ["bold"] });
    expect(removeSelections(f, { aesthetic: ["minimal"] }).facets).toEqual({
      aesthetic: ["bold"],
    });
  });

  it("preserves the color filter", () => {
    const f: FilterState = { facets: { aesthetic: ["bold"] }, color: { colors: ["#F27C31"], mode: "any" } };
    expect(removeSelections(f, { aesthetic: ["bold"] }).color).toEqual({
      colors: ["#F27C31"],
      mode: "any",
    });
  });

  it("inverts mergeSelections", () => {
    const base = state({ industry: ["construction"] });
    const add = { aesthetic: ["bold"], structure: ["split"] };
    const merged = { ...base, facets: mergeSelections(base.facets, add) };
    expect(removeSelections(merged, add).facets).toEqual(base.facets);
  });
});

describe("replaceSelections", () => {
  it("replaces the values of a facet instead of unioning", () => {
    const before = state({ topic: ["a", "b", "c"], industry: ["healthcare"] });
    const next = replaceSelections(before.facets, { topic: ["a"] });
    expect(next).toEqual({ topic: ["a"], industry: ["healthcare"] });
  });

  it("adds a new facet and leaves other facets alone", () => {
    const before = state({ industry: ["healthcare"] });
    const next = replaceSelections(before.facets, { topic: ["a"], structure: ["split"] });
    expect(next).toEqual({ industry: ["healthcare"], topic: ["a"], structure: ["split"] });
  });

  it("drops a facet when replaced with an empty selection", () => {
    const before = state({ topic: ["a"] });
    expect(replaceSelections(before.facets, { topic: [] })).toEqual({});
  });
});

describe("restoreSelections", () => {
  it("restores a facet the step replaced", () => {
    const f = state({ topic: ["a"], industry: ["healthcare"] });
    const step = { facets: { topic: ["a"] }, prev: { topic: ["a", "b", "c"] } };
    expect(restoreSelections(f, step).facets).toEqual({
      topic: ["a", "b", "c"],
      industry: ["healthcare"],
    });
  });

  it("drops a facet the step newly introduced", () => {
    const f = state({ topic: ["a"], industry: ["healthcare"] });
    const step = { facets: { topic: ["a"] }, prev: undefined };
    expect(restoreSelections(f, step).facets).toEqual({ industry: ["healthcare"] });
  });

  it("round-trips a sequence of narrowing steps", () => {
    const start = state({ industry: ["healthcare"] });
    // step 1: introduce topic (284) + structure (split)
    const s1 = { facets: { topic: ["t1", "t2", "t3"], structure: ["split"] }, prev: undefined as FilterState["facets"] | undefined };
    // step 2: narrow topic to t1 (replacing t1..t3)
    const s2 = { facets: { topic: ["t1"] }, prev: { topic: ["t1", "t2", "t3"] } as FilterState["facets"] };
    const after1 = replaceSelections(start.facets, s1.facets);
    const after2 = replaceSelections(after1, s2.facets);
    expect(after2).toEqual({ industry: ["healthcare"], topic: ["t1"], structure: ["split"] });

    // undo step 2 then step 1 (newest-first)
    const undo2 = restoreSelections(state(after2), s2);
    expect(undo2.facets).toEqual(after1);
    const undo1 = restoreSelections(undo2, s1);
    expect(undo1.facets).toEqual(start.facets);
  });

  it("preserves the color filter", () => {
    const f: FilterState = { facets: { topic: ["a"] }, color: { colors: ["#F27C31"], mode: "any" } };
    expect(restoreSelections(f, { facets: { topic: ["a"] }, prev: { topic: ["a", "b"] } }).color).toEqual({
      colors: ["#F27C31"],
      mode: "any",
    });
  });
});

describe("sentenceCase", () => {
  it("lower-cases the rest of the label and capitalises the first letter", () => {
    expect(sentenceCase("Construction Services")).toBe("Construction services");
    expect(sentenceCase("professional construction")).toBe("Professional construction");
    expect(sentenceCase("CONSTRUCTION COMPANY")).toBe("Construction company");
  });

  it("keeps all-caps tokens (acronyms) uppercase", () => {
    expect(sentenceCase("Y2K")).toBe("Y2K");
    expect(sentenceCase("DIY ideas")).toBe("DIY ideas");
    expect(sentenceCase("AI poster")).toBe("AI poster");
  });

  it("uppercases known acronyms even when the data stores them in lower case", () => {
    expect(sentenceCase("y2k poster")).toBe("Y2K poster");
  });

  it("leaves single words with nothing to change untouched", () => {
    expect(sentenceCase("bold")).toBe("Bold");
  });
});

describe("titleCase", () => {
  it("capitalises every word of a lower-case label", () => {
    expect(titleCase("holidays & seasonal")).toBe("Holidays & Seasonal");
    expect(titleCase("full-bleed photo")).toBe("Full-Bleed Photo");
    expect(titleCase("add to cart")).toBe("Add to Cart");
  });

  it("is idempotent on labels that are already title case", () => {
    const already = "Holidays & Seasonal · Copy";
    expect(titleCase(already)).toBe(already);
    expect(titleCase("Back to School")).toBe("Back to School");
    expect(titleCase("All Templates")).toBe("All Templates");
    expect(titleCase("Similar Colors")).toBe("Similar Colors");
  });

  it("keeps minor words down unless they lead or end the title", () => {
    // "into" mid-phrase stays down, but the same word as the last word capitalises
    expect(titleCase("into the woods")).toBe("Into the Woods");
    expect(titleCase("a day of the week")).toBe("A Day of the Week");
    expect(titleCase("design for")).toBe("Design For");
  });

  it("keeps acronyms and shouted tokens uppercase", () => {
    expect(titleCase("y2k poster")).toBe("Y2K Poster");
    expect(titleCase("diy gift ideas")).toBe("DIY Gift Ideas");
    expect(titleCase("SALE poster")).toBe("SALE Poster");
  });

  it("leaves tokens with no letters (numbers, separators) alone", () => {
    expect(titleCase("353 results")).toBe("353 Results");
    expect(titleCase("&")).toBe("&");
    expect(titleCase("full-bleed")).toBe("Full-Bleed");
  });

  it("does not collapse or pad whitespace runs it was not asked to fix", () => {
    expect(titleCase("bold design")).toBe("Bold Design");
  });
});

describe("facetOptions memoization", () => {
  const { templates } = parseTemplates(fixture);
  const filters: FilterState = { facets: {}, color: null };

  it("returns the same array for identical data, facet and filters", () => {
    const a = facetOptions(templates, "aesthetic", filters);
    const b = facetOptions(templates, "aesthetic", filters);
    expect(b).toBe(a);
  });

  it("recomputes when the filter state changes", () => {
    const a = facetOptions(templates, "aesthetic", filters);
    const other: FilterState = { facets: { industry: ["healthcare"] }, color: null };
    expect(facetOptions(templates, "aesthetic", other)).not.toBe(a);
  });

  it("keys the cache by facet and limit", () => {
    const tagged = facetOptions(templates, "tag", filters, { limit: 5 });
    expect(facetOptions(templates, "tag", filters, { limit: 5 })).toBe(tagged);
    expect(facetOptions(templates, "tag", filters, { limit: 10 })).not.toBe(tagged);
    expect(facetOptions(templates, "aesthetic", filters, { limit: 5 })).not.toBe(tagged);
  });
});
