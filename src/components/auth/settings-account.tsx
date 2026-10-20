"use client";

import { useState } from "react";
import { LogOutIcon } from "lucide-react";
import { useAuth } from "./auth-provider";
import { EditProfileDialog } from "./edit-profile-dialog";
import { GoogleMark } from "./google-mark";
import { ProfileAvatar } from "./profile-avatar";

/** Account block for the bottom of the Settings panel. */
export function SettingsAccount() {
  const { ready, configured, user, profile, signInWithGoogle, signOut } = useAuth();
  const [editOpen, setEditOpen] = useState(false);

  if (!configured) {
    return (
      <section className="space-y-2 border-t border-border pt-4">
        <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Account</div>
        <p className="text-xs text-muted-foreground">
          Add Supabase env keys to enable Google sync.
        </p>
      </section>
    );
  }

  if (!ready) {
    return (
      <section className="space-y-2 border-t border-border pt-4">
        <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Account</div>
        <p className="text-xs text-muted-foreground">Loading…</p>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="space-y-3 border-t border-border pt-4">
        <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Account</div>
        <p className="text-xs text-muted-foreground">
          Sync boards online and open them on any device.
        </p>
        <button
          type="button"
          onClick={() => void signInWithGoogle()}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <GoogleMark />
          Sync with Google
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-3 border-t border-border pt-4">
      <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Account</div>
      <div className="flex items-center gap-3">
        <ProfileAvatar
          src={profile?.avatar_url}
          name={profile?.display_name || user.email || "?"}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{profile?.display_name || "Signed in"}</div>
          <div className="truncate text-xs text-muted-foreground">
            {profile?.handle ? `@${profile.handle}` : user.email}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setEditOpen(true)}
        className="flex w-full items-center justify-center rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
      >
        Edit profile
      </button>
      <button
        type="button"
        onClick={() => void signOut()}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <LogOutIcon className="size-3.5" />
        Sign out
      </button>
      <EditProfileDialog open={editOpen} onOpenChange={setEditOpen} />
    </section>
  );
}
