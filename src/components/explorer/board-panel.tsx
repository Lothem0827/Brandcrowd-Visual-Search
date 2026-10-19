"use client";
import { useState, type DragEvent } from "react";
import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/toast";
import { templateImageUrl } from "@/lib/images";
import type { Template } from "@/lib/schema";
import { readTemplateDrag } from "@/lib/template-drag";
import { cn } from "@/lib/utils";
import { BoardCover } from "./board-cover";
import { useExplorer } from "./context";
import { ThumbImage } from "./thumb-image";
import { useBoards } from "./use-boards";
import { useGridSettings } from "./use-grid-settings";

/**
 * A board docked beside Explore during "Find more design": selector to switch boards,
 * drop designs from the grid onto this board, and close back to the board page.
 */
export function BoardPanel() {
  const { byId, pinnedBoardId, pinBoard, unpinBoard, setPage, setView } = useExplorer();
  const { boards, store } = useBoards();
  const { gap, radius } = useGridSettings();
  const [open, setOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const board = pinnedBoardId
    ? boards.find((b) => b.id === pinnedBoardId)
    : undefined;
  const openPanel = !!board;
  const items = (board?.templateIds ?? [])
    .map((id) => byId(id))
    .filter((t): t is Template => !!t);

  const boardItems = (id: string): Template[] =>
    (boards.find((b) => b.id === id)?.templateIds ?? [])
      .map((t) => byId(t))
      .filter((t): t is Template => !!t);

  const selectBoard = (id: string) => {
    pinBoard(id);
    setOpen(false);
  };

  const close = () => {
    const id = pinnedBoardId;
    unpinBoard();
    if (!id) return;
    setPage("boards");
    setView({ kind: "board", boardId: id });
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    if (!board) return;
    const id = readTemplateDrag(event.dataTransfer);
    if (!id) return;
    if (board.templateIds.includes(id)) {
      toast(`Already in “${board.name}”`);
      return;
    }
    store.add(board.id, id);
    toast(`Added to “${board.name}”`);
  };

  return (
    <aside
      aria-hidden={!openPanel}
      className={cn(
        "relative z-20 h-full shrink-0 overflow-hidden bg-background transition-[width] duration-300 ease-out",
        openPanel ? "visible w-[400px] max-md:w-[92vw]" : "invisible w-0",
      )}
      aria-label="Board"
      data-testid="board-panel"
    >
      <div
        inert={!openPanel}
        className="flex h-full w-[400px] max-md:w-[92vw] flex-col border-l border-border/60"
      >
        <div className="flex shrink-0 items-center gap-1.5 px-3 py-2.5">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
              aria-label="Switch board"
              data-testid="board-panel-selector"
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1.5 py-1 text-left hover:bg-muted"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {board?.name ?? "Board"}
              </span>
              <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 gap-1 p-1.5">
              <div className="px-2 pt-1 pb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                Boards
              </div>
              <div className="thin-scroll max-h-56 overflow-y-auto">
                {boards.map((b) => {
                  const on = b.id === board?.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={on}
                      onClick={() => selectBoard(b.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted",
                        on && "bg-muted/60",
                      )}
                    >
                      <BoardCover items={boardItems(b.id)} className="size-7 shrink-0 rounded-md" />
                      <span className="min-w-0 flex-1 truncate">{b.name}</span>
                      {on && <CheckIcon className="size-3.5 shrink-0" />}
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {b.templateIds.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
          <button
            type="button"
            aria-label="Close board panel"
            onClick={close}
            className="grid size-7 shrink-0 place-items-center rounded-lg bg-panel hover:bg-muted"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>

        <div
          className={cn(
            "thin-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-4",
            dragOver && "bg-muted",
          )}
          data-testid="board-panel-drop"
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <p className="mb-3 text-xs text-muted-foreground">
            {items.length} design{items.length === 1 ? "" : "s"} · Drag designs here to save
          </p>
          {items.length === 0 ? (
            <div className="grid place-items-center rounded-2xl border border-dashed border-border/80 px-4 py-10 text-center">
              <p className="text-sm font-medium">Drag designs here</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Search on the left, then drop onto this board.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3" style={{ gap: gap / 2 }}>
              {items.map((t) => {
                const label = t.displayTitle || t.slug;
                return (
                  <div key={t.templateId} className="min-w-0">
                    <div
                      className="aspect-square overflow-hidden bg-muted ring-1 ring-black/5"
                      style={{ borderRadius: radius }}
                    >
                      <ThumbImage
                        src={templateImageUrl(t.templateId)}
                        alt={label}
                        className="size-full object-cover"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
