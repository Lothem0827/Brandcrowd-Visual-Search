"use client";
import { useSyncExternalStore } from "react";

/**
 * Grid appearance preferences (columns per row, spacing, corner radius). Device-level,
 * persisted to localStorage (mirrors the BoardStore boundary) so they survive reloads.
 */
export interface GridSettings {
  /** tiles per row */
  columns: number;
  /** gap between tiles, px */
  gap: number;
  /** tile corner radius, px */
  radius: number;
}

export const GRID_LIMITS = {
  columns: { min: 4, max: 12 },
  gap: { min: 0, max: 32 },
  radius: { min: 0, max: 32 },
} as const;

export const GRID_DEFAULTS: GridSettings = { columns: 6, gap: 12, radius: 12 };

const KEY = "template-taxonomy:grid:v1";

function clamp(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function sanitize(raw: unknown): GridSettings {
  const p = (raw ?? {}) as Partial<GridSettings>;
  return {
    columns: clamp(p.columns, GRID_LIMITS.columns.min, GRID_LIMITS.columns.max, GRID_DEFAULTS.columns),
    gap: clamp(p.gap, GRID_LIMITS.gap.min, GRID_LIMITS.gap.max, GRID_DEFAULTS.gap),
    radius: clamp(p.radius, GRID_LIMITS.radius.min, GRID_LIMITS.radius.max, GRID_DEFAULTS.radius),
  };
}

let current: GridSettings = GRID_DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function read(): GridSettings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return sanitize(JSON.parse(raw));
  } catch {
    /* corrupt or unavailable */
  }
  return GRID_DEFAULTS;
}

const subscribe = (cb: () => void) => {
  if (!loaded && typeof window !== "undefined") {
    loaded = true;
    current = read();
  }
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const getSnapshot = () => current;
const getServerSnapshot = () => GRID_DEFAULTS;

export function setGridSettings(patch: Partial<GridSettings>) {
  current = sanitize({ ...current, ...patch });
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage full / unavailable */
  }
  listeners.forEach((l) => l());
}

export function resetGridSettings() {
  setGridSettings(GRID_DEFAULTS);
}

export function useGridSettings(): GridSettings {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
