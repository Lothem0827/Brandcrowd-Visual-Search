import { readFileSync } from "node:fs";
import path from "node:path";

/** Written by `scripts/build-data.ts` next to the hashed dataset in public/data/. */
export interface DataManifest {
  /** public URL of the content-hashed core dataset, e.g. /data/templates.56eb6e896c7e.json */
  url: string;
  /** long-text fields, loaded after the tree is up (see data-split.ts) */
  detailsUrl: string;
  version: string;
  count: number;
  skipped: number;
  categories: { name: string; count: number }[];
  industries: { name: string; count: number }[];
  /**
   * Template ids for the loading-screen orbit (12 spokes × 4 rings).
   * Written by the data build. Missing on an older manifest — the intro still renders.
   */
  orbitIds?: string[];
}

/** Server/build-time only: read the manifest produced by `pnpm data`. */
export function readDataManifest(): DataManifest {
  const file = path.join(process.cwd(), "public", "data", "manifest.json");
  try {
    return JSON.parse(readFileSync(file, "utf8")) as DataManifest;
  } catch {
    throw new Error(`Missing ${file}. Run \`pnpm data\` (it runs automatically before dev and build).`);
  }
}
