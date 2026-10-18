import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Design brief",
  robots: { index: false, follow: false },
};

/** Design brief workspace (`/brief`). Drafts are local, so the page needs no server data. */
export default function BriefPage() {
  return null;
}
