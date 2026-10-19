import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "Board",
  robots: { index: false, follow: false },
};

/** Marks the route dynamic so Cache Components can prerender the shell with runtime metadata. */
async function DynamicMarker() {
  await connection();
  return null;
}

/**
 * One saved board (`/boards/<id>`). Boards live in the visitor's browser, so the page needs no
 * server data: the shell reads the id from the path and shows it after the local store loads.
 */
export default function BoardPage() {
  return (
    <Suspense>
      <DynamicMarker />
    </Suspense>
  );
}
