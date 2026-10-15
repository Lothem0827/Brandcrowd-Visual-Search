import { describe, expect, it } from "vitest";
import { buildTree, OTHER, OTHER_SUB } from "./tree";
import type { Template } from "./schema";

/** minimal template: buildTree only reads what level1/level2 access */
const t = (id: string, industry: string, structure = "centered stack") =>
  ({ templateId: id, industry, layout: { structure } }) as unknown as Template;

describe("buildTree overflow groups", () => {
  it("merges branch overflow into 'Other (more)' and keeps every merged value filterable", () => {
    const items = [
      t("1", "A"), t("2", "A"),
      t("3", "B"), t("4", "B"),
      t("5", "C"),
      t("6", "D"),
    ];
    const { branches } = buildTree({
      root: { label: "All", sub: "" },
      items,
      level1: (x) => x.industry,
      level2: (x) => x.layout.structure,
      level1Facet: "industry",
      level2Facet: "structure",
      colorFor: () => "#000",
      maxBranches: 3,
    });

    const other = branches.find((b) => b.label === OTHER)!;
    expect(other).toBeTruthy();
    expect(other.facet).toBe("industry");
    expect([...other.values].sort()).toEqual(["C", "D"]);
    expect(other.count).toBe(2);

    // kept branches still carry a single value
    expect(branches.find((b) => b.label === "A")!.values).toEqual(["A"]);
  });

  it("merges level-2 overflow into 'Other layouts' with every structure value", () => {
    const items = [
      t("1", "A", "split"), t("2", "A", "split"),
      t("3", "A", "grid"),
      t("4", "A", "collage"),
    ];
    const { branches } = buildTree({
      root: { label: "All", sub: "" },
      items,
      level1: (x) => x.industry,
      level2: (x) => x.layout.structure,
      level1Facet: "industry",
      level2Facet: "structure",
      colorFor: () => "#000",
      maxSubs: 2,
    });

    const a = branches.find((b) => b.label === "A")!;
    const otherSub = a.subs.find((s) => s.label === OTHER_SUB)!;
    expect(otherSub.facet).toBe("structure");
    expect([...otherSub.values].sort()).toEqual(["collage", "grid"]);
  });
});
