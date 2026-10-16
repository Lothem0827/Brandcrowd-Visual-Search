import { describe, expect, it } from "vitest";
import { DRAG_THRESHOLD, isPanGesture } from "./use-drag-scroll";

describe("isPanGesture", () => {
  it("ignores pointer travel below the threshold", () => {
    // a click that drifts while the button is down is still a click
    expect(isPanGesture(3, 0, 0)).toBe(false);
    expect(isPanGesture(-3, 200, 203)).toBe(false);
    expect(isPanGesture(DRAG_THRESHOLD - 1, 200, 200 - (DRAG_THRESHOLD - 1))).toBe(false);
  });

  it("counts travel past the threshold that scrolled the row", () => {
    expect(isPanGesture(DRAG_THRESHOLD, 200, 200 - DRAG_THRESHOLD)).toBe(true);
    expect(isPanGesture(-40, 200, 240)).toBe(true);
  });

  it("leaves the click alone when the row could not scroll", () => {
    // dragging right at the left edge clamps at 0 — nothing moved, so the chip stays clickable
    expect(isPanGesture(60, 0, 0)).toBe(false);
    // same at the far end: dragging left past the last chip cannot scroll any further
    expect(isPanGesture(-60, 500, 500)).toBe(false);
    // a row that does not overflow at all never pans
    expect(isPanGesture(30, 0, 0)).toBe(false);
  });

  it("honours a custom threshold", () => {
    expect(isPanGesture(4, 0, 4, 4)).toBe(true);
    expect(isPanGesture(4, 0, 0, 4)).toBe(false);
  });
});
