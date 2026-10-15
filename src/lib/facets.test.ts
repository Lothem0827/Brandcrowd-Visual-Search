import { describe, expect, it } from "vitest";
import { mergeSelections, removeSelections, replaceSelections, restoreSelections, type FilterState } from "./facets";

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
    const f: FilterState = { facets: { aesthetic: ["bold"] }, color: { hex: "#F27C31", mode: "any" } };
    expect(removeSelections(f, { aesthetic: ["bold"] }).color).toEqual({
      hex: "#F27C31",
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
    const f: FilterState = { facets: { topic: ["a"] }, color: { hex: "#F27C31", mode: "any" } };
    expect(restoreSelections(f, { facets: { topic: ["a"] }, prev: { topic: ["a", "b"] } }).color).toEqual({
      hex: "#F27C31",
      mode: "any",
    });
  });
});
