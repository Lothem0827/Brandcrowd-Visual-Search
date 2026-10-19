import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getProfileByHandle, getPublicMoodboard } from "@/lib/social";
import { SITE_NAME } from "@/lib/site";

type Props = { params: Promise<{ handle: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle, slug } = await params;
  const profile = await getProfileByHandle(handle);
  if (!profile) return { title: "Moodboard" };
  const mb = await getPublicMoodboard(profile.id, slug);
  if (!mb) return { title: "Moodboard" };
  return {
    title: `${mb.query} · @${profile.handle}`,
    description: `Moodboard on ${SITE_NAME}`,
  };
}

export default async function PublicMoodboardPage({ params }: Props) {
  if (!isSupabaseConfigured()) notFound();
  const { handle, slug } = await params;
  const profile = await getProfileByHandle(handle);
  if (!profile) notFound();
  const mb = await getPublicMoodboard(profile.id, slug);
  if (!mb) notFound();

  const colors = (mb.colors as { hex: string; name: string }[]) ?? [];
  const tags = (mb.tags as string[]) ?? [];
  const titles = (mb.titles as string[]) ?? [];
  const inspoIds = (mb.inspo_ids as string[]) ?? [];
  const imageBase = process.env.NEXT_PUBLIC_IMAGE_BASE?.replace(/\/$/, "") || "/images";

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/u/${profile.handle}`} className="text-xs text-muted-foreground hover:text-foreground">
          @{profile.handle}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{mb.query}</h1>
      </div>

      {colors.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {colors.map((c) => (
            <span
              key={c.hex}
              className="size-8 rounded-full border border-border"
              style={{ backgroundColor: c.hex }}
              title={c.name}
            />
          ))}
        </div>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs">
              {t}
            </span>
          ))}
        </div>
      )}

      {titles.length > 0 && (
        <ul className="space-y-1 text-sm">
          {titles.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}

      {inspoIds.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {inspoIds.map((id) => (
            <li key={id}>
              <Link
                href={`/explore?design=${encodeURIComponent(id)}`}
                className="block overflow-hidden rounded-md border border-border bg-muted/30 aspect-square"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${imageBase}/${id}.webp`} alt="" className="size-full object-cover" loading="lazy" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
