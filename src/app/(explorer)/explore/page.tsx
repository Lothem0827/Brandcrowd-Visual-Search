import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/explore" },
};

/** Browse / search page. The shell mounts here; the client takes the page from the URL. */
export default function ExplorePage() {
  return null;
}
