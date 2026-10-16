"use client";

/**
 * Pure windowing maths for a virtualized square grid: from the viewport size and scroll
 * offset, work out the tile size and which rows need to be mounted. Kept free of refs/DOM so
 * it is trivially testable and the component can own its own refs.
 */
export interface WindowInput {
  count: number;
  columns: number;
  gap: number;
  /** content-box width of the grid (excluding horizontal padding) */
  width: number;
  /** visible height of the scroller */
  height: number;
  scrollTop: number;
  /** extra rows to mount above and below the viewport */
  overscan?: number;
}

export interface WindowResult {
  cols: number;
  tileHeight: number;
  rowHeight: number;
  rowCount: number;
  totalHeight: number;
  firstRow: number;
  lastRow: number;
}

export function computeWindow({ count, columns, gap, width, height, scrollTop, overscan = 4 }: WindowInput): WindowResult {
  const cols = Math.max(1, columns);
  const tileHeight = width > 0 ? Math.max(24, (width - gap * (cols - 1)) / cols) : 0;
  const rowHeight = tileHeight + gap;
  const rowCount = tileHeight > 0 ? Math.ceil(count / cols) : 0;
  const totalHeight = rowCount > 0 ? rowCount * rowHeight - gap : 0;
  const firstRow = rowHeight > 0 ? Math.max(0, Math.floor(scrollTop / rowHeight) - overscan) : 0;
  const lastRow = rowHeight > 0 ? Math.min(rowCount, Math.ceil((scrollTop + height) / rowHeight) + overscan) : rowCount;
  return { cols, tileHeight, rowHeight, rowCount, totalHeight, firstRow, lastRow };
}
