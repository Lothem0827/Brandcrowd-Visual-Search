/**
 * Build step: validate data/templates.json with the Zod schema ONCE, normalise it, drop the
 * design.com image URLs (images are self-hosted and derived from templateId, see
 * src/lib/images.ts), and write a minified, content-hashed copy to public/data/ (served as a static, compressed, long-cached file). The browser no longer
 * bundles or validates the dataset.
 *
 *   pnpm data        (also runs automatically before `pnpm dev` and `pnpm build`)
 */
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseTemplates } from "../src/lib/schema";
import { splitTemplate, type DetailsMap } from "../src/lib/data-split";
import type { DataManifest } from "../src/lib/data-manifest";
import { sampleOrbitIds } from "../src/lib/orbit";

const root = process.cwd();
const src = path.join(root, "data", "templates.json");
const outDir = path.join(root, "public", "data");

const started = Date.now();
const raw: unknown = JSON.parse(readFileSync(src, "utf8"));
const { templates, errors } = parseTemplates(raw);
if (!templates.length) {
  console.error(`[data] no valid templates in ${src}`);
  process.exit(1);
}
if (errors.length) {
  console.warn(`[data] skipped ${errors.length} invalid record(s):\n` + errors.slice(0, 10).join("\n"));
}
// The app builds every image URL from templateId (`${NEXT_PUBLIC_IMAGE_BASE}/${templateId}.webp`),
// so the design.com URLs are not shipped to the browser at all.
const slim = templates.map((t) => ({ ...t, thumbnailImage: "", previewImage: "" }));
const cores: typeof slim = [];
const details: DetailsMap = {};
for (const t of slim) {
  const parts = splitTemplate(t);
  cores.push(parts.core);
  details[t.templateId] = parts.details;
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);
const coreJson = JSON.stringify(cores);
const detailsJson = JSON.stringify(details);
const version = hash(coreJson + detailsJson);
const coreFile = `templates.${hash(coreJson)}.json`;
const detailsFile = `templates-details.${hash(detailsJson)}.json`;

mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) {
  if (/^templates(-details)?\..+\.json$/.test(f) && f !== coreFile && f !== detailsFile) rmSync(path.join(outDir, f));
}
writeFileSync(path.join(outDir, coreFile), coreJson);
writeFileSync(path.join(outDir, detailsFile), detailsJson);

const count = (key: (t: (typeof slim)[number]) => string) => {
  const m = new Map<string, number>();
  for (const t of slim) m.set(key(t), (m.get(key(t)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, n]) => ({ name, count: n }));
};
const manifest: DataManifest = {
  url: `/data/${coreFile}`,
  detailsUrl: `/data/${detailsFile}`,
  version,
  count: slim.length,
  skipped: errors.length,
  categories: count((t) => t.category),
  industries: count((t) => t.industry),
  orbitIds: sampleOrbitIds(slim),
};
writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(
  `[data] ${slim.length} templates -> public/data/${coreFile} (${(coreJson.length / 1e6).toFixed(1)} MB) + ${detailsFile} (${(detailsJson.length / 1e6).toFixed(1)} MB) in ${Date.now() - started} ms`,
);
