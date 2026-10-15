import { describe, expect, it } from "vitest";
import {
  decodeErrorMessage,
  MAX_IMAGE_BYTES,
  paletteFromPixels,
  validateImageFile,
  validateImageSize,
} from "./image-validation";

const file = (name: string, type: string, size: number) => ({ name, type, size });
const solid = (n: number, rgba: [number, number, number, number]) => {
  const px = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) px.set(rgba, i * 4);
  return px;
};

describe("validateImageFile", () => {
  it("accepts normal images, including SVG", () => {
    expect(validateImageFile(file("a.png", "image/png", 50_000)).ok).toBe(true);
    expect(validateImageFile(file("a.svg", "image/svg+xml", 900)).ok).toBe(true);
    expect(validateImageFile(file("photo.jpg", "", 50_000)).ok).toBe(true); // some OSes omit the MIME type
  });

  it("rejects non-images like PDF and text", () => {
    const r = validateImageFile(file("doc.pdf", "application/pdf", 1000));
    expect(r).toEqual({ ok: false, message: expect.stringMatching(/image file/) });
    expect(validateImageFile(file("notes.txt", "", 10)).ok).toBe(false);
  });

  it("rejects empty files with a specific message", () => {
    expect(validateImageFile(file("empty.png", "image/png", 0))).toEqual({ ok: false, message: "That file is empty." });
  });

  it("caps uploads at 10 MB and says how big the file was", () => {
    expect(validateImageFile(file("ok.png", "image/png", MAX_IMAGE_BYTES)).ok).toBe(true);
    const r = validateImageFile(file("huge.png", "image/png", 108 * 1024 * 1024));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toMatch(/108 MB.*under 10\.0 MB/);
  });

  it("rejects absurd pixel counts", () => {
    expect(validateImageSize(6000, 6000).ok).toBe(true);
    expect(validateImageSize(20000, 20000).ok).toBe(false);
    expect(validateImageSize(0, 10).ok).toBe(false);
  });

  it("explains HEIC decode failures", () => {
    expect(decodeErrorMessage(file("IMG_1.HEIC", "", 10))).toMatch(/HEIC/);
    expect(decodeErrorMessage(file("x.png", "image/png", 10))).toMatch(/Couldn't read/);
  });
});

describe("paletteFromPixels", () => {
  it("extracts a palette from an opaque image", () => {
    const r = paletteFromPixels(solid(72 * 72, [240, 120, 30, 255]));
    expect(r.ok).toBe(true);
    expect(r.ok && r.palette[0].role).toBe("background");
  });

  it("refuses fully transparent images instead of returning arbitrary results", () => {
    const r = paletteFromPixels(solid(72 * 72, [0, 0, 0, 0]));
    expect(r).toEqual({ ok: false, message: expect.stringMatching(/transparent/) });
  });

  it("refuses images that are almost entirely transparent", () => {
    const px = solid(1000, [0, 0, 0, 0]);
    px.set([255, 0, 0, 255], 0); // 1 opaque pixel in 1000
    expect(paletteFromPixels(px).ok).toBe(false);
  });

  it("handles empty pixel data", () => {
    expect(paletteFromPixels(new Uint8ClampedArray()).ok).toBe(false);
  });
});
