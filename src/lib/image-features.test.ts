import { describe, expect, it } from "vitest";
import { imageFeatures, lookBuckets } from "./image-features";

/** Build RGBA pixels for a size×size image from a per-pixel colour function. */
function pixels(size: number, fill: (x: number, y: number) => [number, number, number, number]) {
  const d = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = fill(x, y);
      const i = (y * size + x) * 4;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = a;
    }
  }
  return d;
}

const SIZE = 24;

describe("imageFeatures", () => {
  it("sees a solid mid-grey as fully flat with no edges or colour", () => {
    const f = imageFeatures(pixels(SIZE, () => [138, 138, 138, 255]), SIZE);
    expect(f.flatRatio).toBeGreaterThan(0.95);
    expect(f.coverage).toBeLessThan(0.05);
    expect(f.edgeDensity).toBeLessThan(0.02);
    expect(f.colorfulness).toBeLessThan(0.1);
  });

  it("reports high edge density for a checkerboard", () => {
    const f = imageFeatures(
      pixels(SIZE, (x, y) => ((x + y) % 2 ? [0, 0, 0, 255] : [255, 255, 255, 255])),
      SIZE,
    );
    expect(f.edgeDensity).toBeGreaterThan(0.8);
  });

  it("treats a vertical split as half-covered and asymmetric", () => {
    const f = imageFeatures(
      pixels(SIZE, (x) => (x < SIZE / 2 ? [255, 255, 255, 255] : [0, 0, 0, 255])),
      SIZE,
    );
    expect(f.coverage).toBeGreaterThan(0.35);
    expect(f.coverage).toBeLessThan(0.65);
    expect(f.symmetry).toBeLessThan(0.5);
    expect(f.edgeDensity).toBeGreaterThan(0.02);
  });

  it("scores a mirror-symmetric motif as symmetric", () => {
    const f = imageFeatures(
      pixels(SIZE, (x) => (Math.abs(x - (SIZE - 1) / 2) < 2 ? [0, 0, 0, 255] : [255, 255, 255, 255])),
      SIZE,
    );
    expect(f.symmetry).toBeGreaterThan(0.8);
  });

  it("measures colourfulness from chroma", () => {
    const grey = imageFeatures(pixels(SIZE, () => [128, 128, 128, 255]), SIZE);
    const orange = imageFeatures(pixels(SIZE, () => [240, 123, 34, 255]), SIZE);
    expect(orange.colorfulness).toBeGreaterThan(grey.colorfulness + 0.3);
  });

  it("is deterministic", () => {
    const p = pixels(SIZE, (x, y) => [x * 8, y * 8, 128, 255]);
    expect(imageFeatures(p, SIZE)).toEqual(imageFeatures(p, SIZE));
  });
});

describe("lookBuckets", () => {
  it("classifies a flat grey block as no image with airy, low-text look", () => {
    const b = lookBuckets(imageFeatures(pixels(SIZE, () => [138, 138, 138, 255]), SIZE));
    expect(b.imageType).toBe("none");
    expect(b.whitespace).toBe("airy");
    expect(b.textDensity).toBe("low");
  });

  it("classifies a vivid high-contrast block as a photo with a busy look", () => {
    // three vivid, luminance-contrasting colours in equal shares
    const cols = [[255, 220, 0], [0, 0, 255], [255, 0, 120]];
    const f = imageFeatures(
      pixels(SIZE, (x, y) => {
        const c = cols[(x + y) % 3];
        return [c[0], c[1], c[2], 255];
      }),
      SIZE,
    );
    const b = lookBuckets(f);
    expect(b.textDensity).toBe("high");
    expect(b.imageType).toBe("photo");
  });
});
