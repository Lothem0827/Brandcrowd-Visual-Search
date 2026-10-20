"use client";
import { useLayoutEffect, useRef, useState, type DragEvent } from "react";
import { CheckIcon, ChevronDownIcon, PanelRightCloseIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "@/components/ui/toast";
import { templateImageUrl, templateThumbSmUrl } from "@/lib/images";
import { computeWindow } from "./use-windowed-grid";
import type { Template } from "@/lib/schema";
import { readTemplateDrag, writeTemplateDrag } from "@/lib/template-drag";
import { cn } from "@/lib/utils";
import { BoardCover } from "./board-cover";
import { useExplorer } from "./context";
import {
  HEADER_CONTROL,
  HEADER_CONTROL_IDLE,
  HEADER_CONTROL_ON,
} from "./header";
import { SidePanel } from "./side-panel";
import { ThumbImage } from "./thumb-image";
import { useBoards } from "./use-boards";
import { useEffectiveGridSettings } from "./use-grid-settings";

/**
 * A board docked beside Explore during "Find more design": selector to switch boards,
 * drop designs from the grid onto this board, drag out to remove, and collapse without
 * dismissing sibling side panels.
 */
export function BoardPanel() {
  const { byId, pinnedBoardId, pinBoard, unpinBoard } = useExplorer();
  const { boards, store } = useBoards();
  const { gap, radius } = useEffectiveGridSettings();
  const [open, setOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  /** Design currently dragged from this panel; removed on dragend if released outside. */
  const draggingOutId = useRef<string | null>(null);
  const overPanel = useRef(false);

  const board = pinnedBoardId
    ? boards.find((b) => b.id === pinnedBoardId)
    : undefined;
  const openPanel = !!board;
  const ids = board?.templateIds ?? [];
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const scrollFrame = useRef(0);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [scrollTop, setScrollTop] = useState(0);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const measure = () => {
      setBox({ width: scroller.clientWidth, height: scroller.clientHeight });
      setScrollTop(scroller.scrollTop);
    };
    measure();
    const onScroll = () => {
      if (scrollFrame.current) return;
      scrollFrame.current = requestAnimationFrame(() => {
        scrollFrame.current = 0;
        setScrollTop(scroller.scrollTop);
      });
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (scrollFrame.current) cancelAnimationFrame(scrollFrame.current);
      scrollFrame.current = 0;
      ro.disconnect();
    };
  }, [openPanel, ids.length]);

  const panelGap = gap / 2;
  const grid = computeWindow({
    count: ids.length,
    columns: 3,
    gap: panelGap,
    width: box.width,
    height: box.height,
    scrollTop,
    overscan: 1,
  });

  const boardItems = (id: string): Template[] =>
    (boards.find((b) => b.id === id)?.templateIds ?? [])
      .slice(0, 4)
      .map((t) => byId(t))
      .filter((t): t is Template => !!t);

  const selectBoard = (id: string) => {
    pinBoard(id);
    setOpen(false);
  };

  const close = () => {
    unpinBoard();
  };

  const setPanelHover = (event: DragEvent, inside: boolean) => {
    const related = event.relatedTarget as Node | null;
    if (inside || !event.currentTarget.contains(related)) {
      overPanel.current = inside;
      if (!inside) setDragOver(false);
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    overPanel.current = true;
    if (!board) return;
    const id = readTemplateDrag(event.dataTransfer);
    if (!id) return;
    // Dropping a board item back onto itself is a cancel, not a re-add.
    if (draggingOutId.current === id || board.templateIds.includes(id)) {
      if (draggingOutId.current !== id) toast(`Already in “${board.name}”`);
      return;
    }
    store.add(board.id, id);
    toast(`Added to “${board.name}”`);
  };

  const onItemDragStart = (event: DragEvent, templateId: string) => {
    writeTemplateDrag(event.dataTransfer, templateId);
    event.dataTransfer.effectAllowed = "copyMove";
    draggingOutId.current = templateId;
    overPanel.current = true;
  };

  const onItemDragEnd = () => {
    const id = draggingOutId.current;
    draggingOutId.current = null;
    if (!id || !board || overPanel.current) return;
    store.removeItem(board.id, id);
    toast(`Removed from “${board.name}”`);
  };

  return (
    <SidePanel
      open={openPanel}
      onClose={close}
      width={400}
      label="Board"
      testId="board-panel"
    >
      <div className="flex shrink-0 items-center gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
              aria-label="Switch board"
              data-testid="board-panel-selector"
              className="inline-flex max-w-full min-w-0 items-center gap-2 text-left"
            >
              <span className="min-w-0 truncate text-xl font-semibold">
                {board?.name ?? "Board"}
              </span>
              <span
                className={cn(
                  HEADER_CONTROL,
                  open ? HEADER_CONTROL_ON : HEADER_CONTROL_IDLE,
                )}
              >
                <ChevronDownIcon className="size-4" />
              </span>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 gap-1 p-1.5">
              <div className="no-scrollbar max-h-56 overflow-y-auto">
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
                      <BoardCover
                        items={boardItems(b.id)}
                        className="size-7 shrink-0 rounded-md"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {b.name}
                      </span>
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
        </div>
        <button
          type="button"
          aria-label="Collapse board panel"
          onClick={close}
          className={cn(HEADER_CONTROL, HEADER_CONTROL_IDLE)}
        >
          <PanelRightCloseIcon className="size-4" />
        </button>
      </div>

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col px-4 pb-4",
          dragOver && "bg-muted",
        )}
        data-testid="board-panel-drop"
        onDragEnter={(event) => setPanelHover(event, true)}
        onDragOver={(event) => {
          event.preventDefault();
          overPanel.current = true;
          event.dataTransfer.dropEffect = draggingOutId.current
            ? "move"
            : "copy";
          setDragOver(true);
        }}
        onDragLeave={(event) => setPanelHover(event, false)}
        onDrop={onDrop}
      >
        <p className="mb-3 shrink-0 text-sm text-muted-foreground">
          {ids.length} design{ids.length === 1 ? "" : "s"} · Drop to add ·
          Drag out to remove
        </p>
        {ids.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-border/80 px-4 py-10 text-center">
            <p className="text-sm font-medium">Drag designs here</p>
          </div>
        ) : (
          <div ref={scrollerRef} className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
            <div className="relative w-full" style={{ height: grid.totalHeight }}>
              {Array.from({ length: Math.max(0, grid.lastRow - grid.firstRow) }, (_, i) => {
                const row = grid.firstRow + i;
                const start = row * grid.cols;
                return (
                  <div
                    key={row}
                    className="absolute inset-x-0 grid grid-cols-3"
                    style={{
                      top: row * grid.rowHeight,
                      height: grid.tileHeight,
                      gap: panelGap,
                    }}
                  >
                    {ids.slice(start, start + grid.cols).map((id) => {
                      const template = byId(id);
                      if (!template) return <div key={id} />;
                      const label = template.displayTitle || template.slug;
                      return (
                        <div
                          key={template.templateId}
                          className="min-w-0"
                          draggable
                          title="Drag out to remove"
                          onDragStart={(event) => onItemDragStart(event, template.templateId)}
                          onDragEnd={onItemDragEnd}
                        >
                          <div
                            className="aspect-square cursor-grab overflow-hidden bg-muted ring-1 ring-black/5 active:cursor-grabbing"
                            style={{ borderRadius: radius }}
                          >
                            <ThumbImage
                              src={templateThumbSmUrl(template.templateId)}
                              fallbackSrc={templateImageUrl(template.templateId)}
                              alt={label}
                              className="pointer-events-none size-full object-cover"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </SidePanel>
  );
}
