"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { createClient } from "@/lib/supabase/client";

export function FollowButton({
  targetUserId,
  initiallyFollowing,
}: {
  targetUserId: string;
  initiallyFollowing: boolean;
}) {
  const { user, configured, signInWithGoogle } = useAuth();
  const [following, setFollowing] = useState(initiallyFollowing);
  const [busy, setBusy] = useState(false);

  if (!configured) return null;
  if (user?.id === targetUserId) return null;

  const onClick = async () => {
    if (!user) {
      await signInWithGoogle(window.location.pathname);
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      if (following) {
        await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", targetUserId);
        setFollowing(false);
      } else {
        await supabase.from("follows").insert({ follower_id: user.id, following_id: targetUserId });
        setFollowing(true);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void onClick()}
      className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
    >
      {!user ? "Sign in to follow" : following ? "Following" : "Follow"}
    </button>
  );
}
