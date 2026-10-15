import { extractPalette, type RoleColor } from "./color";

/**
 * Client-side image search: downscale the image on a canvas and run k-means in
 * OKLab to get 3 dominant colours (background = largest cluster).
 * Upgrade path: replace with CLIP/SigLIP embeddings (see README).
 */
export async function paletteFromFile(file: File): Promise<{ url: string; palette: RoleColor[] }> {
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  const img = new Image();
  img.src = url;
  await img.decode();
  const size = 72;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  return { url, palette: extractPalette(data, 6, 10) };
}
