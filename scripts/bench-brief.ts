import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { parseTemplates } from "../src/lib/schema";
import { generateBrief } from "../src/lib/brief";

const raw = JSON.parse(readFileSync("public/data/templates.68b8fdeb5ed7.json", "utf8"));
const { templates } = parseTemplates(raw);
console.log("templates:", templates.length);

const queries = ["Construction", "Food & Drink", "Healthcare", "Technology", "coffee", "roofing"];

for (const q of queries) {
  // warm up
  generateBrief(templates, q);
  const runs = 25;
  const start = performance.now();
  for (let i = 0; i < runs; i++) generateBrief(templates, q);
  const per = (performance.now() - start) / runs;
  const brief = generateBrief(templates, q);
  console.log(
    q.padEnd(14),
    per.toFixed(2).padStart(7) + " ms",
    "| matched",
    String(brief?.match.templates).padStart(4),
    "| tags",
    brief?.tags.length,
  );
}
