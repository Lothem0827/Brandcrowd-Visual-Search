"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Template } from "@/lib/schema";
import { getProfileByHandle, getPublicBoard, getPublicMoodboard } from "@/lib/social";
import { SITE_NAME } from "@/lib/site";
import type { BoardRow, MoodboardRow } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { BackButton } from "./back-button";
import { useExplorer } from "./context";
import { GridView } from "./grid-view";
import { HEADER_ROW, HEADER_TITLE } from "./header";
import { moodboardRowToDraft } from "./public-profile-page";

type PublicBoard = BoardRow & { template_ids: string[] };

export function PublicBoardArea() {
  const { profileHandle, profileSlug, openProfile, byId } = useExplorer();
  const loadKey = `${profileHandle ?? ""}:${profileSlug ?? ""}`;
  const [board, setBoard] = useState<PublicBoard | null | undefined>(undefined);
  const [boardKey, setBoardKey] = useState(loadKey);
  if (boardKey !== loadKey) {
    setBoardKey(loadKey);
    setBoard(undefined);
  }
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const scrollRef = useCallback((el: HTMLDivElement | null) => setScrollEl(el), []);

  useEffect(() => {
    if (!profileHandle || !profileSlug) return;
    const handle = profileHandle;
    const slug = profileSlug;
    let cancelled = false;
    void (async () => {
      const profile = await getProfileByHandle(handle);
      if (!profile) {
        if (!cancelled) setBoard(null);
        return;
      }
      const next = await getPublicBoard(profile.id, slug);
      if (!cancelled) setBoard(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [profileHandle, profileSlug]);

  const items = useMemo(
    () => (board?.template_ids ?? []).map((id) => byId(id)).filter((t): t is Template => !!t),
    [board, byId],
  );

  useEffect(() => {
    if (!board || !profileHandle) return;
    document.title = `${board.name} · @${profileHandle} | ${SITE_NAME}`;
  }, [board, profileHandle]);

  if (!profileHandle) return null;

  return (
    <div className="flex h-full flex-col" data-testid="public-board-area">
      <div className={cn(HEADER_ROW, "z-10 bg-background")}>
        <BackButton
          label="Back to profile"
          side="top"
          onClick={() => openProfile(profileHandle)}
        />
        <h2 className={cn(HEADER_TITLE, "min-w-0 flex-1")}>{board?.name ?? "Board"}</h2>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums" role="status">
          {items.length} design{items.length === 1 ? "" : "s"}
        </span>
      </div>
      <div ref={scrollRef} className="thin-scroll min-h-0 flex-1 overflow-y-auto pb-28">
        {board === undefined ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">Loading board…</p>
        ) : board === null ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            This board is private or doesn’t exist.
          </p>
        ) : items.length ? (
          <GridView items={items} scrollContainer={scrollEl} overscan={1} eagerRows={1} thumbs />
        ) : (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">This board is empty.</p>
        )}
      </div>
    </div>
  );
}

export function PublicMoodboardArea() {
  const { profileHandle, profileSlug, openProfile, byId } = useExplorer();
  const loadKey = `${profileHandle ?? ""}:${profileSlug ?? ""}`;
  const [row, setRow] = useState<MoodboardRow | null | undefined>(undefined);
  const [rowKey, setRowKey] = useState(loadKey);
  if (rowKey !== loadKey) {
    setRowKey(loadKey);
    setRow(undefined);
  }
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const scrollRef = useCallback((el: HTMLDivElement | null) => setScrollEl(el), []);

  useEffect(() => {
    if (!profileHandle || !profileSlug) return;
    const handle = profileHandle;
    const slug = profileSlug;
    let cancelled = false;
    void (async () => {
      const profile = await getProfileByHandle(handle);
      if (!profile) {
        if (!cancelled) setRow(null);
        return;
      }
      const next = await getPublicMoodboard(profile.id, slug);
      if (!cancelled) setRow(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [profileHandle, profileSlug]);

  const draft = row ? moodboardRowToDraft(row) : null;
  const items = useMemo(
    () => (draft?.inspoIds ?? []).map((id) => byId(id)).filter((t): t is Template => !!t),
    [draft, byId],
  );
  const colors = draft?.colors ?? [];
  const tags = draft?.tags ?? [];

  useEffect(() => {
    if (!row || !profileHandle) return;
    const name = draft?.query?.trim() || "Moodboard";
    document.title = `${name} · @${profileHandle} | ${SITE_NAME}`;
  }, [row, draft?.query, profileHandle]);

  if (!profileHandle) return null;

  return (
    <div className="flex h-full flex-col" data-testid="public-moodboard-area">
      <div className={cn(HEADER_ROW, "z-10 bg-background")}>
        <BackButton
          label="Back to profile"
          side="top"
          onClick={() => openProfile(profileHandle)}
        />
        <h2 className={cn(HEADER_TITLE, "min-w-0 flex-1")}>{draft?.query ?? "Moodboard"}</h2>
      </div>
      <div ref={scrollRef} className="thin-scroll min-h-0 flex-1 overflow-y-auto pb-28">
        {row === undefined ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">Loading moodboard…</p>
        ) : row === null ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            This moodboard is private or doesn’t exist.
          </p>
        ) : (
          <>
            {colors.length > 0 ? (
              <div className="flex flex-wrap gap-2 px-4 pb-3">
                {colors.map((c) => (
                  <span
                    key={c.hex}
                    className="size-8 rounded-full border border-border"
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                  />
                ))}
              </div>
            ) : null}
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 px-4 pb-4">
                {tags.map((t) => (
                  <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
            {items.length ? (
              <GridView items={items} scrollContainer={scrollEl} overscan={1} eagerRows={1} thumbs />
            ) : (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">
                This moodboard has no designs.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
