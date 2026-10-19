import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FollowButton } from "@/components/social/follow-button";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getFollowCounts, getProfileByHandle, getPublicBoards, getPublicMoodboards, isFollowing } from "@/lib/social";
import { SITE_NAME } from "@/lib/site";

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getProfileByHandle(handle);
  if (!profile) return { title: "Profile" };
  return {
    title: `${profile.display_name || profile.handle} (@${profile.handle})`,
    description: profile.bio || `Public boards and moodboards on ${SITE_NAME}`,
  };
}

export default async function ProfilePage({ params }: Props) {
  if (!isSupabaseConfigured()) notFound();
  const { handle } = await params;
  const profile = await getProfileByHandle(handle);
  if (!profile) notFound();

  const [boards, moodboards, counts, supabase] = await Promise.all([
    getPublicBoards(profile.id),
    getPublicMoodboards(profile.id),
    getFollowCounts(profile.id),
    createClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const following = user ? await isFollowing(user.id, profile.id) : false;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start gap-4">
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt=""
            className="size-16 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="flex size-16 items-center justify-center rounded-full bg-muted text-lg font-medium">
            {(profile.display_name || profile.handle).slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{profile.display_name || profile.handle}</h1>
          <p className="text-sm text-muted-foreground">@{profile.handle}</p>
          {profile.bio ? <p className="mt-2 text-sm">{profile.bio}</p> : null}
          <p className="mt-2 text-xs text-muted-foreground">
            {counts.followers} followers · {counts.following} following
          </p>
        </div>
        <FollowButton targetUserId={profile.id} initiallyFollowing={following} />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium tracking-wider text-muted-foreground uppercase">Boards</h2>
        {boards.length === 0 ? (
          <p className="text-sm text-muted-foreground">No public boards yet.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {boards.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/u/${profile.handle}/b/${b.slug}`}
                  className="block rounded-lg border border-border px-3 py-3 hover:bg-muted/50"
                >
                  <div className="font-medium">{b.name}</div>
                  <div className="text-xs text-muted-foreground">{b.template_ids.length} designs</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium tracking-wider text-muted-foreground uppercase">Moodboards</h2>
        {moodboards.length === 0 ? (
          <p className="text-sm text-muted-foreground">No public moodboards yet.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {moodboards.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/u/${profile.handle}/m/${m.slug}`}
                  className="block rounded-lg border border-border px-3 py-3 hover:bg-muted/50"
                >
                  <div className="font-medium">{m.query}</div>
                  <div className="text-xs text-muted-foreground">Moodboard</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
