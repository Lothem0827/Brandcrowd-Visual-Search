import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { parseTemplates } from "../src/lib/schema";
import { generateBrief } from "../src/lib/brief";

const raw = JSON.parse(readFileSync("public/data/templates.68b8fdeb5ed7.json", "utf8"));
const { templates } = parseTemplates(raw);
console.log("templates:", templates.length);

const queries = ["Construction", "Food & Drink", "Healthcare", "Technology", "coffee", "roofing"];

/** Median-ish cost of one call, after warming the JIT. */
function time(runs: number, fn: () => void) {
  fn();
  const start = performance.now();
  for (let i = 0; i < runs; i++) fn();
  return (performance.now() - start) / runs;
}

for (const q of queries) {
  const one = time(25, () => generateBrief(templates, q));
  const three = time(25, () => generateBrief(templates, q, 3));
  const brief = generateBrief(templates, q, 3);
  console.log(
    q.padEnd(14),
    ("1:" + one.toFixed(2) + "ms").padStart(11),
    ("3:" + three.toFixed(2) + "ms").padStart(11),
    "| matched",
    String(brief?.match.templates).padStart(4),
    "| options",
    brief?.options.length,
    "| tags",
    brief?.tags.length,
  );
}
