"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function FollowButton({
  targetUserId,
  initiallyFollowing,
  onFollowChange,
  className,
}: {
  targetUserId: string;
  initiallyFollowing: boolean;
  onFollowChange?: (following: boolean) => void;
  className?: string;
}) {
  const { user, configured, signInWithGoogle } = useAuth();
  const [local, setLocal] = useState<boolean | null>(null);
  const following = local ?? initiallyFollowing;
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
        setLocal(false);
        onFollowChange?.(false);
      } else {
        await supabase.from("follows").insert({ follower_id: user.id, following_id: targetUserId });
        setLocal(true);
        onFollowChange?.(true);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        void onClick();
      }}
      className={cn(
        "rounded-full border border-border px-3 py-1.5 text-sm font-medium transition-transform hover:bg-muted active:scale-[0.97] disabled:opacity-50",
        className,
      )}
    >
      {!user ? "Sign in to follow" : following ? "Following" : "Follow"}
    </button>
  );
}
