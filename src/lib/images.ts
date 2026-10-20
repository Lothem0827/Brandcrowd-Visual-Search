/**
 * Template images are self-hosted: every template has one full file, `<templateId>.webp`
 * (1200×1200 WebP), plus pre-built thumbs. The app never requests images from design.com.
 *
 * The base URL comes from `NEXT_PUBLIC_IMAGE_BASE` (inlined at build time):
 *  - unset / default: `/images`, i.e. files in `public/images/` served by Next.js
 *  - Cloudflare R2 (or any CDN): an absolute URL such as `https://img.example.com/templates`
 *
 * Sizes (written by `pnpm thumbs`, WebP q80):
 *  - full 1200 — FocusedView hero, home pivot
 *  - `thumbs/` 600 — explore / board / home grids
 *  - `thumbs-sm/` 480 — panels, covers, orbit, inspo, chips
 */
export const DEFAULT_IMAGE_BASE = "/images";

/** Normalise an image base: trim, drop trailing slashes, fall back to the default. */
export function normalizeImageBase(base: string | undefined | null): string {
  const b = (base ?? "").trim().replace(/\/+$/, "");
  return b || DEFAULT_IMAGE_BASE;
}

/** The configured image base (read once; Next.js inlines NEXT_PUBLIC_* at build time). */
export const IMAGE_BASE = normalizeImageBase(process.env.NEXT_PUBLIC_IMAGE_BASE);

/** URL of a template's self-hosted image: `${base}/${templateId}.webp`. */
export function templateImageUrl(templateId: string, base: string = IMAGE_BASE): string {
  return `${normalizeImageBase(base)}/${encodeURIComponent(templateId)}.webp`;
}

/** Width of the pre-built grid thumbnails written by `pnpm thumbs`. */
export const THUMB_WIDTH = 600;

/** Width of the pre-built compact thumbnails (panels, covers, chips) written by `pnpm thumbs`. */
export const THUMB_SM_WIDTH = 480;

/**
 * 600px thumbnail for grids: `${base}/thumbs/${templateId}.webp`, written by `pnpm thumbs`.
 * Callers fall back to `templateImageUrl` when it is missing.
 */
export function templateThumbUrl(templateId: string, base: string = IMAGE_BASE): string {
  return `${normalizeImageBase(base)}/thumbs/${encodeURIComponent(templateId)}.webp`;
}

/**
 * 480px thumbnail for panels, covers, orbit, inspo, chips:
 * `${base}/thumbs-sm/${templateId}.webp`. Callers fall back to `templateImageUrl` when missing.
 */
export function templateThumbSmUrl(templateId: string, base: string = IMAGE_BASE): string {
  return `${normalizeImageBase(base)}/thumbs-sm/${encodeURIComponent(templateId)}.webp`;
}

/**
 * Origin to allow in the CSP `img-src` when the image base is an absolute URL
 * (e.g. an R2 bucket). Relative bases are covered by `'self'` and return null.
 */
export function imageBaseOrigin(base: string | undefined | null): string | null {
  const b = normalizeImageBase(base);
  if (!/^https?:\/\//i.test(b)) return null;
  try {
    return new URL(b).origin;
  } catch {
    return null;
  }
}

/** Append a cache-busting retry counter to an image URL (used after a failed load). */
export function withRetry(url: string, attempt: number): string {
  if (attempt <= 0) return url;
  return `${url}${url.includes("?") ? "&" : "?"}retry=${attempt}`;
}
