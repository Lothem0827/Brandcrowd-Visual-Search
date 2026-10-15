/**
 * Golden queries for the text-search relevance eval (see src/lib/search.eval.test.ts).
 *
 * Expected values reference template *names* from `templates.fixture.json` so the
 * suite stays independent of the live dataset. Each case lists the relevant results
 * in order of preference (most relevant first); `k` is the cut-off used by recall@k
 * and nDCG@k. Single-item `expected` lists also assert the exact top-1 result.
 */
export interface GoldenCase {
  /** free-text query, as passed to SearchIndex.search */
  q: string;
  /** relevant template names, most relevant first */
  expected: string[];
  k?: number;
}

export const GOLDEN_CASES: GoldenCase[] = [
  // exact intent: the template whose title carries both words must lead
  { q: "coffee promo", expected: ["Coffee Promo"] },
  // coverage: the template matching both words outranks one matching only "coffee"
  { q: "coffee bogo", expected: ["Coffee Promo"] },
  // coverage: "national" disambiguates the two burger templates
  { q: "national burger", expected: ["National Burger Day"] },
  // typo tolerance (fuzzy): "cofee" -> "coffee"
  { q: "cofee", expected: ["Coffee Time", "Coffee Promo"], k: 4 },
];

/** queries that should match nothing at all */
export const GOLDEN_EMPTY = ["zzqqxx", "qqzzxx qxqx"];
