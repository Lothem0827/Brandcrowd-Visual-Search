"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { EditProfileDialog } from "@/components/auth/edit-profile-dialog";
import { GoogleMark } from "@/components/auth/google-mark";
import { ProfileAvatar } from "@/components/auth/profile-avatar";
import { ProfileIdentity } from "@/components/social/profile-identity";
import { Button } from "@/components/ui/button";
import { getFollowCounts } from "@/lib/social";
import { BackButton } from "./back-button";
import { HEADER_INSET } from "./header";

export function BoardsProfileHeader({ onBack }: { onBack: () => void }) {
  const { ready, user, profile, configured, signInWithGoogle } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    void getFollowCounts(profile.id).then((next) => {
      if (!cancelled) setCounts(next);
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  return (
    <div className="relative pb-2">
      <div className={`absolute top-0 left-0 z-10 ${HEADER_INSET} pt-4`}>
        <BackButton label="Back" onClick={onBack} />
      </div>
      <div className="px-4 pt-14">
        {!configured || !ready || !user || !profile ? (
          <div className="flex flex-col items-center text-center" data-testid="boards-guest-header">
            <ProfileAvatar dashed name="" />
            <h1 className="mt-4 text-xl font-semibold tracking-tight">Your boards</h1>
            <p className="mt-2 max-w-sm text-sm text-pretty text-muted-foreground">
              Boards on this device stay here. Sync with Google to keep them, publish a profile,
              and follow other designers.
            </p>
            {configured ? (
              <Button
                type="button"
                variant="outline"
                className="mt-4 rounded-full px-4 active:scale-[0.97]"
                onClick={() => void signInWithGoogle("/boards")}
                data-testid="boards-sync-google"
              >
                <GoogleMark />
                Sync with Google
              </Button>
            ) : null}
          </div>
        ) : (
          <ProfileIdentity
            profile={profile}
            counts={counts}
            onCountsChange={setCounts}
            isSelf
            onEditProfile={() => setEditOpen(true)}
          />
        )}
      </div>
      <EditProfileDialog open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}
