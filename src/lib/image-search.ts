import type { RoleColor } from "./color";
import { decodeErrorMessage, paletteFromPixels, validateImageFile, validateImageSize } from "./image-validation";

/**
 * Client-side image search: decode the image from an object URL (no base64 copy of the
 * file), draw it onto a 72×72 canvas and run k-means in OKLab to get 3 dominant colours
 * (background = largest cluster). Only a 96px thumbnail is kept for display.
 * Upgrade path: replace with CLIP/SigLIP embeddings (see README).
 */
export type ImagePaletteResult = { ok: true; thumbUrl: string; palette: RoleColor[] } | { ok: false; message: string };

const SAMPLE = 72;
const THUMB = 96;

export async function paletteFromFile(file: File): Promise<ImagePaletteResult> {
  const valid = validateImageFile(file);
  if (!valid.ok) return valid;
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = objectUrl;
    try {
      await img.decode();
    } catch {
      return { ok: false, message: decodeErrorMessage(file) };
    }
    // SVGs without intrinsic size report 0×0; draw them at the sample size.
    const w = img.naturalWidth || SAMPLE;
    const h = img.naturalHeight || SAMPLE;
    const size = validateImageSize(w, h);
    if (!size.ok) return size;

    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE;
    canvas.height = SAMPLE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { ok: false, message: "Your browser can't analyse images (canvas unavailable)." };
    ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
    const result = paletteFromPixels(ctx.getImageData(0, 0, SAMPLE, SAMPLE).data);
    if (!result.ok) return result;

    // small square thumbnail (center crop) for the search chip and tree root
    const thumb = document.createElement("canvas");
    thumb.width = THUMB;
    thumb.height = THUMB;
    const tctx = thumb.getContext("2d");
    let thumbUrl = "";
    if (tctx) {
      const side = Math.min(w, h);
      tctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, THUMB, THUMB);
      thumbUrl = thumb.toDataURL("image/png");
    }
    return { ok: true, thumbUrl, palette: result.palette };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
