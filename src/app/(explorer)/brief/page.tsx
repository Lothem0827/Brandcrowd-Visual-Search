import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Moodboard",
  robots: { index: false, follow: false },
};

/** Moodboard (`/brief`). Generation reads the loaded catalogue, so the page needs no server data. */
export default function BriefPage() {
  return null;
}
