import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  // The local-only pages (/boards, /brief) are deliberately absent: they hold no shared content.
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
  ];
}
