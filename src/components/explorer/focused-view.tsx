"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { BookmarkCheckIcon, BookmarkIcon, InfoIcon } from "lucide-react";
import { SAVED_BOARD_ID } from "@/lib/boards";
import { rankByOverall } from "@/lib/similarity";
import type { Template } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { useIsCompact } from "@/lib/use-media-query";
import { BackButton } from "./back-button";
import { useExplorer } from "./context";
import { GridView } from "./grid-view";
import { HEADER_CONTROL, HEADER_CONTROL_IDLE, HEADER_CONTROL_ON } from "./header";
import { templateImageUrl } from "@/lib/images";
import { writeTemplateDrag } from "@/lib/template-drag";
import { SaveButton } from "./save-button";
import { ThumbImage } from "./thumb-image";
import { useBoards, useLastUsedBoardId } from "./use-boards";
import { useMoodboardPinned } from "./use-moodboards";
import { useEffectiveGridSettings } from "./use-grid-settings";
import { DRAG_THRESHOLD } from "./use-drag-scroll";

/** Compact quick-save overlay on the focused image (same look as grid thumbnails). */
function FocusedTileSave({ templateId }: { templateId: string }) {
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
      onClick={(e) => {
        e.stopPropagation();
        if (!active) return;
        const nowSaved = store.toggle(active.id, templateId);
        if (nowSaved) pinBoard(active.id);
      }}
      className={cn(
        "absolute top-2 right-2 z-10 grid size-7 place-items-center rounded-lg bg-background/80 text-foreground opacity-0 backdrop-blur-sm transition-colors hover:bg-background focus-visible:opacity-100 group-hover:opacity-100",
        saved && "text-[#E5484D]",
      )}
    >
      {saved ? <BookmarkCheckIcon className="size-4" /> : <BookmarkIcon className="size-4" />}
    </button>
  );
}

/** How many related designs to keep in the flat, windowed list below the image. */
const RELATED_LIMIT = 600;
/** Cap the phone swipe sequence so left/right stays snappy. */
const SWIPE_LIMIT = 40;
const SWIPE_COMMIT_PX = 64;

/**
 * Focused lightbox (grid click, `?design=<id>&view=focus`): a large image with a thumbnail-style
 * save overlay, back / info controls, and a flat related list (most similar first) below.
 *
 * The overlay itself is the scroller, so a wheel/touch anywhere scrolls — the image scrolls
 * away with the related list instead of being pinned. The grid underneath stays mounted, so
 * Back restores its scroll.
 */
export function FocusedView() {
  const {
    focused,
    base,
    recenter,
    setView,
    view,
    detailOpen,
    setDetailOpen,
    page,
    pinnedBoardId,
  } = useExplorer();
  const isCompact = useIsCompact();
  const moodboardPinned = useMoodboardPinned();
  const canDrag = !!pinnedBoardId || (moodboardPinned && page === "explore");
  const { radius } = useEffectiveGridSettings();
  // Callback ref (state, not a ref object): the related grid needs the element to window
  // against, and a plain ref would still be empty when the grid's layout effect runs.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const scrollRef = useCallback(
    (el: HTMLDivElement | null) => setScrollEl(el),
    [],
  );

  const related = useMemo(() => {
    if (!focused) return [];
    return rankByOverall(focused, base)
      .slice(0, RELATED_LIMIT)
      .map((r) => r.template);
  }, [focused, base]);

  /** Stable swipe sequence; rebuilt when opening focus or picking from the related grid. */
  const swipeRef = useRef<{ items: Template[]; index: number } | null>(null);
  const rebuildSwipe = useRef(false);
  const [dragX, setDragX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const gestureRef = useRef<{
    id: number;
    x: number;
    y: number;
    axis: "none" | "h" | "v";
  } | null>(null);

  // Keep swipe index in sync, or rebuild when the focused id isn't in the sequence.
  useEffect(() => {
    if (!focused) {
      swipeRef.current = null;
      return;
    }
    const cur = swipeRef.current;
    if (!rebuildSwipe.current && cur) {
      const idx = cur.items.findIndex((t) => t.templateId === focused.templateId);
      if (idx >= 0) {
        cur.index = idx;
        return;
      }
    }
    rebuildSwipe.current = false;
    const rest = related
      .filter((t) => t.templateId !== focused.templateId)
      .slice(0, SWIPE_LIMIT - 1);
    swipeRef.current = { items: [focused, ...rest], index: 0 };
  }, [focused, related]);

  const focusedId = focused?.templateId;
  // Re-centring from a related tile swaps the large image in place: bring it back into view.
  useEffect(() => {
    if (focusedId) scrollEl?.scrollTo({ top: 0 });
  }, [focusedId, scrollEl]);

  const goSwipe = useCallback(
    (delta: number) => {
      const cur = swipeRef.current;
      if (!cur) return;
      const next = cur.index + delta;
      if (next < 0 || next >= cur.items.length) return;
      cur.index = next;
      recenter(cur.items[next].templateId);
    },
    [recenter],
  );

  const onPickRelated = useCallback(
    (id: string) => {
      rebuildSwipe.current = true;
      recenter(id);
    },
    [recenter],
  );

  const onHeroPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isCompact || e.button !== 0) return;
    gestureRef.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      axis: "none",
    };
    setDragX(0);
  };

  const onHeroPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (g.axis === "none") {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      g.axis = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      if (g.axis === "h") {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
    }
    if (g.axis !== "h") return;
    e.preventDefault();
    setSwiping(true);
    const cur = swipeRef.current;
    let next = dx;
    // Light rubber-band at ends.
    if (cur) {
      if ((cur.index <= 0 && dx > 0) || (cur.index >= cur.items.length - 1 && dx < 0)) {
        next = dx * 0.35;
      }
    }
    setDragX(next);
  };

  const endHeroGesture = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    if (g.axis === "h") {
      if (dx <= -SWIPE_COMMIT_PX) goSwipe(1);
      else if (dx >= SWIPE_COMMIT_PX) goSwipe(-1);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    }
    gestureRef.current = null;
    setSwiping(false);
    setDragX(0);
  };

  if (!focused) return null;

  const goBack = () => {
    const origin =
      view.kind === "focused" ? view.origin : { kind: "search" as const };
    setDetailOpen(false);
    swipeRef.current = null;
    if (origin.kind === "board")
      setView({ kind: "board", boardId: origin.boardId });
    else setView({ kind: "search" });
  };

  const toggleDetail = () => {
    scrollEl?.scrollTo({ top: 0 });
    setDetailOpen(!detailOpen);
  };

  return (
    <div
      ref={scrollRef}
      className="no-scrollbar absolute inset-0 z-20 overflow-y-auto overscroll-contain bg-background"
      data-testid="focused-view"
      role="dialog"
      aria-modal
      aria-label="Design"
    >
      {/* The overlay scrolls as a whole, so the controls ride along on a zero-height sticky
          layer: they stay put while the image and the related list pass underneath. The inset
          and the 32px controls are the shared header tokens, so the back button lines up with
          the related grid's tiles below it. */}
      <div className="sticky top-0 z-30 h-0">
        <div className="pointer-events-none absolute inset-x-0 top-4 flex items-center justify-between px-4">
          <BackButton onClick={goBack} className="pointer-events-auto" />
          <div className="pointer-events-auto flex items-center gap-2">
            <SaveButton
              templateId={focused.templateId}
              className="h-8 rounded-lg"
            />
            <button
              type="button"
              aria-pressed={detailOpen}
              aria-label="Design info"
              title="Design info"
              onClick={toggleDetail}
              className={cn(
                HEADER_CONTROL,
                detailOpen ? HEADER_CONTROL_ON : HEADER_CONTROL_IDLE,
              )}
            >
              <InfoIcon className="size-[18px]" />
            </button>
          </div>
        </div>
      </div>

      {/* Shorter than the overlay so a slice of the first related row peeks below the fold
          (the floating search dock covers the middle, the tiles either side stay visible).
          `container-type: size` lets the picture box below size itself to the smaller of this
          box's two axes (see the square wrapper). */}
      <div
        className={cn(
          "relative flex h-[88%] min-h-[45vh] items-center justify-center px-4 py-16 [container-type:size]",
          isCompact && "touch-pan-y",
        )}
        title={isCompact ? "Swipe left or right for related designs" : undefined}
        onPointerDown={onHeroPointerDown}
        onPointerMove={onHeroPointerMove}
        onPointerUp={endHeroGesture}
        onPointerCancel={endHeroGesture}
      >
        {/* A flex (not grid) centre: the ThumbImage wrapper takes its height from this
            definite box, so `max-h-full` actually constrains the picture. */}
        <div className="relative flex h-full w-full items-center justify-center">
          {/* A definite square (template images are 1:1) so the loading skeleton is the
              size of the picture and the layout doesn't jump when it arrives. Sized off the
              smaller container axis so it stays square on narrow viewports too, where width (not
              height) is the binding constraint. Radius lives here, which also clips the
              skeleton to the same corners. */}
          <div
            draggable={canDrag && !isCompact}
            onDragStart={(event) => writeTemplateDrag(event.dataTransfer, focused.templateId)}
            title={canDrag && !isCompact ? "Drag onto the board or moodboard" : undefined}
            className={cn(
              "group relative aspect-square w-[min(100cqw,100cqh)] overflow-hidden",
              canDrag && !isCompact && "cursor-grab active:cursor-grabbing",
            )}
            style={{
              borderRadius: radius,
              transform: dragX ? `translate3d(${dragX}px, 0, 0)` : undefined,
              transition: swiping ? undefined : "transform 180ms ease-out",
            }}
          >
            <ThumbImage
              key={focused.templateId}
              src={templateImageUrl(focused.templateId)}
              alt={focused.displayTitle || focused.slug}
              eager
              retryButton
              className="size-full object-contain"
            />
            {!isCompact && <FocusedTileSave templateId={focused.templateId} />}
          </div>
        </div>
      </div>

      <GridView items={related} onPick={onPickRelated} scrollContainer={scrollEl} thumbs />
    </div>
  );
}
