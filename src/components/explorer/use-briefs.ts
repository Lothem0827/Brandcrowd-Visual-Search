"use client";
import { useSyncExternalStore } from "react";
import { getBriefStore, type SavedBrief } from "@/lib/briefs";
import type { BriefDraft } from "@/lib/brief-board";

const EMPTY_DRAFTS: BriefDraft[] = [];
const EMPTY_SAVED: SavedBrief[] = [];
const subscribe = (cb: () => void) => getBriefStore().subscribe(cb);
const draftsSnapshot = () => getBriefStore().listDrafts();
const savedSnapshot = () => getBriefStore().listSaved();
const draftsServerSnapshot = () => EMPTY_DRAFTS;
const savedServerSnapshot = () => EMPTY_SAVED;

/** All brief drafts and saved snapshots, kept in sync with the localStorage store. */
export function useBriefs() {
  const drafts = useSyncExternalStore(subscribe, draftsSnapshot, draftsServerSnapshot);
  const saved = useSyncExternalStore(subscribe, savedSnapshot, savedServerSnapshot);
  return { drafts, saved, store: getBriefStore() };
}

/** The draft that "Add to brief" appends to; "" when the user has never made one. */
export function useActiveDraftId() {
  const store = getBriefStore();
  return useSyncExternalStore(subscribe, () => store.activeDraftId(), () => "");
}
