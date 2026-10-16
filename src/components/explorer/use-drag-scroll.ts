"use client";
import { useCallback, useRef, useState, type MouseEvent, type PointerEvent } from "react";

/**
 * Pixels the pointer must travel before a press is treated as a drag rather than a click.
 * Deliberately generous: clicking a chip nudges the pointer a few pixels on any touchpad, and
 * those few pixels must not silently turn the click into a (zero-distance) drag.
 */
export const DRAG_THRESHOLD = 8;

/**
 * Whether a press counts as a pan of the row — and so swallows the click that follows it.
 * The pointer must have travelled past the threshold *and* have actually scrolled the row:
 * travel that cannot scroll (drift while clicking, or a drag at either end of the row) is left
 * to the chip under the pointer, so a click is never dropped without the row visibly moving.
 */
export function isPanGesture(
  dx: number,
  leftBefore: number,
  leftAfter: number,
  threshold: number = DRAG_THRESHOLD,
) {
  return Math.abs(dx) >= threshold && leftAfter !== leftBefore;
}

type DragScrollProps = {
  onPointerDown: (e: PointerEvent<HTMLElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: PointerEvent<HTMLElement>) => void;
  onClickCapture: (e: MouseEvent<HTMLElement>) => void;
};

/**
 * Grab-and-drag horizontal scrolling for a row that overflows: `overflow-x-auto` hides the
 * scrollbar, but a hidden scrollbar is hard to wheel/drag without a trackpad, so the mouse can
 * pan the row directly. Touch and pen are left alone (native panning is better there), and a
 * drag that ends over a chip swallows the resulting click so nothing is selected by accident.
 *
 * Spread `props` on the scroll container; `dragging` drives the grab cursor.
 */
export function useDragScroll(): { props: DragScrollProps; dragging: boolean } {
  const [dragging, setDragging] = useState(false);
  // Refs, not state: pointer handlers must see the live values without re-binding each move.
  const active = useRef(false);
  const panned = useRef(false);
  const start = useRef({ x: 0, left: 0 });

  const onPointerDown = useCallback((e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    active.current = true;
    panned.current = false;
    start.current = { x: e.clientX, left: e.currentTarget.scrollLeft };
    // Pointer capture is deliberately NOT taken here. Capturing on pointerdown retargets the
    // following pointerup/mouseup to this row, and the browser then fires the click on the row
    // too (a click targets the common ancestor of its press and release) — so the chip button
    // under the pointer never receives its own click and every chip press becomes a no-op.
    // Capture is taken in `onPointerMove`, once the press is confirmed to be a pan.
  }, []);

  const onPointerMove = useCallback((e: PointerEvent<HTMLElement>) => {
    if (!active.current) return;
    const dx = e.clientX - start.current.x;
    if (Math.abs(dx) < DRAG_THRESHOLD) return;
    const el = e.currentTarget;
    el.scrollLeft = start.current.left - dx;
    // Read the row back rather than trusting `dx`: at either end of the row (or in a row that
    // does not overflow) the assignment is clamped and nothing moves, so the press is a click
    // and must be left alone — including not taking capture, which would move the click here.
    if (panned.current || !isPanGesture(dx, start.current.left, el.scrollLeft)) return;
    panned.current = true;
    setDragging(true);
    // A confirmed pan: capture keeps the drag alive past the row's edges. A browser refusing it
    // just means the drag stops at the edge, so it is not worth aborting the drag over.
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* not the active pointer */
    }
  }, []);

  const end = useCallback((e: PointerEvent<HTMLElement>) => {
    active.current = false;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  // A drag usually ends with the pointer over a chip, which would fire that chip's click and
  // discard the scroll. Swallow that one click, then clear the flag: the next click may be a
  // keyboard activation (Enter/Space), which has no pointerdown to reset it and must be allowed.
  const onClickCapture = useCallback((e: MouseEvent<HTMLElement>) => {
    if (!panned.current) return;
    panned.current = false;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return {
    props: {
      onPointerDown,
      onPointerMove,
      onPointerUp: end,
      onPointerCancel: end,
      onClickCapture,
    },
    dragging,
  };
}
