import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { getProfileByHandle, getPublicMoodboard } from "@/lib/social";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SITE_NAME } from "@/lib/site";

type Props = { params: Promise<{ handle: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle, slug } = await params;
  if (!isSupabaseConfigured()) return { title: "Moodboard" };
  const profile = await getProfileByHandle(handle);
  if (!profile) return { title: "Moodboard" };
  const mb = await getPublicMoodboard(profile.id, slug);
  if (!mb) return { title: "Moodboard" };
  return {
    title: `${mb.query} · @${profile.handle}`,
    description: `Moodboard on ${SITE_NAME}`,
  };
}

async function DynamicMarker() {
  await connection();
  return null;
}

/** Public moodboard (`/u/[handle]/m/[slug]`). Shown inside the explorer shell. */
export default function PublicMoodboardRoute() {
  return (
    <Suspense>
      <DynamicMarker />
    </Suspense>
  );
}
