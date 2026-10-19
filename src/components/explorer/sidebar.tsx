"use client";
import {
  BookmarkIcon,
  CompassIcon,
  HomeIcon,
  SettingsIcon,
  SparklesIcon,
} from "lucide-react";
import { LogoMark } from "./logo";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useExplorer } from "./context";
import { getMoodboardStore } from "@/lib/moodboards";
import { useBoards } from "./use-boards";
import { BOTTOM_NAV_HEIGHT_PX } from "./header";

function Brand({ onHome }: { onHome: () => void }) {
  const { page } = useExplorer();
  return (
    <button
      type="button"
      aria-label="Home"
      aria-current={page === "home" ? "page" : undefined}
      onClick={onHome}
      className="grid size-7 place-items-center rounded-full text-foreground transition-transform hover:scale-105"
    >
      <LogoMark className="size-full" />
    </button>
  );
}

function NavButton({
  id,
  icon: Icon,
  label,
  active,
  badge,
  onClick,
  tooltipSide = "right",
}: {
  id?: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  badge?: number;
  onClick?: () => void;
  tooltipSide?: "right" | "top";
}) {
  const button = (
    <button
      id={id}
      type="button"
      aria-label={label}
      aria-current={active ? "page" : undefined}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "relative grid size-10 place-items-center rounded-xl transition-colors",
        active
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
    </button>
  );
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side={tooltipSide}>{label}</TooltipContent>
    </Tooltip>
  );
}

function useNavActions(onHome: () => void) {
  const {
    page,
    setPage,
    setView,
    unpinBoard,
    settingsOpen,
    setSettingsOpen,
  } = useExplorer();
  const { boards } = useBoards();
  const savedCount = new Set(boards.flatMap((b) => b.templateIds)).size;

  return {
    page,
    savedCount,
    settingsOpen,
    goHome: onHome,
    goExplore: () => {
      unpinBoard();
      setView({ kind: "search" });
      setPage("explore");
    },
    goBoards: () => {
      unpinBoard();
      setView({ kind: "search" });
      setPage("boards");
    },
    goBrief: () => {
      unpinBoard();
      getMoodboardStore().unpin();
      setPage("brief");
    },
    toggleSettings: () => setSettingsOpen(!settingsOpen),
  };
}

/** Desktop left rail (hidden on compact). */
export function Sidebar({ onHome }: { onHome: () => void }) {
  const nav = useNavActions(onHome);
  return (
    <TooltipProvider delay={300}>
      <aside
        aria-label="Primary"
        className="z-40 flex w-[60px] shrink-0 flex-col items-center gap-1.5 bg-background py-4 max-lg:hidden"
      >
        <Brand onHome={nav.goHome} />
        <nav className="my-auto flex flex-col items-center gap-1.5">
          <NavButton
            id="rail-explore"
            icon={CompassIcon}
            label="Explore"
            active={nav.page === "explore"}
            onClick={nav.goExplore}
          />
          <NavButton
            id="rail-boards"
            icon={BookmarkIcon}
            label="Boards"
            active={nav.page === "boards"}
            badge={nav.savedCount}
            onClick={nav.goBoards}
          />
          <NavButton
            id="rail-brief"
            icon={SparklesIcon}
            label="Moodboard"
            active={nav.page === "brief"}
            onClick={nav.goBrief}
          />
        </nav>
        <div className="flex flex-col items-center gap-1.5">
          <NavButton
            id="rail-settings"
            icon={SettingsIcon}
            label="Settings"
            active={nav.settingsOpen}
            onClick={nav.toggleSettings}
          />
        </div>
      </aside>
    </TooltipProvider>
  );
}

/** Compact bottom app-style navigation (tablet + phone). */
export function BottomNav({ onHome }: { onHome: () => void }) {
  const nav = useNavActions(onHome);
  return (
    <TooltipProvider delay={300}>
      <nav
        aria-label="Primary"
        data-testid="bottom-nav"
        className="z-40 flex w-full shrink-0 items-center justify-around border-t border-border/60 bg-background p-2 lg:hidden"
        style={{
          minHeight: `calc(${BOTTOM_NAV_HEIGHT_PX}px + env(safe-area-inset-bottom, 0px))`,
          paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <NavButton
          id="nav-home"
          icon={HomeIcon}
          label="Home"
          active={nav.page === "home"}
          onClick={nav.goHome}
          tooltipSide="top"
        />
        <NavButton
          id="nav-boards"
          icon={BookmarkIcon}
          label="Boards"
          active={nav.page === "boards"}
          badge={nav.savedCount}
          onClick={nav.goBoards}
          tooltipSide="top"
        />
        <NavButton
          id="nav-explore"
          icon={CompassIcon}
          label="Explore"
          active={nav.page === "explore"}
          onClick={nav.goExplore}
          tooltipSide="top"
        />
        <NavButton
          id="nav-brief"
          icon={SparklesIcon}
          label="Moodboard"
          active={nav.page === "brief"}
          onClick={nav.goBrief}
          tooltipSide="top"
        />
        <NavButton
          id="nav-settings"
          icon={SettingsIcon}
          label="Settings"
          active={nav.settingsOpen}
          onClick={nav.toggleSettings}
          tooltipSide="top"
        />
      </nav>
    </TooltipProvider>
  );
}
