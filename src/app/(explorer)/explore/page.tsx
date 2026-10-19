import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/** Old address for Home. The shell still mounts here; the client rewrites `/explore` to `/`. */
export default function ExplorePage() {
  return null;
}
