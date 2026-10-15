import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "./security-headers";

describe("security headers", () => {
  it("allows template images and blocks framing", () => {
    const csp = contentSecurityPolicy(false);
    expect(csp).toMatch(/img-src [^;]*https:\/\/dynamic\.design\.com/);
    expect(csp).toMatch(/img-src [^;]*blob:/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
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
