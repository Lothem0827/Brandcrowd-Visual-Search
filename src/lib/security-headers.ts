import { imageBaseOrigin } from "./images";

/**
 * Security headers applied to every route. Kept in its own module so it can be unit tested.
 *
 * Next.js injects inline bootstrap scripts (RSC payload, next-themes) without nonces when
 * pages are statically prerendered, so script-src keeps 'unsafe-inline'. Everything else is
 * locked to this origin. Template images are self-hosted; when NEXT_PUBLIC_IMAGE_BASE is an
 * absolute URL (e.g. Cloudflare R2), its origin is added to img-src.
 */
export function contentSecurityPolicy(dev: boolean, imageBase: string | undefined = process.env.NEXT_PUBLIC_IMAGE_BASE): string {
  const imageOrigin = imageBaseOrigin(imageBase);
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      "https://*.googleusercontent.com",
      "https://lh3.googleusercontent.com",
      ...(imageOrigin ? [imageOrigin] : []),
    ],
    "font-src": ["'self'"],
    "connect-src": [
      "'self'",
      "https://*.supabase.co",
      "wss://*.supabase.co",
      ...(dev ? ["ws:", "http://127.0.0.1:*", "http://localhost:*"] : []),
    ],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
}

export function securityHeaders(
  dev: boolean,
  imageBase: string | undefined = process.env.NEXT_PUBLIC_IMAGE_BASE,
): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(dev, imageBase) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
  ];
}
