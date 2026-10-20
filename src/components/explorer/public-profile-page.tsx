"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookmarkIcon, PaletteIcon } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { ProfileIdentity } from "@/components/social/profile-identity";
import { uniqueTemplateCount } from "@/lib/boards";
import { HARMONIES, type HarmonyId } from "@/lib/harmony";
import type { MoodboardDraft } from "@/lib/moodboards";
import type { Template } from "@/lib/schema";
import {
  getFollowCounts,
  getProfileByHandle,
  getPublicBoards,
  getPublicMoodboards,
  isFollowing,
} from "@/lib/social";
import type { BoardRow, MoodboardRow, Profile } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { BackButton } from "./back-button";
import { BoardCover } from "./board-cover";
import { useExplorer } from "./context";
import { GridView } from "./grid-view";
import { HEADER_INSET } from "./header";
import { MoodboardCover, moodboardCardTitle } from "./moodboard-cover";

type Tab = "saves" | "boards" | "moodboards";
type PublicBoard = BoardRow & { template_ids: string[] };

const HARMONY_IDS = new Set<string>(HARMONIES.map((item) => item.id));

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export function moodboardRowToDraft(row: MoodboardRow): MoodboardDraft {
  return {
    id: row.id,
    query: row.query,
    titles: strings(row.titles),
    tags: strings(row.tags),
    colors: (Array.isArray(row.colors) ? row.colors : []) as unknown as MoodboardDraft["colors"],
    selected: row.selected,
    harmony: (HARMONY_IDS.has(row.harmony) ? row.harmony : "analogous") as HarmonyId,
    overrides: (row.overrides && typeof row.overrides === "object" ? row.overrides : {}) as Record<
      string,
      string
    >,
    inspoIds: strings(row.inspo_ids),
    updatedAt: new Date(row.updated_at).getTime(),
    isPublic: row.is_public,
    slug: row.slug,
    ownerId: row.owner_id,
  };
}

export function PublicProfilePage() {
  const { profileHandle, setPage, byId, base, openProfile } = useExplorer();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("saves");
  const [tabFor, setTabFor] = useState(profileHandle);
  if (tabFor !== profileHandle) {
    setTabFor(profileHandle);
    setTab("saves");
  }
  const [ready, setReady] = useState<{
    handle: string;
    profile: Profile | null;
    boards: PublicBoard[];
    moodboards: MoodboardRow[];
    counts: { followers: number; following: number };
    following: boolean;
  } | null>(null);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const scrollRef = useCallback((el: HTMLDivElement | null) => setScrollEl(el), []);

  useEffect(() => {
    if (!profileHandle) return;
    const handle = profileHandle;
    let cancelled = false;
    void (async () => {
      const profile = await getProfileByHandle(handle);
      if (!profile) {
        if (!cancelled) {
          setReady({
            handle,
            profile: null,
            boards: [],
            moodboards: [],
            counts: { followers: 0, following: 0 },
            following: false,
          });
        }
        return;
      }
      const [boards, moodboards, counts, following] = await Promise.all([
        getPublicBoards(profile.id),
        getPublicMoodboards(profile.id),
        getFollowCounts(profile.id),
        user ? isFollowing(user.id, profile.id) : Promise.resolve(false),
      ]);
      if (cancelled) return;
      setReady({ handle, profile, boards, moodboards, counts, following });
    })();
    return () => {
      cancelled = true;
    };
  }, [profileHandle, user]);

  const loaded = ready?.handle === profileHandle ? ready : null;
  const boards = useMemo(() => loaded?.boards ?? [], [loaded]);
  const moodboards = loaded?.moodboards ?? [];
  const saveCount = uniqueTemplateCount(boards.map((b) => ({ templateIds: b.template_ids })));

  const saves = useMemo(() => {
    if (tab !== "saves") return [];
    const seen = new Set<string>();
    const out: Template[] = [];
    for (const b of boards) {
      for (const id of b.template_ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        const t = byId(id);
        if (t) out.push(t);
      }
    }
    return out;
  }, [tab, boards, byId]);

  if (!profileHandle) return null;

  return (
    <div
      ref={scrollRef}
      className="thin-scroll h-full overflow-y-auto"
      data-testid="public-profile-page"
    >
      <div className="mx-auto w-full pb-28">
        <div className="relative pb-2">
          <div className={`absolute top-0 left-0 z-10 ${HEADER_INSET} pt-4`}>
            <BackButton label="Back" onClick={() => setPage("explore")} />
          </div>
          <div className="px-4 pt-14">
            {!loaded ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Loading profile…</p>
            ) : !loaded.profile ? (
              <div className="flex flex-col items-center px-4 pt-2 text-center">
                <h1 className="text-xl font-semibold tracking-tight">Profile not found</h1>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                  @{profileHandle} isn’t on Gridd, or the handle is wrong.
                </p>
              </div>
            ) : (
              <ProfileIdentity
                profile={loaded.profile}
                counts={loaded.counts}
                onCountsChange={(counts) =>
                  setReady((prev) => (prev ? { ...prev, counts } : prev))
                }
                initiallyFollowing={loaded.following}
                isSelf={false}
              />
            )}
          </div>
        </div>

        {loaded?.profile ? (
          <>
            <div className="mt-6 flex justify-center px-4">
              <div
                className="flex items-stretch border-b border-border/60"
                role="tablist"
                aria-label="Profile views"
              >
                {(
                  [
                    ["saves", `Saves ${saveCount}`],
                    ["boards", `Boards ${boards.length}`],
                    ["moodboards", `Moodboards ${moodboards.length}`],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => setTab(id)}
                    className={cn(
                      "-mb-px h-10 border-b-2 px-4 text-[13px] font-medium whitespace-nowrap transition-colors",
                      tab === id
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-5" />

            {tab === "saves" ? (
              saves.length ? (
                <GridView items={saves} scrollContainer={scrollEl} overscan={1} eagerRows={1} thumbs />
              ) : (
                <div className="flex flex-col items-center gap-1.5 px-4 py-24 text-center">
                  <BookmarkIcon className="size-7 text-muted-foreground" />
                  <div className="text-sm font-semibold">No public saves yet</div>
                  <div className="text-xs text-muted-foreground">
                    Designs on this designer’s public boards will show up here.
                  </div>
                </div>
              )
            ) : tab === "boards" ? (
              boards.length ? (
                <div className="grid grid-cols-2 gap-x-5 gap-y-7 px-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {boards.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => openProfile(profileHandle, { kind: "board", slug: b.slug })}
                      className="flex w-full flex-col gap-2 text-left"
                      data-testid="public-board-card"
                    >
                      <BoardCover
                        items={b.template_ids
                          .slice(0, 4)
                          .map((id) => byId(id))
                          .filter((t): t is Template => !!t)}
                        className="aspect-[3/2] w-full"
                      />
                      <div className="min-w-0 px-0.5">
                        <div className="truncate text-sm font-semibold">{b.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {b.description ||
                            `${b.template_ids.length} design${b.template_ids.length === 1 ? "" : "s"}`}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="px-4 py-24 text-center text-sm text-muted-foreground">
                  No public boards yet.
                </p>
              )
            ) : moodboards.length ? (
              <div className="grid grid-cols-2 gap-x-5 gap-y-7 px-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {moodboards.map((row) => {
                  const draft = moodboardRowToDraft(row);
                  const title = moodboardCardTitle(base, draft.query);
                  const designs = draft.inspoIds
                    .map((id) => byId(id))
                    .filter((t): t is Template => !!t);
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() =>
                        openProfile(profileHandle, { kind: "moodboard", slug: row.slug })
                      }
                      className="flex w-full flex-col gap-2 text-left"
                      data-testid="public-moodboard-card"
                    >
                      <MoodboardCover draft={draft} designs={designs} className="aspect-[3/2] w-full" />
                      <div className="min-w-0 px-0.5">
                        <div className="truncate text-sm font-semibold">{title}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5 px-4 py-24 text-center">
                <PaletteIcon className="size-7 text-muted-foreground" />
                <div className="text-sm font-semibold">No public moodboards yet</div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
