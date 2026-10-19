"use client";
import { useState } from "react";
import { CheckIcon, ChevronDownIcon, FolderPlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/toast";
import type { Template } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { BoardCover } from "./board-cover";
import { useExplorer } from "./context";
import { DOCK_ABOVE_NAV } from "./header";
import { useBoards } from "./use-boards";

/**
 * Bottom toolbar that replaces the search dock while a board is in multi-select. Shows how many
 * designs are picked, the destination board(s) they were copied into (each removable), an "Add to
 * board" picker, and Remove (which drops them from the board being viewed). Adding copies: the
 * designs stay in this board.
 */
export function BoardSelectBar() {
  const { boardSelection, stopBoardSelect, byId } = useExplorer();
  const { boards, store } = useBoards();
  // Boards the selection has been copied into during this session; chips for each.
  const [addedTo, setAddedTo] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  if (!boardSelection) return null;
  const { boardId, ids } = boardSelection;
  const count = ids.length;
  const current = boards.find((b) => b.id === boardId);
  const targets = boards.filter((b) => b.id !== boardId);

  const boardItems = (id: string): Template[] =>
    (boards.find((b) => b.id === id)?.templateIds ?? [])
      .map((t) => byId(t))
      .filter((t): t is Template => !!t);

  const toggleTarget = (id: string, name: string) => {
    const added = addedTo.includes(id);
    if (added) {
      for (const tid of ids) store.removeItem(id, tid);
      setAddedTo((a) => a.filter((x) => x !== id));
      toast(`Removed ${count} from “${name}”`, { description: undefined });
    } else {
      for (const tid of ids) store.add(id, tid);
      setAddedTo((a) => [...a, id]);
      toast(`Added ${count} to “${name}”`);
    }
  };

  const removeFromBoard = () => {
    if (!current) return;
    for (const tid of ids) store.removeItem(boardId, tid);
    stopBoardSelect();
    toast(`Removed ${count} from “${current.name}”`, {
      action: { label: "Undo", onClick: () => [...ids].reverse().forEach((tid) => store.add(boardId, tid)) },
    });
  };

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 z-30 flex justify-center px-4",
        DOCK_ABOVE_NAV,
      )}
    >
      <div
        data-testid="board-select-bar"
        className={cn(
          "pointer-events-auto flex h-13 max-w-[min(100%,860px)] items-center gap-1.5 rounded-full bg-panel/95 pr-2 pl-4 backdrop-blur",
          "max-lg:w-full max-lg:max-w-none max-lg:overflow-x-auto",
        )}
      >
        <span className="shrink-0 text-sm font-semibold whitespace-nowrap tabular-nums">
          {count} selected
        </span>

        {addedTo.map((id) => {
          const b = boards.find((x) => x.id === id);
          if (!b) return null;
          return (
            <span
              key={id}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-muted py-0.5 pr-1 pl-0.5 text-xs"
            >
              <BoardCover items={boardItems(id)} className="size-6 rounded-md" />
              <span className="max-w-28 truncate font-medium">{b.name}</span>
              <button
                type="button"
                aria-label={`Undo add to ${b.name}`}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                onClick={() => toggleTarget(id, b.name)}
              >
                <XIcon className="size-3" />
              </button>
            </span>
          );
        })}

        <div className="min-w-0 flex-1" />

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            aria-label="Add to board"
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <FolderPlusIcon className="size-4" />
            <span className="hidden whitespace-nowrap sm:inline">Add to board</span>
            <ChevronDownIcon className="size-3.5 opacity-60" />
          </PopoverTrigger>
          <PopoverContent side="top" align="center" className="w-64 gap-1 p-1.5">
            <div className="px-2 pt-1 pb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              Add to board
            </div>
            <div className="thin-scroll max-h-56 overflow-y-auto">
              {targets.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">No other boards yet.</div>
              )}
              {targets.map((b) => {
                const on = addedTo.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={on}
                    onClick={() => toggleTarget(b.id, b.name)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <BoardCover items={boardItems(b.id)} className="size-7 shrink-0 rounded-md" />
                    <span className="flex-1 truncate">{b.name}</span>
                    <span className={cn("grid size-4 place-items-center rounded", on ? "bg-foreground text-background" : "bg-panel")}>
                      {on && <CheckIcon className="size-3" />}
                    </span>
                    <span className="w-6 text-right text-xs text-muted-foreground tabular-nums">{b.templateIds.length}</span>
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        <button
          type="button"
          onClick={removeFromBoard}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Trash2Icon className="size-4" />
          <span className="hidden whitespace-nowrap sm:inline">Remove</span>
        </button>

        <button
          type="button"
          aria-label="Exit select mode"
          onClick={stopBoardSelect}
          className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <XIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}
