"use client";

import { useState } from "react";
import { CheckIcon, GlobeIcon, LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/auth-provider";
import { getBoardStore } from "@/lib/boards";
import { getMoodboardStore } from "@/lib/moodboards";

export function BoardPublicToggle({
  boardId,
  isPublic,
  slug,
}: {
  boardId: string;
  isPublic?: boolean;
  slug?: string;
}) {
  const { user, profile, configured, signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!configured) return null;

  const onToggle = async () => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    setBusy(true);
    try {
      await getBoardStore().setPublic?.(boardId, !isPublic);
      toast.success(!isPublic ? "Board is public" : "Board is private");
    } finally {
      setBusy(false);
    }
  };

  const onCopy = async () => {
    if (!profile?.handle || !slug) return;
    const url = `${window.location.origin}/u/${profile.handle}/b/${slug}`;
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  };

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void onToggle()}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        title={isPublic ? "Make private" : "Make public"}
      >
        {isPublic ? <CheckIcon className="size-3.5" /> : <GlobeIcon className="size-3.5" />}
        {isPublic ? "Public" : "Make public"}
      </button>
      {isPublic && profile?.handle && slug ? (
        <button
          type="button"
          onClick={() => void onCopy()}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Copy public link"
        >
          <LinkIcon className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export function MoodboardPublicToggle({
  moodboardId,
  isPublic,
  slug,
}: {
  moodboardId: string;
  isPublic?: boolean;
  slug?: string;
}) {
  const { user, profile, configured, signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!configured) return null;

  const onToggle = async () => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    setBusy(true);
    try {
      await getMoodboardStore().setPublic?.(moodboardId, !isPublic);
      toast.success(!isPublic ? "Moodboard is public" : "Moodboard is private");
    } finally {
      setBusy(false);
    }
  };

  const onCopy = async () => {
    if (!profile?.handle || !slug) return;
    const url = `${window.location.origin}/u/${profile.handle}/m/${slug}`;
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  };

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void onToggle()}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <GlobeIcon className="size-3.5" />
        {isPublic ? "Public" : "Make public"}
      </button>
      {isPublic && profile?.handle && slug ? (
        <button
          type="button"
          onClick={() => void onCopy()}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Copy public link"
        >
          <LinkIcon className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
