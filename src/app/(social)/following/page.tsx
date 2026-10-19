import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getFollowingFeed } from "@/lib/social";

export const metadata: Metadata = { title: "Following" };

async function FollowingBody() {
  // Defer to request time — auth cookies must not run during prerender.
  await connection();

  if (!isSupabaseConfigured()) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Following</h1>
        <p className="text-sm text-muted-foreground">
          Connect Supabase to follow people and see their public boards.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const feed = await getFollowingFeed(user.id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Following</h1>
      {feed.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No public boards from people you follow yet. Explore profiles and hit Follow.
        </p>
      ) : (
        <ul className="space-y-2">
          {feed.map((item) => (
            <li key={item.id}>
              <Link
                href={item.profile ? `/u/${item.profile.handle}/b/${item.slug}` : "#"}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-3 hover:bg-muted/50"
              >
                <div>
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.profile ? `@${item.profile.handle}` : "Unknown"} · updated{" "}
                    {new Date(item.updated_at).toLocaleDateString()}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function FollowingPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Following</h1>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <FollowingBody />
    </Suspense>
  );
}
