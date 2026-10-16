import { describe, expect, it } from "vitest";
import fixture from "../../tests/fixtures/templates.fixture.json";
import { parseTemplates } from "./schema";
import {
  buildVocab, parseQuery, removeChipFromQuery, suggest, completeQuery, chipsToSelection, ignoredQueryText, isUnsearchableQuery, highlightLabel, relatedChips,
} from "./query";
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

  it("prefers a broader tag over a narrow topic of the same name", () => {
    // the real dataset has ~6.5k near-unique topics, so a common word often matches a
    // 1-2 template topic and a much larger tag; the tag interpretation must win
    const sample = structuredClone(templates.slice(0, 5));
    sample[0].topic = "Gaming";
    for (const t of sample) t.tags = [...t.tags, "gaming"];
    const v = buildVocab(sample);
    const p = parseQuery("gaming", v);
    expect(p.chips).toEqual([expect.objectContaining({ facet: "tag", value: "gaming" })]);
    expect(p.text).toBe("");
    expect(applyFilters(sample, { facets: chipsToSelection(p.chips), color: null })).toHaveLength(sample.length);
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
  it("reuses the cached suggestion list for a repeated prefix", () => {
    const a = suggest("constr", vocab, tagCounts);
    const b = suggest("constr", vocab, tagCounts);
    expect(b).toBe(a);
    // a different prefix is a separate entry, and casing normalises to the same list
    expect(suggest("bold", vocab, tagCounts)).not.toBe(a);
    expect(suggest("CONSTR", vocab, tagCounts)).toBe(a);
  });
});

describe("relatedChips", () => {
  const tagCounts = new Map<string, number>();
  templates.forEach((t) => t.tags.forEach((g) => tagCounts.set(g, (tagCounts.get(g) ?? 0) + 1)));

  it("returns vocab suggestions matching a committed term", () => {
    const chips = relatedChips("constr", vocab, tagCounts, []);
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.some((s) => s.facet === "industry" && s.value === "Construction")).toBe(true);
    expect(chips.every((s) => s.count > 0)).toBe(true);
  });

  it("excludes values that are already applied as a facet", () => {
    const all = relatedChips("constr", vocab, tagCounts, []);
    // guard: the suggestion must exist before we prove it is filtered out
    expect(all.some((s) => s.facet === "industry" && s.value === "Construction")).toBe(true);
    const chips = relatedChips("constr", vocab, tagCounts, [{ facet: "industry", value: "Construction" }]);
    expect(chips.some((s) => s.facet === "industry" && s.value === "Construction")).toBe(false);
  });

  it("returns nothing for a blank query", () => {
    expect(relatedChips("", vocab, tagCounts, [])).toEqual([]);
    expect(relatedChips("   ", vocab, tagCounts, [])).toEqual([]);
  });
});

describe("highlightLabel", () => {  it("splits a label at the matched prefix", () => {
    expect(highlightLabel("Construction", "constr")).toEqual({
      before: "",
      match: "Constr",
      after: "uction",
    });
  });

  it("keeps the label's own casing for the matched part", () => {
    // suggest lower-cases its prefixes, but the label keeps its display casing
    expect(highlightLabel("Sans serif", "sans")).toEqual({ before: "", match: "Sans", after: " serif" });
  });

  it("matches a prefix that appears after a space", () => {
    expect(highlightLabel("Garage sale", "garage sale")).toEqual({ before: "", match: "Garage sale", after: "" });
    expect(highlightLabel("Flash sale", "sale")).toEqual({ before: "Flash ", match: "sale", after: "" });
  });

  it("returns no match when the label has no such substring", () => {
    expect(highlightLabel("Bold", "zzz")).toEqual({ before: "Bold", match: "", after: "" });
  });

  it("ignores single-character prefixes", () => {
    expect(highlightLabel("Bold", "b")).toEqual({ before: "Bold", match: "", after: "" });
  });

  it("ignores an empty query", () => {
    expect(highlightLabel("Bold", "")).toEqual({ before: "Bold", match: "", after: "" });
  });
});

describe("unsupported query text", () => {
  it("flags queries with nothing searchable (emoji, CJK)", () => {
    expect(isUnsearchableQuery("🍕")).toBe(true);
    expect(isUnsearchableQuery("カフェ ☕")).toBe(true);
    expect(isUnsearchableQuery("")).toBe(false);
    expect(isUnsearchableQuery("   ")).toBe(false);
    expect(isUnsearchableQuery("coffee 🍕")).toBe(false);
    expect(ignoredQueryText("coffee 🍕 カフェ bold")).toBe("🍕 カフェ");
    expect(ignoredQueryText("coffee bold")).toBe("");
  });
});
