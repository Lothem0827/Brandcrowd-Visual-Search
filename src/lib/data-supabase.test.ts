import { describe, expect, it } from "vitest";
import { fetchAllRows } from "./data-supabase";

function table(size: number, maxRows = Infinity) {
  const rows = Array.from({ length: size }, (_, i) => i);
  const calls: [number, number][] = [];
  const fetchPage = async (from: number, to: number, withCount: boolean) => {
    calls.push([from, to]);
    const data = rows.slice(from, Math.min(to + 1, from + maxRows));
    return { data, error: null, count: withCount ? size : null };
  };
  return { fetchPage, calls };
}

describe("fetchAllRows", () => {
  it("returns every row once, in order", async () => {
    const { fetchPage, calls } = table(15_082);
    const rows = await fetchAllRows(fetchPage);
    expect(rows).toHaveLength(15_082);
    expect(rows.every((r, i) => r === i)).toBe(true);
    expect(calls).toHaveLength(16);
  });

  it("steps by the server's page size when it caps rows below 1000", async () => {
    const { fetchPage } = table(2_345, 500);
    const rows = await fetchAllRows(fetchPage);
    expect(rows).toHaveLength(2_345);
    expect(new Set(rows).size).toBe(2_345);
  });

  it("stops after the first page of an empty table", async () => {
    const { fetchPage, calls } = table(0);
    expect(await fetchAllRows(fetchPage)).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});
