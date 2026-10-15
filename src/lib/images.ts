/**
 * design.com preview URLs carry a `size=` parameter. The dataset stores the 600px
 * "design-preview-tall-2x" rendering (115–570 KB) as `thumbnailImage`, but tree tiles are
 * 64–92px, so the 200px "design-preview-tall" rendering (~33 KB) is plenty, even at 2x DPR.
 */
export const SMALL_THUMB_SIZE = "design-preview-tall";

/** Rewrite a design.com preview URL to the small thumbnail size. Other URLs are returned unchanged. */
export function smallThumbnail(url: string): string {
  if (!/^https:\/\/dynamic\.design\.com\//.test(url)) return url;
  if (!/[?&]size=/.test(url)) return url;
  return url.replace(/([?&]size=)[^&]*/, `$1${SMALL_THUMB_SIZE}`);
}

/** Append a cache-busting retry counter to an image URL (used after a failed load). */
export function withRetry(url: string, attempt: number): string {
  if (attempt <= 0) return url;
  return `${url}${url.includes("?") ? "&" : "?"}retry=${attempt}`;
}
