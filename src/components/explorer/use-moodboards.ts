"use client";
import { useSyncExternalStore } from "react";
import { EMPTY_MOODBOARD_STATE, getMoodboardStore, type MoodboardState } from "@/lib/moodboards";

const subscribe = (cb: () => void) => getMoodboardStore().subscribe(cb);
const snapshot = () => getMoodboardStore().getState();
const serverSnapshot = (): MoodboardState => EMPTY_MOODBOARD_STATE;

export function useMoodboards() {
  const state = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return { ...state, store: getMoodboardStore() };
}

/** True only while Find designs has the moodboard pinned. Ignores other draft edits. */
export function useMoodboardPinned() {
  return useSyncExternalStore(subscribe, () => getMoodboardStore().getState().pinned, () => false);
}
