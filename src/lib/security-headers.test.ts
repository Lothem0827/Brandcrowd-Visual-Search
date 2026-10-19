import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "./security-headers";

describe("security headers", () => {
  it("serves images from this origin only by default and blocks framing", () => {
    const csp = contentSecurityPolicy(false, "");
    expect(csp).not.toContain("design.com");
    expect(csp).toMatch(/img-src 'self' data: blob:/);
    expect(csp).toMatch(/img-src [^;]*blob:/);
    expect(csp).toContain("https://*.supabase.co");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });
  it("allows the origin of an absolute image base (e.g. Cloudflare R2)", () => {
    const csp = contentSecurityPolicy(false, "https://img.example.com/templates/");
    expect(csp).toMatch(/img-src [^;]*https:\/\/img\.example\.com(;| )/);
    expect(csp).not.toContain("design.com");
    expect(contentSecurityPolicy(false, "/images")).toMatch(/img-src 'self' data: blob:/);
  });
  it("only allows eval in development", () => {
    expect(contentSecurityPolicy(false)).not.toContain("unsafe-eval");
    expect(contentSecurityPolicy(true)).toContain("unsafe-eval");
  });
  it("sets referrer policy and nosniff", () => {
    const keys = Object.fromEntries(securityHeaders(false).map((h) => [h.key, h.value]));
    expect(keys["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(keys["X-Content-Type-Options"]).toBe("nosniff");
  });
});
