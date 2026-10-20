"use client";
import { useSyncExternalStore } from "react";
import { getBoardStore, SAVED_BOARD_ID, type Board } from "@/lib/boards";

const EMPTY: Board[] = [];
const subscribe = (cb: () => void) => getBoardStore().subscribe(cb);
const snapshot = () => getBoardStore().list();
const serverSnapshot = () => EMPTY;

export function useBoards() {
  const boards = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return { boards, store: getBoardStore() };
}

/** The board quick-save targets (the last one the user picked); "saved" until they pick one. */
export function useLastUsedBoardId() {
  const store = getBoardStore();
  return useSyncExternalStore(subscribe, () => store.lastUsedBoardId(), () => SAVED_BOARD_ID);
}

/** Board id docked beside Explore during "Find more design", or null. */
export function useBoardPinned() {
  const store = getBoardStore();
  return useSyncExternalStore(subscribe, () => store.pinnedBoardId(), () => null);
}

/** Distinct designs saved on any board. The store caches this, so a render does not rescan. */
export function useSavedCount() {
  return useSyncExternalStore(subscribe, () => getBoardStore().savedCount(), () => 0);
}
