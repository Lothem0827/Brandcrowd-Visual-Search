"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { InfoIcon } from "lucide-react";
import { rankByOverall } from "@/lib/similarity";
import { cn } from "@/lib/utils";
import { BackButton } from "./back-button";
import { useExplorer } from "./context";
import { GridView } from "./grid-view";
import { HEADER_CONTROL, HEADER_CONTROL_IDLE, HEADER_CONTROL_ON } from "./header";
import { SaveButton } from "./save-button";
import { templateImageUrl } from "@/lib/images";
import { writeTemplateDrag } from "@/lib/template-drag";
import { ThumbImage } from "./thumb-image";
import { useMoodboardPinned } from "./use-moodboards";
import { useGridSettings } from "./use-grid-settings";

/** How many related designs to keep in the flat, windowed list below the image. */
const RELATED_LIMIT = 600;

/**
 * Focused lightbox (grid click, `?design=<id>&view=focus`): a large image with back / save /
 * info controls, and a flat, deduped related list (most similar first) windowed below.
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
  const moodboardPinned = useMoodboardPinned();
  const canDrag = (!!moodboardPinned || !!pinnedBoardId) && page === "explore";
  const { radius } = useGridSettings();
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

  const focusedId = focused?.templateId;
  // Re-centring from a related tile swaps the large image in place: bring it back into view.
  useEffect(() => {
    if (focusedId) scrollEl?.scrollTo({ top: 0 });
  }, [focusedId, scrollEl]);

  if (!focused) return null;

  const goBack = () => {
    const origin =
      view.kind === "focused" ? view.origin : { kind: "search" as const };
    setDetailOpen(false);
    if (origin.kind === "board")
      setView({ kind: "board", boardId: origin.boardId });
    else setView({ kind: "search" });
  };

  return (
    <div
      ref={scrollRef}
      className="thin-scroll absolute inset-0 z-20 overflow-y-auto overscroll-contain bg-background"
      data-testid="focused-view"
      role="dialog"
      aria-modal
      aria-label="Design"
    >
      {/* The overlay scrolls as a whole, so the controls ride along on a zero-height sticky
          layer: they stay put while the image and the related list pass underneath. The inset
          and the 40px controls are the shared header tokens, so the back button lines up with
          the related grid's tiles below it. */}
      <div className="sticky top-0 z-30 h-0">
        <div className="pointer-events-none absolute inset-x-0 top-4 flex items-center justify-between px-4">
          <BackButton onClick={goBack} className="pointer-events-auto" />
          <div className="pointer-events-auto flex items-center gap-2">
            <SaveButton templateId={focused.templateId} />
            <button
              type="button"
              aria-pressed={detailOpen}
              aria-label="Design info"
              title="Design info"
              onClick={() => setDetailOpen(!detailOpen)}
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
      <div className="relative flex h-[88%] min-h-[45vh] items-center justify-center px-4 py-16 [container-type:size]">
        {/* A flex (not grid) centre: the ThumbImage wrapper takes its height from this
            definite box, so `max-h-full` actually constrains the picture. */}
        <div className="relative flex h-full w-full items-center justify-center">
          {/* A definite square (template images are 1:1) so the loading skeleton is the
              size of the picture and the layout doesn't jump when it arrives. Sized off the
              smaller container axis so it stays square on narrow viewports too, where width (not
              height) is the binding constraint. Radius/shadow live here, which also clips the
              skeleton to the same corners. */}
          <div
            draggable={canDrag}
            onDragStart={(event) => writeTemplateDrag(event.dataTransfer, focused.templateId)}
            title={canDrag ? "Drag onto the board or moodboard" : undefined}
            className={cn(
              "relative aspect-square w-[min(100cqw,100cqh)] overflow-hidden shadow-2xl",
              canDrag && "cursor-grab active:cursor-grabbing",
            )}
            style={{ borderRadius: radius }}
          >
            <ThumbImage
              key={focused.templateId}
              src={templateImageUrl(focused.templateId)}
              alt={focused.displayTitle || focused.slug}
              eager
              retryButton
              className="size-full object-contain"
            />
          </div>
        </div>
      </div>

      <GridView items={related} onPick={recenter} scrollContainer={scrollEl} />
    </div>
  );
}
