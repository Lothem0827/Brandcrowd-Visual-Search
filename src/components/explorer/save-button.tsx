"use client";
import { useRef, useState } from "react";
import { BookmarkCheckIcon, BookmarkIcon, CheckIcon, ChevronDownIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/toast";
import { SAVED_BOARD_ID } from "@/lib/boards";
import { cn } from "@/lib/utils";
import { useBoards, useLastUsedBoardId } from "./use-boards";

/** Click = quick-save to the last-used board. Chevron or press-and-hold = board picker. */
export function SaveButton({ templateId, className }: { templateId: string; className?: string }) {
  const { boards, store } = useBoards();
  const activeId = useLastUsedBoardId();
  const [open, setOpen] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  // Fall back to "Saved" if the active id points at a board that's since gone.
  const active = boards.find((b) => b.id === activeId) ?? boards.find((b) => b.id === SAVED_BOARD_ID);
  const activeName = active?.name ?? "Saved";
  const inBoards = boards.filter((b) => b.templateIds.includes(templateId));
  const saved = inBoards.some((b) => b.id === active?.id);

  const quickSave = () => {
    if (!active) return;
    const nowSaved = store.toggle(active.id, templateId);
    toast(nowSaved ? `Saved to “${activeName}”` : `Removed from “${activeName}”`, {
      description: nowSaved ? "Use the ▾ button next to Save to add it to other boards." : undefined,
      action: nowSaved ? { label: "Choose boards", onClick: () => setOpen(true) } : undefined,
    });
  };

  return (
    <div className={cn("flex h-10 items-stretch overflow-hidden rounded-xl bg-panel", className)}>
      <button
        type="button"
        aria-pressed={saved}
        data-testid="save-button"
        title={saved ? `In: ${inBoards.map((b) => b.name).join(", ")}. Click to toggle “${activeName}”, hold to pick boards.` : `Click to save to “${activeName}”, hold to pick a board`}
        className={cn("flex flex-1 items-center justify-center gap-2 px-3 text-sm font-medium transition-colors hover:bg-muted", saved && "text-[#E5484D]")}
        onPointerDown={() => {
          held.current = false;
          holdTimer.current = setTimeout(() => {
            held.current = true;
            setOpen(true);
          }, 450);
        }}
        onPointerUp={() => holdTimer.current && clearTimeout(holdTimer.current)}
        onPointerLeave={() => holdTimer.current && clearTimeout(holdTimer.current)}
        onClick={() => {
          if (held.current) return;
          quickSave();
        }}
      >
        {saved ? <BookmarkCheckIcon className="size-4" /> : <BookmarkIcon className="size-4" />}
        <span className="truncate">{saved ? (inBoards.length > 1 ? `Saved · ${inBoards.length}` : "Saved") : "Save"}</span>
      </button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-label="Choose boards"
          data-testid="board-picker"
          className="grid aspect-square h-full place-items-center bg-muted/40 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronDownIcon className="size-4" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 gap-1 p-1.5">
          <div className="px-2 pt-1 pb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Save to board</div>
          <div className="thin-scroll max-h-56 overflow-y-auto">
            {boards.map((b) => {
              const on = b.templateIds.includes(templateId);
              const isActive = b.id === active?.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={on}
                  onClick={() => {
                    store.toggle(b.id, templateId);
                    store.setLastUsedBoard(b.id);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted",
                    isActive && "bg-muted/60",
                  )}
                >
                  <span className={cn("grid size-4 place-items-center rounded bg-panel", on && "bg-foreground text-background")}>
                    {on && <CheckIcon className="size-3" />}
                  </span>
                  <span className="flex-1 truncate">{b.name}</span>
                  {isActive && <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Active</span>}
                  <span className="text-xs text-muted-foreground tabular-nums">{b.templateIds.length}</span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
