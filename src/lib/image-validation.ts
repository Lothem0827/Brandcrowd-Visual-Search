import { extractPalette, type RoleColor } from "./color";

/** Pure checks for image search uploads (no DOM, unit-tested). */

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** decoded size limit; a tiny compressed PNG can still expand to a huge bitmap */
export const MAX_IMAGE_PIXELS = 50_000_000;
/** below this share of opaque pixels there isn't enough colour to match on */
export const MIN_OPAQUE_RATIO = 0.02;

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg|ico|tiff?|heic|heif)$/i;
const HEIC = /\.(heic|heif)$/i;

export interface FileLike {
  name: string;
  type: string;
  size: number;
}

export type Check = { ok: true } | { ok: false; message: string };

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(bytes < 100 * 1024 * 1024 ? 1 : 0)} MB`;

export function isHeic(file: FileLike) {
  return /^image\/hei[cf]/i.test(file.type) || HEIC.test(file.name);
}

/** Validate a dropped/picked file before reading it. */
export function validateImageFile(file: FileLike): Check {
  const looksLikeImage = file.type ? file.type.startsWith("image/") : IMAGE_EXT.test(file.name);
  if (!looksLikeImage) return { ok: false, message: "Please drop an image file (PNG, JPG, WebP, GIF or SVG)." };
  if (file.size === 0) return { ok: false, message: "That file is empty." };
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, message: `That image is ${mb(file.size)}. Please use one under ${mb(MAX_IMAGE_BYTES)}.` };
  }
  return { ok: true };
}

/** Validate decoded dimensions. */
export function validateImageSize(width: number, height: number): Check {
  if (!width || !height) return { ok: false, message: "Couldn't read that image's size." };
  if (width * height > MAX_IMAGE_PIXELS) {
    return { ok: false, message: `That image is ${width}×${height} pixels. Please use one under 50 megapixels.` };
  }
  return { ok: true };
}

/** Message for a file the browser couldn't decode. */
export function decodeErrorMessage(file: FileLike): string {
  if (isHeic(file)) return "This browser can't read HEIC photos. Export it as JPG or PNG and try again.";
  return "Couldn't read that image. It may be damaged or in an unsupported format.";
}

/**
 * Extract the 3-colour palette from downscaled RGBA pixels, or explain why there is
 * nothing usable (fully or mostly transparent images).
 */
export function paletteFromPixels(pixels: Uint8ClampedArray | number[]): { ok: true; palette: RoleColor[] } | { ok: false; message: string } {
  const total = Math.floor(pixels.length / 4);
  let opaque = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] >= 128) opaque++;
  if (!total || opaque / total < MIN_OPAQUE_RATIO) {
    return { ok: false, message: "Couldn't find enough color in that image (is it transparent?). Try another image." };
  }
  const palette = extractPalette(pixels, 6, 10);
  if (!palette.length) return { ok: false, message: "Couldn't find any colors in that image. Try another image." };
  return { ok: true, palette };
}
