import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getProfileByHandle, getPublicBoard } from "@/lib/social";
import { SITE_NAME } from "@/lib/site";

type Props = { params: Promise<{ handle: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle, slug } = await params;
  const profile = await getProfileByHandle(handle);
  if (!profile) return { title: "Board" };
  const board = await getPublicBoard(profile.id, slug);
  if (!board) return { title: "Board" };
  return {
    title: `${board.name} · @${profile.handle}`,
    description: board.description || `Public board on ${SITE_NAME}`,
  };
}

export default async function PublicBoardPage({ params }: Props) {
  if (!isSupabaseConfigured()) notFound();
  const { handle, slug } = await params;
  const profile = await getProfileByHandle(handle);
  if (!profile) notFound();
  const board = await getPublicBoard(profile.id, slug);
  if (!board) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/u/${profile.handle}`} className="text-xs text-muted-foreground hover:text-foreground">
          @{profile.handle}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{board.name}</h1>
        {board.description ? <p className="mt-1 text-sm text-muted-foreground">{board.description}</p> : null}
        <p className="mt-2 text-xs text-muted-foreground">{board.template_ids.length} designs</p>
      </div>
      {board.template_ids.length === 0 ? (
        <p className="text-sm text-muted-foreground">This board is empty.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {board.template_ids.map((id) => (
            <li key={id}>
              <Link
                href={`/explore?design=${encodeURIComponent(id)}`}
                className="block overflow-hidden rounded-md border border-border bg-muted/30 aspect-square"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${process.env.NEXT_PUBLIC_IMAGE_BASE?.replace(/\/$/, "") || "/images"}/${id}.webp`}
                  alt=""
                  className="size-full object-cover"
                  loading="lazy"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
