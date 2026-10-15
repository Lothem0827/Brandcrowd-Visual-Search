/** Colour maths: sRGB hex <-> OKLab, distances, k-means palette extraction. Pure, no DOM. */

export type Lab = [number, number, number];

export function normalizeHex(input: string): string | null {
  const s = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(s)) return `#${s.split("").map((c) => c + c).join("")}`.toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s}`.toUpperCase();
  return null;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex) ?? "#000000";
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

export function rgbToOklab(r: number, g: number, b: number): Lab {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const labCache = new Map<string, Lab>();
export function hexToOklab(hex: string): Lab {
  let v = labCache.get(hex);
  if (!v) {
    v = rgbToOklab(...hexToRgb(hex));
    labCache.set(hex, v);
  }
  return v;
}

/** Euclidean distance in OKLab (deltaE-OK). 0 = identical, ~0.02 just noticeable, ~0.4+ very different. */
export function labDistance(a: Lab, b: Lab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function deltaE(hexA: string, hexB: string): number {
  return labDistance(hexToOklab(hexA), hexToOklab(hexB));
}

export interface RoleColor {
  hex: string;
  role: string;
  name?: string;
}

/** Map a distance to a 0..1 similarity. */
export function distanceToSimilarity(d: number, scale = 0.35): number {
  return Math.max(0, 1 - d / scale);
}

const ROLE_WEIGHT: Record<string, number> = { background: 0.5, primary: 0.3, accent: 0.2 };

/**
 * Role-weighted palette similarity (0..1). Each colour of `a` is matched to the
 * same role in `b`, or to the closest colour of any role with a small penalty.
 */
export function paletteSimilarity(a: RoleColor[], b: RoleColor[]): number {
  if (!a.length || !b.length) return 0;
  let total = 0;
  let wsum = 0;
  for (const ca of a) {
    const w = ROLE_WEIGHT[ca.role] ?? 0.2;
    const la = hexToOklab(ca.hex);
    const same = b.find((cb) => cb.role === ca.role);
    let best = same ? labDistance(la, hexToOklab(same.hex)) : Infinity;
    for (const cb of b) {
      if (cb === same) continue;
      best = Math.min(best, labDistance(la, hexToOklab(cb.hex)) + 0.06);
    }
    total += w * distanceToSimilarity(best);
    wsum += w;
  }
  return total / wsum;
}

/** Smallest distance from `hex` to the template palette, background-only or any colour. */
export function colorMatchDistance(hex: string, colors: RoleColor[], mode: "background" | "any"): number {
  const target = hexToOklab(hex);
  const pool = mode === "background" ? colors.filter((c) => c.role === "background").slice(0, 1) : colors;
  const list = pool.length ? pool : colors.slice(0, 1);
  return Math.min(...list.map((c) => labDistance(target, hexToOklab(c.hex))));
}

/** Basic named swatches used for color-name lookup and the Color filter. */
export const NAMED_SWATCHES: { name: string; hex: string }[] = [
  { name: "black", hex: "#141414" },
  { name: "white", hex: "#FAFAF7" },
  { name: "gray", hex: "#8A8A8A" },
  { name: "red", hex: "#D63A2F" },
  { name: "orange", hex: "#F07B22" },
  { name: "peach", hex: "#F2C29B" },
  { name: "yellow", hex: "#F2C824" },
  { name: "green", hex: "#3E9B4F" },
  { name: "teal", hex: "#178C8C" },
  { name: "blue", hex: "#2B5BD7" },
  { name: "navy", hex: "#14275E" },
  { name: "purple", hex: "#7E57C2" },
  { name: "pink", hex: "#EC6AA6" },
  { name: "brown", hex: "#6B4226" },
];

export function nearestColorName(hex: string): string {
  const lab = hexToOklab(hex);
  let best = NAMED_SWATCHES[0];
  let bd = Infinity;
  for (const s of NAMED_SWATCHES) {
    const d = labDistance(lab, hexToOklab(s.hex));
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best.name;
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Extract a 3-colour palette from RGBA pixel data using k-means in OKLab.
 * Background = the largest cluster (after merging near shades).
 */
export function extractPalette(pixels: Uint8ClampedArray | number[], k = 6, iterations = 12): RoleColor[] {
  const pts: Lab[] = [];
  const rgbs: [number, number, number][] = [];
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    rgbs.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
    pts.push(rgbToOklab(pixels[i], pixels[i + 1], pixels[i + 2]));
  }
  if (!pts.length) return [];
  const rand = rng(42);
  const kk = Math.min(k, pts.length);
  // k-means++ init
  const centers: Lab[] = [pts[Math.floor(rand() * pts.length)]];
  while (centers.length < kk) {
    const d2 = pts.map((p) => Math.min(...centers.map((c) => labDistance(p, c) ** 2)));
    const sum = d2.reduce((a, b) => a + b, 0);
    if (sum === 0) break;
    let r = rand() * sum;
    let idx = 0;
    while (r > d2[idx] && idx < d2.length - 1) r -= d2[idx++];
    centers.push(pts[idx]);
  }
  const assign = new Array(pts.length).fill(0);
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < pts.length; i++) {
      let bi = 0, bd = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = labDistance(pts[i], centers[c]);
        if (d < bd) { bd = d; bi = c; }
      }
      assign[i] = bi;
    }
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < pts.length; i++) {
      const s = sums[assign[i]];
      s[0] += pts[i][0]; s[1] += pts[i][1]; s[2] += pts[i][2]; s[3]++;
    }
    sums.forEach((s, c) => { if (s[3]) centers[c] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
  }
  // cluster stats with mean RGB
  let clusters = centers.map((c, ci) => {
    let n = 0, r = 0, g = 0, b = 0;
    for (let i = 0; i < pts.length; i++) if (assign[i] === ci) { n++; r += rgbs[i][0]; g += rgbs[i][1]; b += rgbs[i][2]; }
    return { lab: c, n, rgb: n ? [r / n, g / n, b / n] : [0, 0, 0] };
  }).filter((c) => c.n > 0);
  // merge near shades
  clusters.sort((a, b) => b.n - a.n);
  const merged: typeof clusters = [];
  for (const c of clusters) {
    const near = merged.find((m) => labDistance(m.lab, c.lab) < 0.07);
    if (near) {
      const t = near.n + c.n;
      near.rgb = near.rgb.map((v, i) => (v * near.n + c.rgb[i] * c.n) / t);
      near.n = t;
    } else merged.push({ ...c });
  }
  clusters = merged.sort((a, b) => b.n - a.n).slice(0, 3);
  const roles = ["background", "primary", "accent"];
  return clusters.map((c, i) => {
    const hex = rgbToHex(c.rgb[0], c.rgb[1], c.rgb[2]);
    return { hex, role: roles[i], name: nearestColorName(hex) };
  });
}
