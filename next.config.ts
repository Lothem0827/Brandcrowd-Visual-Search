import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const dev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders(dev) },
      {
        // private internal tool: keep out of search engines
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noimageindex" }],
      },
      {
        // content-hashed dataset written by `pnpm data`
        source: "/data/templates.:version.json",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/data/templates-details.:version.json",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
