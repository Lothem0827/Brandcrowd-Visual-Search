"use client";

import { useEffect, useState } from "react";
import { getBoardStore } from "@/lib/boards";
import { takeSyncNudgeMilestone } from "@/lib/sync-nudge";
import { useAuth } from "./auth-provider";

/**
 * Soft milestone dialog after 5 / 10 / 15… unique guest saves.
 * Never blocks further saves.
 */
export function SyncNudgeDialog() {
  const { user, configured, signInWithGoogle } = useAuth();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!configured || user) {
      setOpen(false);
      return;
    }
    const store = getBoardStore();
    const check = () => {
      const milestone = takeSyncNudgeMilestone(store.list());
      if (milestone !== null) {
        setCount(milestone);
        setOpen(true);
      }
    };
    // Don't fire on mount with pre-existing data unless they just crossed — takeSyncNudge uses last milestone.
    return store.subscribe(check);
  }, [configured, user]);

  if (!open || user) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-nudge-title"
    >
      <div className="w-full max-w-sm rounded-xl border border-border bg-background p-5 shadow-lg">
        <h2 id="sync-nudge-title" className="text-lg font-semibold">
          Sync your boards
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You’ve saved {count} designs on this device. Sign in with Google to sync boards online and
          open them anywhere.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            Sync with Google
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Keep saving locally
          </button>
        </div>
      </div>
    </div>
  );
}
