import type { Board } from "@/lib/boards";

const LAST_KEY = "template-taxonomy:sync-nudge:last-milestone:v1";

export function uniqueDesignCount(boards: Board[]): number {
  const ids = new Set<string>();
  for (const b of boards) {
    for (const id of b.templateIds) ids.add(id);
  }
  return ids.size;
}

export function milestoneForCount(count: number): number | null {
  if (count < 5 || count % 5 !== 0) return null;
  return count;
}

export function getLastSyncMilestone(): number {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function setLastSyncMilestone(n: number) {
  try {
    localStorage.setItem(LAST_KEY, String(n));
  } catch {
    /* ignore */
  }
}

/** Returns the milestone to show, or null if none. */
export function takeSyncNudgeMilestone(boards: Board[]): number | null {
  const count = uniqueDesignCount(boards);
  const milestone = milestoneForCount(count);
  if (milestone === null) return null;
  if (milestone <= getLastSyncMilestone()) return null;
  setLastSyncMilestone(milestone);
  return milestone;
}
