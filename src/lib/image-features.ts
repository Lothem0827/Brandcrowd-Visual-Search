import { hexToOklab, labDistance, nearestColorName, type Lab, type RoleColor } from "./color";

/**
 * Cheap, in-browser "look" features derived from a downscaled image, used to blend
 * structural similarity into image search (no embeddings, no network). Pure and
 * deterministic so it can be unit-tested with pixel fixtures.
 */
export interface ImageFeatures {
  /** fraction of pixels that are the (near-uniform) background colour, 0..1 */
  flatRatio: number;
  /** mean luminance-gradient magnitude, 0..1 (busy vs calm) */
  edgeDensity: number;
  /** mean OKLab chroma of non-transparent pixels, 0..1 (vivid vs muted) */
  colorfulness: number;
  /** left/right + top/bottom mirror similarity, 0..1 */
  symmetry: number;
  /** fraction of non-background pixels, 0..1 (content coverage) */
  coverage: number;
}

/** Feature values bucketed into the same vocabulary the templates are tagged with. */
export interface LookBuckets {
  imageType: "photo" | "illustration" | "none";
  whitespace: "tight" | "balanced" | "airy";
  textDensity: "low" | "medium" | "high";
  balance: "symmetrical" | "asymmetrical";
}

const flat = (data: Uint8ClampedArray | number[], size: number) => {
  const lum = new Float32Array(size * size);
  const lab: Lab[] = new Array(size * size);
  let n = 0;
  for (let i = 0; i < size * size; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (a >= 128) {
      lab[i] = labFromRgb(r, g, b);
      n++;
    } else {
      lab[i] = [0, 0, 0]; // transparent: treated as far from the background (rare here)
    }
  }
  return { lum, lab, opaque: n };
};

// local copy avoids exporting the whole colour pipeline just for one helper
function labFromRgb(r: number, g: number, b: number): Lab {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const lr = lin(r), lg = lin(g), lb = lin(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function backgroundLab(data: Uint8ClampedArray | number[], size: number, palette?: RoleColor[]): Lab {
  if (palette?.length) return hexToOklab(palette[0].hex);
  // fallback: most common coarse colour bucket
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < size * size; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    if (data[i * 4 + 3] < 128) continue;
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const cur = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    cur.n++; cur.r += r; cur.g += g; cur.b += b;
    buckets.set(key, cur);
  }
  let best = { n: 0, r: 0, g: 0, b: 0 };
  for (const v of buckets.values()) if (v.n > best.n) best = v;
  if (!best.n) return [1, 0, 0];
  return labFromRgb(best.r / best.n, best.g / best.n, best.b / best.n);
}

/**
 * Compute look features from RGBA pixels laid out as a `size`×`size` square.
 * `palette` (from the same pixels) sharpens the background estimate when supplied.
 */
export function imageFeatures(data: Uint8ClampedArray | number[], size: number, palette?: RoleColor[]): ImageFeatures {
  const total = size * size;
  const { lum, lab } = flat(data, size);
  const bg = backgroundLab(data, size, palette);

  let flatCount = 0;
  let edgeSum = 0;
  let edgeCount = 0;
  let chromaSum = 0;
  let chromaCount = 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (data[i * 4 + 3] >= 128) {
        if (labDistance(lab[i], bg) < 0.03) flatCount++;
        const c = lab[i];
        chromaSum += Math.hypot(c[1], c[2]);
        chromaCount++;
      }
      if (x + 1 < size) {
        const j = i + 1;
        edgeSum += Math.abs(lum[i] - lum[j]);
        edgeCount++;
      }
      if (y + 1 < size) {
        const j = i + size;
        edgeSum += Math.abs(lum[i] - lum[j]);
        edgeCount++;
      }
    }
  }

  const flatRatio = total ? flatCount / total : 0;
  const edgeDensity = edgeCount ? clamp01((edgeSum / edgeCount / 255) * 2.2) : 0;
  const colorfulness = chromaCount ? clamp01((chromaSum / chromaCount) / 0.22) : 0;

  // mirror similarity on luminance
  let hDiff = 0, hCount = 0, vDiff = 0, vCount = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size / 2; x++) {
      hDiff += Math.abs(lum[y * size + x] - lum[y * size + (size - 1 - x)]);
      hCount++;
    }
  }
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size / 2; y++) {
      vDiff += Math.abs(lum[y * size + x] - lum[(size - 1 - y) * size + x]);
      vCount++;
    }
  }
  const symmetry = clamp01(1 - ((hDiff / Math.max(1, hCount) + vDiff / Math.max(1, vCount)) / 2 / 255) * 1.6);

  return { flatRatio, edgeDensity, colorfulness, symmetry, coverage: clamp01(1 - flatRatio) };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Bucket raw features into the templates' controlled vocabulary. */
export function lookBuckets(f: ImageFeatures): LookBuckets {
  const whitespace = f.flatRatio >= 0.55 ? "airy" : f.flatRatio >= 0.25 ? "balanced" : "tight";
  const textDensity = f.edgeDensity >= 0.4 ? "high" : f.edgeDensity >= 0.16 ? "medium" : "low";
  const balance = f.symmetry >= 0.62 ? "symmetrical" : "asymmetrical";
  const imageType: LookBuckets["imageType"] =
    f.colorfulness < 0.14 && f.edgeDensity < 0.14
      ? "none"
      : f.colorfulness >= 0.5 && f.flatRatio < 0.5
        ? "photo"
        : "illustration";
  return { imageType, whitespace, textDensity, balance };
}

/** Name a picked hex the same way template colours are named (used for chip labels). */
export const colourName = (hex: string) => nearestColorName(hex);
