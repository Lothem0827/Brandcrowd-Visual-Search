"use client";

import { useState } from "react";
import { EditProfileDialog } from "@/components/auth/edit-profile-dialog";
import { ProfileAvatar } from "@/components/auth/profile-avatar";
import { FollowButton } from "@/components/social/follow-button";
import { FollowPeopleDialog } from "@/components/social/follow-people-dialog";
import { Button } from "@/components/ui/button";
import type { Profile } from "@/lib/supabase/database.types";

export function ProfileIdentity({
  profile,
  counts,
  onCountsChange,
  initiallyFollowing = false,
  isSelf,
  onEditProfile,
}: {
  profile: Profile;
  counts: { followers: number; following: number };
  onCountsChange?: (next: { followers: number; following: number }) => void;
  initiallyFollowing?: boolean;
  isSelf: boolean;
  onEditProfile?: () => void;
}) {
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [peopleTab, setPeopleTab] = useState<"followers" | "following">("followers");
  const [editOpen, setEditOpen] = useState(false);

  const openPeople = (tab: "followers" | "following") => {
    setPeopleTab(tab);
    setPeopleOpen(true);
  };

  const edit = () => {
    if (onEditProfile) onEditProfile();
    else setEditOpen(true);
  };

  return (
    <div className="flex flex-col items-center px-4 pt-2 text-center" data-testid="profile-identity">
      <ProfileAvatar src={profile.avatar_url} name={profile.display_name || profile.handle} />
      <h1 className="mt-4 text-xl font-semibold tracking-tight">
        {profile.display_name || profile.handle}
      </h1>
      <p className="mt-0.5 text-sm text-muted-foreground">@{profile.handle}</p>
      {profile.bio ? (
        <p className="mt-2 max-w-md text-sm text-pretty">{profile.bio}</p>
      ) : null}
      <div className="mt-3 flex items-center gap-1 text-sm text-muted-foreground">
        <button
          type="button"
          onClick={() => openPeople("followers")}
          className="rounded-md px-1.5 py-0.5 hover:text-foreground"
          data-testid="followers-count"
        >
          <span className="font-medium text-foreground tabular-nums">{counts.followers}</span>{" "}
          Followers
        </button>
        <span aria-hidden>·</span>
        <button
          type="button"
          onClick={() => openPeople("following")}
          className="rounded-md px-1.5 py-0.5 hover:text-foreground"
          data-testid="following-count"
        >
          <span className="font-medium text-foreground tabular-nums">{counts.following}</span>{" "}
          Following
        </button>
      </div>
      <div className="mt-4">
        {isSelf ? (
          <Button
            type="button"
            variant="outline"
            className="rounded-full px-4 active:scale-[0.97]"
            onClick={edit}
            data-testid="edit-profile"
          >
            Edit Profile
          </Button>
        ) : (
          <FollowButton
            targetUserId={profile.id}
            initiallyFollowing={initiallyFollowing}
            onFollowChange={(next) =>
              onCountsChange?.({
                ...counts,
                followers: counts.followers + (next ? 1 : -1),
              })
            }
          />
        )}
      </div>
      <FollowPeopleDialog
        open={peopleOpen}
        onOpenChange={setPeopleOpen}
        userId={profile.id}
        initialTab={peopleTab}
        onCountsChange={(delta) =>
          onCountsChange?.({
            followers: counts.followers + (delta.followers ?? 0),
            following: counts.following + (delta.following ?? 0),
          })
        }
      />
      {isSelf && !onEditProfile ? (
        <EditProfileDialog open={editOpen} onOpenChange={setEditOpen} />
      ) : null}
    </div>
  );
}
