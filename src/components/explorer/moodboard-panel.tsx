"use client";
import { PanelRightCloseIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { MoodboardBody, MoodboardHeaderActions } from "./brief-page";
import { HEADER_CONTROL, HEADER_CONTROL_IDLE } from "./header";
import { useMoodboards } from "./use-moodboards";

/** The working moodboard, pinned beside Explore the same way Design details is. */
export function MoodboardPanel() {
  const { pinned, store } = useMoodboards();

  return (
    <aside
      aria-hidden={!pinned}
      className={cn(
        "relative z-20 h-full shrink-0 overflow-hidden bg-background transition-[width] duration-300 ease-out",
        pinned ? "visible w-[400px] max-md:w-[92vw]" : "invisible w-0",
      )}
      aria-label="Moodboard"
      data-testid="moodboard-panel"
    >
      <div inert={!pinned} className="flex h-full w-[400px] max-md:w-[92vw] flex-col border-l border-border/60">
        <div className="flex shrink-0 items-center gap-1.5 px-3 py-2.5">
          <div className="min-w-0 flex-1 truncate text-xl font-semibold">Moodboard</div>
          <MoodboardHeaderActions compact />
          <button
            type="button"
            aria-label="Collapse moodboard"
            onClick={() => store.unpin()}
            className={cn(HEADER_CONTROL, HEADER_CONTROL_IDLE)}
          >
            <PanelRightCloseIcon className="size-4" />
          </button>
        </div>
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
          <MoodboardBody compact />
        </div>
      </div>
    </aside>
  );
}
