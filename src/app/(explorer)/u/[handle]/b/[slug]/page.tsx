import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { getProfileByHandle, getPublicBoard } from "@/lib/social";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SITE_NAME } from "@/lib/site";

type Props = { params: Promise<{ handle: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle, slug } = await params;
  if (!isSupabaseConfigured()) return { title: "Board" };
  const profile = await getProfileByHandle(handle);
  if (!profile) return { title: "Board" };
  const board = await getPublicBoard(profile.id, slug);
  if (!board) return { title: "Board" };
  return {
    title: `${board.name} · @${profile.handle}`,
    description: board.description || `Public board on ${SITE_NAME}`,
  };
}

async function DynamicMarker() {
  await connection();
  return null;
}

/** Public board (`/u/[handle]/b/[slug]`). Shown inside the explorer shell. */
export default function PublicBoardRoute() {
  return (
    <Suspense>
      <DynamicMarker />
    </Suspense>
  );
}
