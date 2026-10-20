import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { getProfileByHandle } from "@/lib/social";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SITE_NAME } from "@/lib/site";

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  if (!isSupabaseConfigured()) return { title: "Profile" };
  const profile = await getProfileByHandle(handle);
  if (!profile) return { title: "Profile" };
  return {
    title: `${profile.display_name || profile.handle} (@${profile.handle})`,
    description: profile.bio || `Public boards and moodboards on ${SITE_NAME}`,
  };
}

async function DynamicMarker() {
  await connection();
  return null;
}

/** Public profile (`/u/[handle]`). The explorer shell reads the handle from the URL. */
export default function PublicProfileRoute() {
  return (
    <Suspense>
      <DynamicMarker />
    </Suspense>
  );
}
