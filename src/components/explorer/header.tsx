/**
 * Shared page-header tokens. Every top-level header (Board, Explore, Boards) draws its control
 * size, inset and gaps from here, so the back button, the toggles and the tabs can't drift apart.
 *
 * The focused-view overlay reuses the same control size and inset: it floats over an image, so it
 * keeps its own translucent surface, but the button is the same 40px square the headers use — and
 * aligning it to the same 16px inset lines it up with the related grid below it.
 */

/** Inset shared by every header: 16px from the top/left/right. */
export const HEADER_INSET = "px-4 pt-4";

/** One rhythm for every in-flow header row: the shared inset plus 12px gaps and 16px below. */
export const HEADER_ROW = `flex shrink-0 items-center gap-3 ${HEADER_INSET} pb-4`;

/** The one control size every header shares: a 40px square. */
export const HEADER_CONTROL =
  "grid size-10 shrink-0 place-items-center rounded-xl transition-colors";

/** Idle surface — translucent so it reads the same over the page or over an image. */
export const HEADER_CONTROL_IDLE =
  "bg-panel/90 text-muted-foreground backdrop-blur hover:bg-panel hover:text-foreground";

/** Pressed / selected surface. */
export const HEADER_CONTROL_ON = "bg-foreground text-background";

/** The grid/tree segmented pill: 40px overall (a 36px item inside the 2px padding). */
export const HEADER_SEGMENT =
  "flex items-center rounded-full bg-panel/90 p-0.5 backdrop-blur";

/** One segment inside the pill. */
export const HEADER_SEGMENT_ITEM =
  "flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors";

/** Page/board titles in a header, kept to one size so headers read as a set. */
export const HEADER_TITLE = "min-w-0 truncate text-[20px] font-semibold";
