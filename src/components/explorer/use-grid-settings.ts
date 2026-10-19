"use client";
import { useSyncExternalStore } from "react";
import { useIsMobile, useIsTablet, useIsWide, useIsXl } from "@/lib/use-media-query";

/** Phone layout forces this many columns (desktop prefs stay in localStorage). */
export const MOBILE_GRID_COLUMNS = 2;
/** Tablet layout forces this many columns (desktop prefs stay in localStorage). */
export const TABLET_GRID_COLUMNS = 4;
/** Phone caps for spacing / corner radius (desktop prefs stay in localStorage). */
export const MOBILE_GRID_GAP_MAX = 16;
export const MOBILE_GRID_RADIUS_MAX = 16;
/** Tablet caps for spacing / corner radius. */
export const TABLET_GRID_GAP_MAX = 20;
export const TABLET_GRID_RADIUS_MAX = 20;
/** Desktop column max by viewport: 1024–1279 → 8, 1280–1535 → 10, ≥1536 → 12. */
export const DESKTOP_COLUMNS_MAX_NARROW = 8;
export const DESKTOP_COLUMNS_MAX_WIDE = 10;
export const DESKTOP_COLUMNS_MAX_XL = 12;

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
/** When set, grid writes also upsert to Supabase user_settings. */
let cloudUserId: string | null = null;

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

export function getGridSettingsSnapshot(): GridSettings {
  if (!loaded && typeof window !== "undefined") {
    loaded = true;
    current = read();
  }
  return current;
}

export function setGridCloudUser(userId: string | null) {
  cloudUserId = userId;
}

export async function pushGridSettingsToCloud(userId: string) {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  await supabase.from("user_settings").upsert({
    user_id: userId,
    grid: getGridSettingsSnapshot() as unknown as import("@/lib/supabase/database.types").Json,
    updated_at: new Date().toISOString(),
  });
}

/** Prefer cloud grid when present; otherwise keep local. */
export async function pullCloudGridSettings(userId: string) {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  const { data } = await supabase.from("user_settings").select("grid").eq("user_id", userId).maybeSingle();
  if (data?.grid && typeof data.grid === "object") {
    current = sanitize(data.grid);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(current));
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l());
  }
  setGridCloudUser(userId);
}

export function setGridSettings(patch: Partial<GridSettings>) {
  current = sanitize({ ...current, ...patch });
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage full / unavailable */
  }
  listeners.forEach((l) => l());
  if (cloudUserId) void pushGridSettingsToCloud(cloudUserId);
}

export function resetGridSettings() {
  setGridSettings(GRID_DEFAULTS);
}

export function useGridSettings(): GridSettings {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Desktop max columns for the current viewport width band. */
export function desktopColumnsMax(isWide: boolean, isXl: boolean): number {
  if (isXl) return DESKTOP_COLUMNS_MAX_XL;
  if (isWide) return DESKTOP_COLUMNS_MAX_WIDE;
  return DESKTOP_COLUMNS_MAX_NARROW;
}

/** Viewport-based desktop column max (for settings slider + effective cap). */
export function useDesktopColumnsMax(): number {
  return desktopColumnsMax(useIsWide(), useIsXl());
}

/**
 * Stored prefs with device caps applied (does not rewrite localStorage).
 * Phone: 2 cols, gap/radius ≤16. Tablet: 4 cols, gap/radius ≤20.
 * Desktop: columns capped by viewport (8 / 10 / 12).
 */
export function useEffectiveGridSettings(): GridSettings {
  const g = useGridSettings();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const columnsMax = useDesktopColumnsMax();
  if (isMobile) {
    return {
      columns: MOBILE_GRID_COLUMNS,
      gap: Math.min(g.gap, MOBILE_GRID_GAP_MAX),
      radius: Math.min(g.radius, MOBILE_GRID_RADIUS_MAX),
    };
  }
  if (isTablet) {
    return {
      columns: TABLET_GRID_COLUMNS,
      gap: Math.min(g.gap, TABLET_GRID_GAP_MAX),
      radius: Math.min(g.radius, TABLET_GRID_RADIUS_MAX),
    };
  }
  return {
    ...g,
    columns: Math.min(g.columns, columnsMax),
  };
}
