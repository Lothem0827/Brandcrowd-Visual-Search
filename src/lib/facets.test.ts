import { describe, expect, it } from "vitest";
import { mergeSelections, removeSelections, type FilterState } from "./facets";

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
