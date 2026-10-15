"use client";
import { useTheme } from "next-themes";
import { BookmarkIcon, MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useExplorer } from "./context";
import { useBoards } from "./use-boards";

// export function Logo() {
//   return (
//     <div className="flex items-center gap-2.5">
//       <div
//         aria-hidden
//         className="grid size-8 place-items-center rounded-[10px] shadow-sm"
//         style={{ background: "conic-gradient(from 200deg, #F0812F, #E5484D, #9B6BE8, #4C7DF0, #22A06B, #D49B0B, #F0812F)" }}
//       >
//         <div className="size-3 rounded-full bg-white/95" />
//       </div>
//       <div className="leading-tight">
//         <div className="text-[15px] font-semibold tracking-tight">Template Taxonomy</div>
//         <div className="text-[11px] text-muted-foreground">Inspiration from design.com</div>
//       </div>
//     </div>
//   );
// }

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <div
      className="flex items-center rounded-xl bg-panel p-0.5"
      role="group"
      aria-label="Color theme"
    >
      <button
        type="button"
        aria-label="Light mode"
        aria-pressed={!dark}
        onClick={() => setTheme("light")}
        className={cn(
          "grid size-8 place-items-center rounded-lg transition-colors",
          !dark
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <SunIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Dark mode"
        aria-pressed={dark}
        onClick={() => setTheme("dark")}
        className={cn(
          "grid size-8 place-items-center rounded-lg transition-colors",
          dark
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <MoonIcon className="size-4" />
      </button>
    </div>
  );
}

export function TopBar() {
  const { setBoardsOpen } = useExplorer();
  const { boards } = useBoards();
  const savedCount = new Set(boards.flatMap((b) => b.templateIds)).size;
  return (
    <div
      role="toolbar"
      aria-label="Explorer controls"
      className="absolute top-4 right-4 z-30 flex items-center gap-2"
    >
      <Button
        variant="outline"
        className="h-9 rounded-xl bg-panel"
        onClick={() => setBoardsOpen(true)}
        aria-haspopup="dialog"
      >
        <BookmarkIcon aria-hidden />
        Boards
        {savedCount > 0 && (
          <span className="rounded-full bg-foreground px-1.5 text-[10px] text-background tabular-nums">
            {savedCount}
            <span className="sr-only"> saved</span>
          </span>
        )}
      </Button>
      <ThemeToggle />
    </div>
  );
}
