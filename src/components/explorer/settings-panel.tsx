"use client";
import { PanelRightCloseIcon, RotateCcwIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsCompact, useIsMobile, useIsTablet } from "@/lib/use-media-query";
import { useExplorer } from "./context";
import { replayOnboarding } from "@/lib/onboarding";
import { HEADER_CONTROL, HEADER_CONTROL_IDLE } from "./header";
import { SidePanel } from "./side-panel";
import { ThemeSwitch } from "./theme-switch";
import { SettingsAccount } from "@/components/auth/settings-account";
import {
  GRID_DEFAULTS,
  GRID_LIMITS,
  MOBILE_GRID_COLUMNS,
  MOBILE_GRID_GAP_MAX,
  MOBILE_GRID_RADIUS_MAX,
  TABLET_GRID_COLUMNS,
  TABLET_GRID_GAP_MAX,
  TABLET_GRID_RADIUS_MAX,
  resetGridSettings,
  setGridSettings,
  useDesktopColumnsMax,
  useEffectiveGridSettings,
  useGridSettings,
  type GridSettings,
} from "./use-grid-settings";

function Slider({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-foreground [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground"
      />
    </label>
  );
}

function Body({ onReplay }: { onReplay: () => void }) {
  const stored = useGridSettings();
  const g = useEffectiveGridSettings();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const isCompact = useIsCompact();
  const columnsMax = useDesktopColumnsMax();
  const gapMax = isMobile
    ? MOBILE_GRID_GAP_MAX
    : isTablet
      ? TABLET_GRID_GAP_MAX
      : GRID_LIMITS.gap.max;
  const radiusMax = isMobile
    ? MOBILE_GRID_RADIUS_MAX
    : isTablet
      ? TABLET_GRID_RADIUS_MAX
      : GRID_LIMITS.radius.max;
  const patch = (p: Partial<GridSettings>) => {
    if (isMobile) {
      if (p.gap !== undefined) p = { ...p, gap: Math.min(p.gap, MOBILE_GRID_GAP_MAX) };
      if (p.radius !== undefined) p = { ...p, radius: Math.min(p.radius, MOBILE_GRID_RADIUS_MAX) };
    } else if (isTablet) {
      if (p.gap !== undefined) p = { ...p, gap: Math.min(p.gap, TABLET_GRID_GAP_MAX) };
      if (p.radius !== undefined) p = { ...p, radius: Math.min(p.radius, TABLET_GRID_RADIUS_MAX) };
    }
    setGridSettings(p);
  };
  const dirty =
    stored.columns !== GRID_DEFAULTS.columns ||
    stored.gap !== GRID_DEFAULTS.gap ||
    stored.radius !== GRID_DEFAULTS.radius;
  const previewCols = isMobile
    ? MOBILE_GRID_COLUMNS
    : isTablet
      ? TABLET_GRID_COLUMNS
      : Math.min(6, g.columns);

  return (
    <div className="no-scrollbar flex-1 space-y-5 overflow-y-auto px-4 pb-24">
      {isCompact && (
        <section className="space-y-2">
          <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            Appearance
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">Theme</span>
            <ThemeSwitch />
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            Grid
          </div>
          <button
            type="button"
            disabled={!dirty}
            onClick={resetGridSettings}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <RotateCcwIcon className="size-3" /> Reset
          </button>
        </div>
        {!isCompact && (
          <Slider
            label="Columns per row"
            value={g.columns}
            min={GRID_LIMITS.columns.min}
            max={columnsMax}
            onChange={(columns) => patch({ columns })}
          />
        )}
        <Slider
          label="Spacing"
          value={g.gap}
          min={GRID_LIMITS.gap.min}
          max={gapMax}
          suffix="px"
          onChange={(gap) => patch({ gap })}
        />
        <Slider
          label="Corner radius"
          value={g.radius}
          min={GRID_LIMITS.radius.min}
          max={radiusMax}
          suffix="px"
          onChange={(radius) => patch({ radius })}
        />
        <div className="flex gap-1.5 pt-0.5" aria-hidden>
          {Array.from({ length: previewCols }).map((_, i) => (
            <span
              key={i}
              className="h-8 flex-1 bg-muted"
              style={{ borderRadius: Math.max(2, g.radius / 2) }}
            />
          ))}
        </div>
        {isMobile && (
          <p className="text-xs text-muted-foreground">
            Phone layout uses {MOBILE_GRID_COLUMNS} designs per row.
          </p>
        )}
        {isTablet && (
          <p className="text-xs text-muted-foreground">
            Tablet layout uses {TABLET_GRID_COLUMNS} designs per row.
          </p>
        )}
      </section>

      <section className="space-y-2">
        <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          Tutorial
        </div>
        <button
          type="button"
          onClick={onReplay}
          className="text-sm text-foreground hover:underline"
        >
          Replay tutorial
        </button>
      </section>

      <SettingsAccount />
    </div>
  );
}

/** Right-hand settings panel (theme + grid). */
export function SettingsPanel() {
  const { settingsOpen, setSettingsOpen, setPage, setHomePivotId, setView, clearAll } = useExplorer();
  const replay = () => {
    replayOnboarding();
    clearAll();
    setView({ kind: "search" });
    setHomePivotId(null);
    setSettingsOpen(false);
    setPage("home");
  };
  return (
    <SidePanel
      open={settingsOpen}
      onClose={() => setSettingsOpen(false)}
      width={320}
      label="Settings"
      testId="settings-panel"
    >
      <div className="flex shrink-0 items-center justify-between px-4 py-2.5">
        <div className="text-xl font-semibold">Settings</div>
        <button
          type="button"
          aria-label="Collapse settings"
          onClick={() => setSettingsOpen(false)}
          className={cn(HEADER_CONTROL, HEADER_CONTROL_IDLE)}
        >
          <PanelRightCloseIcon className="size-4" />
        </button>
      </div>
      {settingsOpen && <Body onReplay={replay} />}
    </SidePanel>
  );
}
