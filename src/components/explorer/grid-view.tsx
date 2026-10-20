"use client";
import { memo, useLayoutEffect, useRef, useState } from "react";
import { BookmarkCheckIcon, BookmarkIcon, CheckIcon } from "lucide-react";
import type { Template } from "@/lib/schema";
import { SAVED_BOARD_ID } from "@/lib/boards";
import { cn } from "@/lib/utils";
import { useIsCompact } from "@/lib/use-media-query";
import { useExplorer } from "./context";
import { useBoards, useLastUsedBoardId } from "./use-boards";
import { SCROLL_PAD_DOCK } from "./header";
import { useEffectiveGridSettings } from "./use-grid-settings";
import { computeWindow } from "./use-windowed-grid";
import { templateImageUrl, templateThumbUrl } from "@/lib/images";
import { writeTemplateDrag } from "@/lib/template-drag";
import { ThumbImage } from "./thumb-image";
import { useMoodboardPinned } from "./use-moodboards";

/** Compact quick-save toggle shown on a tile while hovering or focused. */
function TileSave({ templateId }: { templateId: string }) {
  const { pinBoard } = useExplorer();
  const { boards, store } = useBoards();
  const activeId = useLastUsedBoardId();
  const active = boards.find((b) => b.id === activeId) ?? boards.find((b) => b.id === SAVED_BOARD_ID);
  const activeName = active?.name ?? "Saved";
  const saved = active ? active.templateIds.includes(templateId) : false;
  return (
    <button
      type="button"
      aria-label={saved ? `Remove from ${activeName}` : `Save to ${activeName}`}
      aria-pressed={saved}
      title={saved ? `Saved — click to remove` : `Save to “${activeName}”`}
      onClick={() => {
        if (!active) return;
        const nowSaved = store.toggle(active.id, templateId);
        if (nowSaved) pinBoard(active.id);
      }}
      className={cn(
        "absolute top-2 right-2 grid size-7 place-items-center rounded-lg bg-background/80 backdrop-blur-sm transition-opacity",
        "text-foreground opacity-0 hover:bg-background focus-visible:opacity-100 group-hover:opacity-100",
        saved && "opacity-100 text-[#E5484D]",
      )}
    >
      {saved ? <BookmarkCheckIcon className="size-4" /> : <BookmarkIcon className="size-4" />}
    </button>
  );
}

const GridTile = memo(function GridTile({
  template,
  radius,
  eager,
  onPick,
  hideSave,
  thumb,
}: {
  template: Template;
  radius: number;
  eager?: boolean;
  onPick?: (id: string) => void;
  /** Boards have no per-tile save toggle: every design in them is already saved. */
  hideSave?: boolean;
  /** 600px grid thumbnail instead of the 1200px file. */
  thumb?: boolean;
}) {
  const { openTemplate, boardSelection, toggleBoardSelect, page, pinnedBoardId } =
    useExplorer();
  const moodboardPinned = useMoodboardPinned();
  const canDrag = !!pinnedBoardId || (moodboardPinned && page === "explore");
  const selecting = !!boardSelection;
  const selected = !!boardSelection?.ids.includes(template.templateId);
  const label = template.displayTitle || template.slug;
  return (
    <div className="group relative aspect-square" style={{ borderRadius: radius }}>
      <button
        type="button"
        draggable={canDrag && !selecting}
        onDragStart={(event) => writeTemplateDrag(event.dataTransfer, template.templateId)}
        onClick={() => (selecting ? toggleBoardSelect(template.templateId) : (onPick ?? openTemplate)(template.templateId))}
        aria-label={selecting ? `${selected ? "Deselect" : "Select"} ${label}` : `Open ${label}`}
        aria-pressed={selecting ? selected : undefined}
        className="size-full overflow-hidden bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
        style={{ borderRadius: radius }}
      >
        <ThumbImage
          src={thumb ? templateThumbUrl(template.templateId) : templateImageUrl(template.templateId)}
          fallbackSrc={thumb ? templateImageUrl(template.templateId) : undefined}
          alt={label}
          eager={eager}
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      </button>
      {selecting ? (
        <>
          {selected && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-foreground"
              style={{ borderRadius: radius }}
            />
          )}
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-2 right-2 grid size-5 place-items-center rounded-md backdrop-blur-sm",
              selected ? "bg-foreground text-background" : "bg-background/80 text-transparent ring-1 ring-foreground/20",
            )}
          >
            <CheckIcon className="size-3.5" />
          </span>
        </>
      ) : (
        !hideSave && <TileSave templateId={template.templateId} />
      )}
    </div>
  );
});

/**
 * Savee-style adjustable, windowed square grid. Only visible rows are in the DOM.
 * The scroller is kept mounted under the focused lightbox, so scroll position survives Back.
 */
export const GridView = memo(function GridView({
  items,
  className,
  onPick,
  scrollContainer,
  hideSave,
  overscan = 4,
  eagerRows = 2,
  thumbs = false,
}: {
  items: Template[];
  className?: string;
  onPick?: (id: string) => void;
  /**
   * Window against this element's scroll instead of scrolling the grid itself, for callers
   * where the grid is one block in a larger scroller (the focused lightbox). Pass the element
   * (not a ref): it arrives one commit after mount, and the measurement has to re-run then.
   */
  scrollContainer?: HTMLElement | null;
  /** Hide the per-tile save bookmark (boards, where everything is already saved). */
  hideSave?: boolean;
  /** Extra rows mounted above and below the viewport. Explore keeps 4; boards pass 1. */
  overscan?: number;
  /** Leading rows that load their image immediately. */
  eagerRows?: number;
  /** Use the 600px grid thumbnail instead of the full image. */
  thumbs?: boolean;
}) {
  const { columns, gap, radius } = useEffectiveGridSettings();
  const isCompact = useIsCompact();
  const hideSaveOnCompact = hideSave || isCompact;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const frame = useRef(0);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [scrollTop, setScrollTop] = useState(0);
  const external = scrollContainer !== undefined;

  useLayoutEffect(() => {
    const root = rootRef.current;
    const content = contentRef.current;
    if (!root || !content) return;
    const scroller = external ? scrollContainer : root;
    if (!scroller) return;

    // How far the grid's own top has scrolled past the top of the container, i.e. the grid's
    // scroll offset in the container: 0 while the image above it is still on screen. (The rect
    // difference already accounts for the container's scroll, so don't add scrollTop here.)
    const gridScrollTop = () =>
      external
        ? Math.max(0, scroller.getBoundingClientRect().top - root.getBoundingClientRect().top)
        : scroller.scrollTop;

    const measure = () => {
      setBox({ width: content.clientWidth, height: scroller.clientHeight });
      setScrollTop(gridScrollTop());
    };
    measure();

    // Throttle to one state update per frame: a fast scroll fires dozens of events.
    const onScroll = () => {
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        setScrollTop(gridScrollTop());
      });
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });

    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(content);
    ro?.observe(scroller);
    if (external) ro?.observe(root);

    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
      ro?.disconnect();
    };
  }, [external, scrollContainer]);

  const grid = computeWindow({
    count: items.length,
    columns,
    gap,
    width: box.width,
    height: box.height,
    scrollTop,
    overscan,
  });

  const rows = [];
  for (let r = grid.firstRow; r < grid.lastRow; r++) {
    const start = r * grid.cols;
    rows.push(
      <div
        key={r}
        className="absolute inset-x-0 grid"
        style={{
          top: r * grid.rowHeight,
          height: grid.tileHeight,
          gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
          gap,
        }}
      >
        {items.slice(start, start + grid.cols).map((t) => (
          <GridTile
            key={t.templateId}
            template={t}
            radius={radius}
            eager={r < eagerRows}
            onPick={onPick}
            hideSave={hideSaveOnCompact}
            thumb={thumbs}
          />
        ))}
      </div>,
    );
  }

  return (
    <div
      ref={rootRef}
      data-testid="grid-view"
      data-count={items.length}
      className={cn(
        "px-4",
        SCROLL_PAD_DOCK,
        !external && "no-scrollbar h-full overflow-y-auto overscroll-contain",
        className,
      )}
    >
      <div ref={contentRef} className="relative w-full" style={{ height: grid.totalHeight }}>
        {rows}
      </div>
    </div>
  );
});
