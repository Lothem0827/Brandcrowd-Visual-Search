"use client";
import { useSyncExternalStore } from "react";
import { getBoardStore, type Board } from "@/lib/boards";

const EMPTY: Board[] = [];
const subscribe = (cb: () => void) => getBoardStore().subscribe(cb);
const snapshot = () => getBoardStore().list();
const serverSnapshot = () => EMPTY;

export function useBoards() {
  const boards = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return { boards, store: getBoardStore() };
}
