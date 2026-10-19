"use client";
import {
  BookmarkIcon,
  HomeIcon,
  MoonIcon,
  RotateCcwIcon,
  SettingsIcon,
  SparklesIcon,
  SunIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { LogoMark } from "./logo";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  GRID_DEFAULTS,
  GRID_LIMITS,
  resetGridSettings,
  setGridSettings,
  useGridSettings,
  type GridSettings,
} from "./use-grid-settings";
import { cn } from "@/lib/utils";
import { useExplorer } from "./context";
import { getMoodboardStore } from "@/lib/moodboards";
import { useBoards } from "./use-boards";

function Brand({ onBrowse }: { onBrowse: () => void }) {
  return (
    <button
      type="button"
      aria-label="Home"
      onClick={onBrowse}
      className="grid size-7 place-items-center rounded-full text-foreground shadow-sm transition-transform hover:scale-105"
    >
      <LogoMark className="size-full" />
    </button>
  );
}

function RailButton({
  id,
  icon: Icon,
  label,
  active,
  disabled,
  badge,
  onClick,
  children,
}: {
  id?: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  disabled?: boolean;
  badge?: number;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  const button = (
    <button
      id={id}
      type="button"
      aria-label={label}
      aria-current={active ? "page" : undefined}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative grid size-10 place-items-center rounded-xl transition-colors",
        disabled
          ? "cursor-not-allowed text-muted-foreground/40"
          : active
            ? "bg-foreground/[0.06] text-foreground"
            : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
      )}
    >
      <Icon className="size-[18px]" />
      {badge ? (
        <span className="absolute top-1 right-1 rounded-full bg-foreground px-1 text-[9px] leading-4 text-background tabular-nums">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
      {children}
    </button>
  );
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

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

function GridSettingsButton() {
  const g = useGridSettings();
  const patch = (p: Partial<GridSettings>) => setGridSettings(p);
  const dirty =
    g.columns !== GRID_DEFAULTS.columns ||
    g.gap !== GRID_DEFAULTS.gap ||
    g.radius !== GRID_DEFAULTS.radius;
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              aria-label="Grid settings"
              className="grid size-10 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
            />
          }
        >
          <SettingsIcon className="size-[18px]" />
        </TooltipTrigger>
        <TooltipContent side="right">Grid settings</TooltipContent>
      </Tooltip>
      <PopoverContent side="right" align="start" className="w-64 gap-3.5 p-3.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Grid</span>
          <button
            type="button"
            disabled={!dirty}
            onClick={resetGridSettings}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <RotateCcwIcon className="size-3" /> Reset
          </button>
        </div>
        <Slider
          label="Columns per row"
          value={g.columns}
          min={GRID_LIMITS.columns.min}
          max={GRID_LIMITS.columns.max}
          onChange={(columns) => patch({ columns })}
        />
        <Slider
          label="Spacing"
          value={g.gap}
          min={GRID_LIMITS.gap.min}
          max={GRID_LIMITS.gap.max}
          suffix="px"
          onChange={(gap) => patch({ gap })}
        />
        <Slider
          label="Corner radius"
          value={g.radius}
          min={GRID_LIMITS.radius.min}
          max={GRID_LIMITS.radius.max}
          suffix="px"
          onChange={(radius) => patch({ radius })}
        />
        <div className="flex gap-1.5 pt-0.5" aria-hidden>
          {Array.from({ length: Math.min(6, g.columns) }).map((_, i) => (
            <span
              key={i}
              className="h-8 flex-1 bg-muted"
              style={{ borderRadius: Math.max(2, g.radius / 2) }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <div
      className="flex flex-col items-center gap-1.5"
      role="group"
      aria-label="Color theme"
    >
      <button
        type="button"
        aria-label="Light mode"
        aria-pressed={!dark}
        onClick={() => setTheme("light")}
        className={cn(
          "grid size-10 place-items-center rounded-xl transition-colors",
          !dark
            ? "bg-foreground/[0.06] text-foreground"
            : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
        )}
      >
        <SunIcon className="size-[18px]" />
      </button>
      <button
        type="button"
        aria-label="Dark mode"
        aria-pressed={dark}
        onClick={() => setTheme("dark")}
        className={cn(
          "grid size-10 place-items-center rounded-xl transition-colors",
          dark
            ? "bg-foreground/[0.06] text-foreground"
            : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
        )}
      >
        <MoonIcon className="size-[18px]" />
      </button>
    </div>
  );
}

export function Sidebar({ onBrowse }: { onBrowse: () => void }) {
  const { page, setPage, setView } = useExplorer();
  const { boards } = useBoards();
  const savedCount = new Set(boards.flatMap((b) => b.templateIds)).size;
  return (
    <TooltipProvider delay={300}>
      <aside
        aria-label="Primary"
        className="z-40 flex w-[60px] shrink-0 flex-col items-center gap-1.5 bg-background py-4"
      >
        <Brand onBrowse={onBrowse} />
        <nav className="my-auto flex flex-col items-center gap-1.5">
          <RailButton
            id="rail-home"
            icon={HomeIcon}
            label="Home"
            active={page === "explore"}
            onClick={onBrowse}
          />
          <RailButton
            id="rail-boards"
            icon={BookmarkIcon}
            label="Boards"
            active={page === "boards"}
            badge={savedCount}
            // Always the index: clearing the view turns /boards/<id> into /boards.
            onClick={() => {
              setView({ kind: "search" });
              setPage("boards");
            }}
          />
          <RailButton
            id="rail-brief"
            icon={SparklesIcon}
            label="Moodboard"
            active={page === "brief"}
            onClick={() => {
              getMoodboardStore().unpin();
              setPage("brief");
            }}
          />
        </nav>
        <div className="flex flex-col items-center gap-1.5">
          <ThemeToggle />
          <GridSettingsButton />
        </div>
      </aside>
    </TooltipProvider>
  );
}
