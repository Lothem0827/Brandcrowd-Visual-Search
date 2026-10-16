import { describe, expect, it } from "vitest";
import { computeWindow } from "./use-windowed-grid";

const base = { count: 7000, columns: 6, gap: 12, width: 1200, height: 800, scrollTop: 0, overscan: 4 };

describe("computeWindow", () => {
  it("derives square tiles from the content width and column count", () => {
    const w = computeWindow(base);
    expect(w.cols).toBe(6);
    // (1200 - 12 * 5) / 6 = 190
    expect(w.tileHeight).toBe(190);
    expect(w.rowHeight).toBe(202);
  });

  it("sizes the spacer to the whole list, not just mounted rows", () => {
    const w = computeWindow(base);
    expect(w.rowCount).toBe(Math.ceil(7000 / 6));
    expect(w.totalHeight).toBe(w.rowCount * w.rowHeight - base.gap);
  });

  it("mounts only a viewport worth of rows plus overscan", () => {
    const w = computeWindow(base);
    const visible = Math.ceil(base.height / w.rowHeight);
    const mounted = w.lastRow - w.firstRow;
    expect(mounted).toBeLessThanOrEqual(visible + base.overscan * 2 + 1);
    expect(w.firstRow).toBe(0);
  });

  it("shifts the window as the user scrolls, clamping firstRow at 0", () => {
    const scrolled = computeWindow({ ...base, scrollTop: 2020 });
    expect(scrolled.firstRow).toBe(10 - base.overscan);
    const top = computeWindow({ ...base, scrollTop: 40 });
    expect(top.firstRow).toBe(0);
  });

  it("clamps lastRow at the row count near the bottom", () => {
    const w = computeWindow(base);
    const bottom = computeWindow({ ...base, scrollTop: w.totalHeight });
    expect(bottom.lastRow).toBe(w.rowCount);
  });

  it("reports an empty grid before the container has been measured", () => {
    const w = computeWindow({ ...base, width: 0, height: 0 });
    expect(w).toMatchObject({ tileHeight: 0, rowCount: 0, totalHeight: 0, firstRow: 0, lastRow: 0 });
  });

  it("scales tiles with the column count", () => {
    const few = computeWindow({ ...base, columns: 2 });
    const many = computeWindow({ ...base, columns: 12 });
    expect(few.tileHeight).toBe((1200 - 12) / 2);
    expect(many.tileHeight).toBeCloseTo((1200 - 12 * 11) / 12);
  });
});
