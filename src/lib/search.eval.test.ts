import { describe, expect, it } from "vitest";
import fixture from "../../tests/fixtures/templates.fixture.json";
import { parseTemplates } from "./schema";
import { buildSearchIndex } from "./search";
import { GOLDEN_CASES, GOLDEN_EMPTY, type GoldenCase } from "../../tests/fixtures/search-golden";

const { templates } = parseTemplates(fixture);
const byId = new Map(templates.map((t) => [t.templateId, t]));
const nameOf = (id: string) => byId.get(id)?.name;
const index = buildSearchIndex(templates);

/** ordered template names for a query, best first */
const hits = (q: string) =>
  [...index.search(q).keys()].map((id) => nameOf(id)).filter((n): n is string => !!n);

/** fraction of expected results found in the top-k */
function recallAtK(q: string, expected: string[], k: number): number {
  const top = hits(q).slice(0, k);
  return expected.filter((e) => top.includes(e)).length / expected.length;
}

/** mean reciprocal rank of the first relevant hit across cases */
function mrr(cases: GoldenCase[]): number {
  let sum = 0;
  let n = 0;
  for (const c of cases) {
    const rank = hits(c.q).findIndex((h) => c.expected.includes(h));
    if (rank >= 0) {
      sum += 1 / (rank + 1);
      n++;
    }
  }
  return n ? sum / n : 0;
}

/** nDCG@k with binary relevance (relevant = in the expected set) */
function ndcgAtK(q: string, expected: string[], k: number): number {
  const top = hits(q).slice(0, k);
  const rel = (n: string) => (expected.includes(n) ? 1 : 0);
  const dcg = top.reduce((acc, n, i) => acc + rel(n) / Math.log2(i + 2), 0);
  const idealCount = Math.min(expected.length, k);
  const idcg = Array.from({ length: idealCount }, (_, i) => 1 / Math.log2(i + 2)).reduce((a, b) => a + b, 0);
  return idcg ? dcg / idcg : 0;
}

describe("text-search relevance (golden eval)", () => {
  it("puts the exact-intent result first", () => {
    for (const c of GOLDEN_CASES) {
      // only single-item expectations assert an exact top-1 (multi-item cases are order-agnostic)
      if (c.expected.length === 1) expect(hits(c.q)[0]).toBe(c.expected[0]);
    }
  });

  it("reaches the recall@k, MRR and nDCG@k thresholds", () => {
    const meanRecall =
      GOLDEN_CASES.reduce((acc, c) => acc + recallAtK(c.q, c.expected, c.k ?? 10), 0) / GOLDEN_CASES.length;
    const meanNdcg =
      GOLDEN_CASES.reduce((acc, c) => acc + ndcgAtK(c.q, c.expected, c.k ?? 10), 0) / GOLDEN_CASES.length;

    expect(meanRecall).toBeGreaterThanOrEqual(0.9);
    expect(mrr(GOLDEN_CASES)).toBeGreaterThanOrEqual(0.9);
    expect(meanNdcg).toBeGreaterThanOrEqual(0.9);
  });

  it("returns nothing for garbage queries", () => {
    for (const q of GOLDEN_EMPTY) {
      expect(index.search(q).size).toBe(0);
    }
  });

  it("scores full-coverage matches above partial matches", () => {
    const burger = templates.find((t) => t.name === "National Burger Day")!;
    const full = index.search("burger").get(burger.templateId)!;
    const partial = index.search("burger zzqqxx").get(burger.templateId);
    // partial match is either dropped or strictly weaker than the clean full-coverage search
    expect(partial === undefined || partial < full).toBe(true);
  });
});
