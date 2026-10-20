"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { useExplorerOptional } from "@/components/explorer/context";
import { ProfileAvatar } from "@/components/auth/profile-avatar";
import { FollowButton } from "@/components/social/follow-button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getFollowers, getFollowing, getFollowingIds } from "@/lib/social";
import type { Profile } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

type Tab = "followers" | "following";

export function FollowPeopleDialog({
  open,
  onOpenChange,
  userId,
  initialTab,
  onCountsChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  initialTab: Tab;
  onCountsChange?: (delta: { followers?: number; following?: number }) => void;
}) {
  const { user } = useAuth();
  const explorer = useExplorerOptional();
  const router = useRouter();
  const [userTab, setUserTab] = useState<Tab | null>(null);
  const tab = userTab ?? initialTab;
  const loadKey = open ? `${userId}:${user?.id ?? ""}` : "";
  const [loaded, setLoaded] = useState<{
    key: string;
    followers: Profile[];
    following: Profile[];
    mine: Set<string>;
  } | null>(null);

  if (!open && userTab !== null) setUserTab(null);

  useEffect(() => {
    if (!open) return;
    const key = `${userId}:${user?.id ?? ""}`;
    let cancelled = false;
    void (async () => {
      const [fol, fing, ids] = await Promise.all([
        getFollowers(userId),
        getFollowing(userId),
        user ? getFollowingIds(user.id) : Promise.resolve(new Set<string>()),
      ]);
      if (cancelled) return;
      setLoaded({ key, followers: fol, following: fing, mine: ids });
    })();
    return () => {
      cancelled = true;
    };
  }, [open, userId, user]);

  const ready = loaded?.key === loadKey;
  const followers = loaded?.followers ?? [];
  const following = loaded?.following ?? [];
  const mine = loaded?.mine ?? new Set<string>();

  const people = tab === "followers" ? followers : following;

  const onFollowChange = (targetId: string, next: boolean) => {
    setLoaded((prev) => {
      if (!prev) return prev;
      const copy = new Set(prev.mine);
      if (next) copy.add(targetId);
      else copy.delete(targetId);
      return { ...prev, mine: copy };
    });
    if (user?.id === userId) {
      onCountsChange?.({ following: next ? 1 : -1 });
    }
  };

  const openPerson = (handle: string) => {
    onOpenChange(false);
    if (explorer) explorer.openProfile(handle);
    else router.push(`/u/${handle}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="lg:max-w-md" data-testid="follow-people-dialog">
        <DialogHeader>
          <DialogTitle className="sr-only">People</DialogTitle>
          <div className="flex items-stretch border-b border-border/60" role="tablist" aria-label="Follow lists">
            {(
              [
                ["followers", "Followers"],
                ["following", "Following"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setUserTab(id)}
                className={cn(
                  "-mb-px h-10 flex-1 border-b-2 text-[13px] font-medium transition-colors",
                  tab === id
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </DialogHeader>
        <div className="max-h-[min(24rem,50dvh)] overflow-y-auto">
          {!ready ? (
            <p className="px-1 py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : people.length === 0 ? (
            <p className="px-1 py-8 text-center text-sm text-muted-foreground">
              {tab === "followers" ? "No followers yet." : "Not following anyone yet."}
            </p>
          ) : (
            <ul className="grid gap-1">
              {people.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-lg px-1 py-2">
                  <button
                    type="button"
                    onClick={() => openPerson(p.handle)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <ProfileAvatar src={p.avatar_url} name={p.display_name || p.handle} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {p.display_name || p.handle}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">@{p.handle}</span>
                    </span>
                  </button>
                  <FollowButton
                    targetUserId={p.id}
                    initiallyFollowing={mine.has(p.id)}
                    onFollowChange={(next) => onFollowChange(p.id, next)}
                    className="h-7 rounded-full px-3 text-xs"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
