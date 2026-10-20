/**
 * Build step: write 600px (`thumbs/`) and 480px (`thumbs-sm/`) WebP copies for every
 * self-hosted template image (quality 80). Existing files in each folder are skipped,
 * so a re-run only does new images — delete a folder to force a full re-encode.
 *
 *   pnpm thumbs
 *     public/images/<id>.webp -> public/images/thumbs/<id>.webp      (600)
 *     public/images/<id>.webp -> public/images/thumbs-sm/<id>.webp   (480)
 *
 * When images are served from R2 / a CDN, upload both thumbs/ and thumbs-sm/ next to the originals.
 */
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { THUMB_SM_WIDTH, THUMB_WIDTH } from "../src/lib/images";

const WEBP_QUALITY = 80;

const imagesDir = path.join(process.cwd(), "public", "images");
const thumbsDir = path.join(imagesDir, "thumbs");
const thumbsSmDir = path.join(imagesDir, "thumbs-sm");

if (!existsSync(imagesDir)) {
  console.log("[thumbs] no public/images folder, nothing to do");
  process.exit(0);
}
mkdirSync(thumbsDir, { recursive: true });
mkdirSync(thumbsSmDir, { recursive: true });

const sources = readdirSync(imagesDir).filter((f) => f.endsWith(".webp"));
const doneThumbs = new Set(readdirSync(thumbsDir));
const doneSm = new Set(readdirSync(thumbsSmDir));

type Job = { file: string; width: number; outDir: string; label: "thumbs" | "thumbs-sm" };
const todo: Job[] = [];
for (const file of sources) {
  if (!doneThumbs.has(file)) {
    todo.push({ file, width: THUMB_WIDTH, outDir: thumbsDir, label: "thumbs" });
  }
  if (!doneSm.has(file)) {
    todo.push({ file, width: THUMB_SM_WIDTH, outDir: thumbsSmDir, label: "thumbs-sm" });
  }
}

const started = Date.now();
let next = 0;
let failed = 0;
let writtenThumbs = 0;
let writtenSm = 0;

async function worker() {
  while (next < todo.length) {
    const job = todo[next++];
    try {
      await sharp(path.join(imagesDir, job.file))
        .resize({ width: job.width, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toFile(path.join(job.outDir, job.file));
      if (job.label === "thumbs") writtenThumbs++;
      else writtenSm++;
    } catch (err) {
      failed++;
      console.warn(`[thumbs] ${job.label}/${job.file}: ${(err as Error).message}`);
    }
  }
}

void Promise.all(Array.from({ length: Math.max(1, os.cpus().length) }, worker)).then(() => {
  console.log(
    `[thumbs] thumbs: ${writtenThumbs} written (${doneThumbs.size} present); ` +
      `thumbs-sm: ${writtenSm} written (${doneSm.size} present); ` +
      `${failed} failed in ${Date.now() - started} ms`,
  );
});
