import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Board",
  robots: { index: false, follow: false },
};

/**
 * One saved board (`/boards/<id>`). Boards live in the visitor's browser, so the page needs no
 * server data: the shell reads the id from the path and shows it after the local store loads.
 */
export default function BoardPage() {
  return null;
}
