"use client";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { BookmarkCheckIcon, BookmarkIcon, InfoIcon, XIcon } from "lucide-react";
import type { Template } from "@/lib/schema";
import { SAVED_BOARD_ID } from "@/lib/boards";
import { rankByOverall } from "@/lib/similarity";
import { templateImageUrl } from "@/lib/images";
import { rng } from "@/lib/color";
import { cn } from "@/lib/utils";
import { useExplorer } from "./context";
import { useBoards, useLastUsedBoardId } from "./use-boards";
import { useGridSettings } from "./use-grid-settings";
import { ThumbImage } from "./thumb-image";
import { DRAG_THRESHOLD } from "./use-drag-scroll";
import { Button } from "@/components/ui/button";

/** Related industries sit next to each other; the map wraps in both directions. */
const INDUSTRY_MAP: string[][] = [
  ["Food & Drink", "Holidays & Seasonal", "Events & Entertainment", "Travel", "Sports"],
  ["Fashion & Retail", "Beauty & Personal Care", "Wellness", "Fitness", "Healthcare"],
  ["Business & Corporate", "Technology", "Education", "Personal Development", "Nonprofit & Religion"],
  ["Real Estate", "Construction", "Automotive", "Pets", "Family & Kids"],
];
const MAP_W = INDUSTRY_MAP[0].length;
const MAP_H = INDUSTRY_MAP.length;
const DISTRICT = 8;
const OVERSCAN = 1;
const SIMILAR_COUNT = 150;
/** How many grid cells the grown pivot spans (was 3; slightly smaller reads better). */
const PIVOT_SPAN = 2;
const HINT_KEY = "template-taxonomy:home-hint:v1";
const SHUFFLE_SEED = 0xc0ffee;

type Cell = { c: number; r: number };

function seededShuffle<T>(list: T[], seed: number): T[] {
  const r = rng(seed);
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

function floorDiv(n: number, d: number): number {
  return Math.floor(n / d);
}

function industryAt(c: number, r: number): string {
  const dx = floorDiv(c, DISTRICT);
  const dy = floorDiv(r, DISTRICT);
  return INDUSTRY_MAP[mod(dy, MAP_H)][mod(dx, MAP_W)];
}

function poolIndex(c: number, r: number): number {
  const dx = floorDiv(c, DISTRICT);
  const dy = floorDiv(r, DISTRICT);
  const localC = mod(c, DISTRICT);
  const localR = mod(r, DISTRICT);
  const local = localR * DISTRICT + localC;
  const repeatX = floorDiv(dx, MAP_W);
  const repeatY = floorDiv(dy, MAP_H);
  // Stable offset so each map repeat shows a different slice of the pool.
  const offset = (repeatX * 73856093 + repeatY * 19349663) >>> 0;
  return offset + local;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function TileSave({ templateId, className }: { templateId: string; className?: string }) {
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
        if (active) store.toggle(active.id, templateId);
      }}
      className={cn(
        "grid size-7 place-items-center rounded-full bg-background/90 text-foreground shadow-sm backdrop-blur-sm transition-opacity",
        "opacity-0 hover:bg-background focus-visible:opacity-100 group-hover:opacity-100",
        saved && "opacity-100 text-[#E5484D]",
        className,
      )}
    >
      {saved ? <BookmarkCheckIcon className="size-3.5" /> : <BookmarkIcon className="size-3.5" />}
    </button>
  );
}

const CanvasTile = memo(function CanvasTile({
  template,
  size,
  radius,
  left,
  top,
  opacity,
  onPick,
  dimmed,
}: {
  template: Template;
  size: number;
  radius: number;
  left: number;
  top: number;
  opacity: number;
  onPick: (id: string, el: HTMLButtonElement) => void;
  dimmed?: boolean;
}) {
  const label = template.displayTitle || template.slug;
  return (
    <div
      className="group absolute"
      style={{
        width: size,
        height: size,
        left,
        top,
        opacity,
        transition: "opacity 280ms ease-out",
      }}
    >
      <button
        type="button"
        data-template-id={template.templateId}
        aria-label={`Open ${label}`}
        onClick={(e) => onPick(template.templateId, e.currentTarget)}
        className={cn(
          "size-full overflow-hidden bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
          dimmed && "opacity-40",
        )}
        style={{ borderRadius: radius }}
      >
        <ThumbImage
          src={templateImageUrl(template.templateId)}
          alt={label}
          className="size-full object-cover transition-opacity duration-300"
        />
      </button>
      <TileSave templateId={template.templateId} className="absolute top-1.5 right-1.5" />
    </div>
  );
});

function ringCells(pc: number, pr: number, ring: number): Cell[] {
  const cells: Cell[] = [];
  if (ring === 0) return [{ c: pc, r: pr }];
  const d = ring;
  for (let c = pc - d; c <= pc + d; c++) {
    cells.push({ c, r: pr - d });
    cells.push({ c, r: pr + d });
  }
  for (let r = pr - d + 1; r <= pr + d - 1; r++) {
    cells.push({ c: pc - d, r });
    cells.push({ c: pc + d, r });
  }
  return cells;
}

function buildRingOrder(pc: number, pr: number, maxRing: number): Cell[] {
  const out: Cell[] = [];
  for (let ring = 2; ring <= maxRing; ring++) {
    out.push(...ringCells(pc, pr, ring));
  }
  return out;
}

export function HomeCanvas() {
  const {
    all,
    byId,
    homePivotId,
    setHomePivotId,
    setPage,
    setQuery,
    setFilters,
    setDetailOpen,
  } = useExplorer();
  const { columns, gap, radius } = useGridSettings();
  const rootRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  const velRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef(0);
  const inertiaRef = useRef(0);
  const pannedRef = useRef(false);
  const dragRef = useRef<{
    active: boolean;
    id: number;
    x: number;
    y: number;
    ox: number;
    oy: number;
    lastX: number;
    lastY: number;
    lastT: number;
  } | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [range, setRange] = useState({ c0: 0, c1: 0, r0: 0, r1: 0 });
  const [dragging, setDragging] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [pivotAnim, setPivotAnim] = useState(0); // 0..1 grow progress
  const [rippleRing, setRippleRing] = useState(0);
  const pivotCellRef = useRef<Cell | null>(null);
  const [pivotCell, setPivotCell] = useState<Cell | null>(null);
  const layoutRef = useRef({ tile: 180, step: 192, gap: 12 });

  const pools = useMemo(() => {
    const map = new Map<string, Template[]>();
    for (const t of all) {
      const list = map.get(t.industry);
      if (list) list.push(t);
      else map.set(t.industry, [t]);
    }
    const out = new Map<string, Template[]>();
    for (const [k, list] of map) {
      out.set(k, seededShuffle(list, SHUFFLE_SEED ^ k.length * 997));
    }
    // Fallbacks for any industry string missing from the map (shouldn't happen often).
    const fallback = seededShuffle(all, SHUFFLE_SEED);
    out.set("__fallback__", fallback);
    return out;
  }, [all]);

  const templateAt = useCallback(
    (c: number, r: number): Template | null => {
      if (!all.length) return null;
      const industry = industryAt(c, r);
      const pool = pools.get(industry) ?? pools.get("__fallback__")!;
      if (!pool.length) return null;
      return pool[mod(poolIndex(c, r), pool.length)] ?? null;
    },
    [all.length, pools],
  );

  const pivotTemplate = homePivotId ? byId(homePivotId) ?? null : null;

  const similar = useMemo(() => {
    if (!pivotTemplate) return [] as Template[];
    return rankByOverall(pivotTemplate, all)
      .slice(0, SIMILAR_COUNT)
      .map((h) => h.template);
  }, [pivotTemplate, all]);

  const maxRing = useMemo(() => {
    // Enough rings to place ~SIMILAR_COUNT cells outside the 3×3 pivot block.
    let n = 0;
    let placed = 0;
    for (let ring = 2; placed < SIMILAR_COUNT; ring++) {
      placed += ringCells(0, 0, ring).length;
      n = ring;
      if (ring > 20) break;
    }
    return n;
  }, []);

  const similarByCell = useMemo(() => {
    const m = new Map<string, Template>();
    if (!pivotCell || !similar.length) return m;
    const order = buildRingOrder(pivotCell.c, pivotCell.r, maxRing);
    for (let i = 0; i < order.length && i < similar.length; i++) {
      m.set(`${order[i].c}:${order[i].r}`, similar[i]);
    }
    return m;
  }, [pivotCell, similar, maxRing]);

  const applyTransform = useCallback(() => {
    const el = layerRef.current;
    if (!el) return;
    const { x, y } = offsetRef.current;
    el.style.transform = `translate3d(${-x}px, ${-y}px, 0)`;
  }, []);

  const updateRange = useCallback(() => {
    const { w, h } = size;
    const { tile, step, gap: g } = layoutRef.current;
    if (w <= 0 || h <= 0 || step <= 0) return;
    const { x, y } = offsetRef.current;
    const c0 = Math.floor((x - g) / step) - OVERSCAN;
    const r0 = Math.floor((y - g) / step) - OVERSCAN;
    const c1 = Math.ceil((x + w - g) / step) + OVERSCAN;
    const r1 = Math.ceil((y + h - g) / step) + OVERSCAN;
    setRange((prev) =>
      prev.c0 === c0 && prev.c1 === c1 && prev.r0 === r0 && prev.r1 === r1 ? prev : { c0, c1, r0, r1 },
    );
    void tile;
  }, [size]);

  const schedulePaint = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      applyTransform();
      updateRange();
    });
  }, [applyTransform, updateRange]);

  // Measure viewport + recompute tile size; keep the world cell under the center anchored.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w <= 0 || h <= 0) return;
      const prev = layoutRef.current;
      const tile = Math.max(40, (w - gap * (columns + 1)) / columns);
      const step = tile + gap;
      setSize((prevSize) => {
        if (prevSize.w > 0 && (prev.step !== step || prev.gap !== gap)) {
          const cx = offsetRef.current.x + prevSize.w / 2;
          const cy = offsetRef.current.y + prevSize.h / 2;
          const anchorC = (cx - prev.gap) / prev.step;
          const anchorR = (cy - prev.gap) / prev.step;
          offsetRef.current = {
            x: anchorC * step + gap - w / 2,
            y: anchorR * step + gap - h / 2,
          };
          applyTransform();
        }
        layoutRef.current = { tile, step, gap };
        if (prevSize.w === w && prevSize.h === h) return prevSize;
        return { w, h };
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [columns, gap, applyTransform]);

  useEffect(() => {
    updateRange();
    applyTransform();
  }, [size, updateRange, applyTransform]);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(HINT_KEY)) setShowHint(true);
    } catch {
      setShowHint(true);
    }
  }, []);

  const dismissHint = useCallback(() => {
    setShowHint(false);
    try {
      window.localStorage.setItem(HINT_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  const stopInertia = useCallback(() => {
    if (inertiaRef.current) {
      cancelAnimationFrame(inertiaRef.current);
      inertiaRef.current = 0;
    }
  }, []);

  const startInertia = useCallback(() => {
    stopInertia();
    if (prefersReducedMotion()) return;
    const tick = () => {
      const v = velRef.current;
      v.x *= 0.92;
      v.y *= 0.92;
      if (Math.hypot(v.x, v.y) < 0.2) {
        inertiaRef.current = 0;
        return;
      }
      offsetRef.current.x -= v.x;
      offsetRef.current.y -= v.y;
      schedulePaint();
      inertiaRef.current = requestAnimationFrame(tick);
    };
    inertiaRef.current = requestAnimationFrame(tick);
  }, [schedulePaint, stopInertia]);

  const panBy = useCallback(
    (dx: number, dy: number) => {
      offsetRef.current.x -= dx;
      offsetRef.current.y -= dy;
      schedulePaint();
    },
    [schedulePaint],
  );

  const animatePanTo = useCallback(
    (targetX: number, targetY: number, ms = 400) => {
      stopInertia();
      if (prefersReducedMotion()) {
        offsetRef.current = { x: targetX, y: targetY };
        applyTransform();
        updateRange();
        return Promise.resolve();
      }
      const from = { ...offsetRef.current };
      const t0 = performance.now();
      return new Promise<void>((resolve) => {
        const step = (now: number) => {
          const t = Math.min(1, (now - t0) / ms);
          const e = easeOutCubic(t);
          offsetRef.current = {
            x: from.x + (targetX - from.x) * e,
            y: from.y + (targetY - from.y) * e,
          };
          applyTransform();
          updateRange();
          if (t < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
    },
    [applyTransform, stopInertia, updateRange],
  );

  const cellWorldPos = useCallback((c: number, r: number) => {
    const { tile, step, gap: g } = layoutRef.current;
    return { x: c * step + g, y: r * step + g, tile };
  }, []);

  const centerOnCell = useCallback(
    async (c: number, r: number) => {
      const { w, h } = size;
      const { tile, step, gap: g } = layoutRef.current;
      // Pan so cell (c, r) sits at the viewport center (pivot grows around that point).
      const cellX = c * step + g;
      const cellY = r * step + g;
      const targetX = cellX + tile / 2 - w / 2;
      const targetY = cellY + tile / 2 - h / 2;
      await animatePanTo(targetX, targetY);
    },
    [animatePanTo, size],
  );

  const enterPivot = useCallback(
    async (id: string, fromCell?: Cell) => {
      const { step, gap: g } = layoutRef.current;
      let cell = fromCell;
      if (!cell) {
        // Place an unknown pivot under the current viewport center.
        const { x, y } = offsetRef.current;
        const { w, h } = size;
        cell = {
          c: Math.round((x + w / 2 - g) / step),
          r: Math.round((y + h / 2 - g) / step),
        };
      }
      pivotCellRef.current = cell;
      setPivotCell(cell);
      setHomePivotId(id);
      dismissHint();
      setRippleRing(0);
      setPivotAnim(prefersReducedMotion() ? 1 : 0);
      await centerOnCell(cell.c, cell.r);
      if (!prefersReducedMotion()) {
        const t0 = performance.now();
        const grow = (now: number) => {
          const t = Math.min(1, (now - t0) / 350);
          setPivotAnim(easeOutCubic(t));
          if (t < 1) requestAnimationFrame(grow);
        };
        requestAnimationFrame(grow);
        // Ripple rings outward.
        let ring = 1;
        const rip = () => {
          setRippleRing(ring);
          ring += 1;
          if (ring <= maxRing) window.setTimeout(rip, 30);
        };
        window.setTimeout(rip, 80);
      } else {
        setRippleRing(maxRing);
      }
    },
    [centerOnCell, dismissHint, maxRing, setHomePivotId, size],
  );

  const exitPivot = useCallback(() => {
    setHomePivotId(null);
    setPivotCell(null);
    pivotCellRef.current = null;
    setPivotAnim(0);
    setRippleRing(0);
  }, [setHomePivotId]);

  // Clear local pivot chrome when the URL/context pivot is cleared (e.g. Escape, logo).
  useEffect(() => {
    if (homePivotId) return;
    setPivotCell(null);
    pivotCellRef.current = null;
    setPivotAnim(0);
    setRippleRing(0);
  }, [homePivotId]);

  // Open from URL without grow animation.
  useEffect(() => {
    if (!homePivotId || pivotCellRef.current) return;
    if (!byId(homePivotId)) return;
    const { step, gap: g } = layoutRef.current;
    const { x, y } = offsetRef.current;
    const { w, h } = size;
    if (w <= 0) return;
    const cell = {
      c: Math.round((x + w / 2 - g) / step),
      r: Math.round((y + h / 2 - g) / step),
    };
    pivotCellRef.current = cell;
    setPivotCell(cell);
    setPivotAnim(1);
    setRippleRing(maxRing);
    void centerOnCell(cell.c, cell.r);
  }, [homePivotId, byId, size, centerOnCell, maxRing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (typing) return;
      const stepPx = 80;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        panBy(stepPx, 0);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        panBy(-stepPx, 0);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        panBy(0, stepPx);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        panBy(0, -stepPx);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panBy]);

  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      stopInertia();
      // Trackpads send both axes; Shift+wheel maps vertical to horizontal for mouse wheels.
      const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? size.h : 1;
      const dx = -(e.shiftKey ? e.deltaY : e.deltaX) * scale;
      const dy = -(e.shiftKey ? 0 : e.deltaY) * scale;
      panBy(dx, dy);
      dismissHint();
    },
    [dismissHint, panBy, size.h, stopInertia],
  );

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    stopInertia();
    pannedRef.current = false;
    dragRef.current = {
      active: true,
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      ox: offsetRef.current.x,
      oy: offsetRef.current.y,
      lastX: e.clientX,
      lastY: e.clientY,
      lastT: performance.now(),
    };
    velRef.current = { x: 0, y: 0 };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d?.active || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!pannedRef.current && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!pannedRef.current) {
      pannedRef.current = true;
      setDragging(true);
      dismissHint();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    const now = performance.now();
    const dt = Math.max(1, now - d.lastT);
    velRef.current = {
      x: ((e.clientX - d.lastX) / dt) * 16,
      y: ((e.clientY - d.lastY) / dt) * 16,
    };
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    d.lastT = now;
    offsetRef.current = { x: d.ox - dx, y: d.oy - dy };
    schedulePaint();
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (pannedRef.current) startInertia();
  };

  const onClickCapture = (e: React.MouseEvent) => {
    if (!pannedRef.current) return;
    pannedRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  const onPick = useCallback(
    (id: string, el: HTMLButtonElement) => {
      if (pannedRef.current) return;
      const { step, gap: g } = layoutRef.current;
      // Recover cell from world position of the tile.
      const layer = layerRef.current;
      if (!layer) {
        void enterPivot(id);
        return;
      }
      const rect = el.getBoundingClientRect();
      const layerRect = layer.getBoundingClientRect();
      const localX = rect.left - layerRect.left;
      const localY = rect.top - layerRect.top;
      const c = Math.round((localX - g) / step);
      const r = Math.round((localY - g) / step);
      if (homePivotId === id) {
        exitPivot();
        return;
      }
      void enterPivot(id, { c, r });
    },
    [enterPivot, exitPivot, homePivotId],
  );

  const openIndustry = (name: string) => {
    setQuery("");
    setFilters({ facets: { industry: [name] }, color: null });
    setPage("explore");
  };

  // Industries covering the viewport (by cell count).
  const visibleIndustries = useMemo(() => {
    if (homePivotId && pivotTemplate) {
      return [{ name: pivotTemplate.industry, count: 1, thumb: pivotTemplate }];
    }
    const counts = new Map<string, { count: number; thumb: Template | null }>();
    for (let r = range.r0; r <= range.r1; r++) {
      for (let c = range.c0; c <= range.c1; c++) {
        const name = industryAt(c, r);
        const cur = counts.get(name) ?? { count: 0, thumb: null };
        cur.count += 1;
        if (!cur.thumb) cur.thumb = templateAt(c, r);
        counts.set(name, cur);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 2)
      .map(([name, v]) => ({ name, count: v.count, thumb: v.thumb }));
  }, [range, homePivotId, pivotTemplate, templateAt]);

  const { tile, step, gap: g } = layoutRef.current;
  const pivotSize = PIVOT_SPAN * tile + (PIVOT_SPAN - 1) * g;
  const cells: { c: number; r: number; template: Template; opacity: number }[] = [];
  if (all.length && size.w) {
    for (let r = range.r0; r <= range.r1; r++) {
      for (let c = range.c0; c <= range.c1; c++) {
        // Hide the cell under the pivot and its immediate neighbours so nothing peeks through.
        if (pivotCell && Math.abs(c - pivotCell.c) <= 1 && Math.abs(r - pivotCell.r) <= 1) {
          continue;
        }
        let template: Template | null = null;
        let opacity = 1;
        if (pivotCell && similarByCell.size) {
          const hit = similarByCell.get(`${c}:${r}`);
          if (hit) {
            template = hit;
            const dist = Math.max(Math.abs(c - pivotCell.c), Math.abs(r - pivotCell.r));
            opacity = prefersReducedMotion() || rippleRing >= dist ? 1 : 0;
          } else {
            template = templateAt(c, r);
          }
        } else {
          template = templateAt(c, r);
        }
        if (template) cells.push({ c, r, template, opacity });
      }
    }
  }

  const layerStyle: CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    willChange: "transform",
    transform: `translate3d(${-offsetRef.current.x}px, ${-offsetRef.current.y}px, 0)`,
  };

  return (
    <div
      ref={rootRef}
      className={cn(
        "absolute inset-0 touch-none select-none overflow-hidden bg-background",
        dragging ? "cursor-grabbing" : "cursor-grab",
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={onClickCapture}
      role="application"
      aria-label="Infinite template canvas"
    >
      <div ref={layerRef} style={layerStyle}>
        {cells.map(({ c, r, template, opacity }) => {
          const pos = cellWorldPos(c, r);
          return (
            <CanvasTile
              key={`${c}:${r}`}
              template={template}
              size={pos.tile}
              radius={radius}
              left={pos.x}
              top={pos.y}
              opacity={opacity}
              onPick={onPick}
            />
          );
        })}
        {pivotTemplate && pivotCell && (() => {
          const cell = cellWorldPos(pivotCell.c, pivotCell.r);
          // Animate real width/height (not CSS scale) so the 1200px source stays sharp.
          const current = tile + (pivotSize - tile) * pivotAnim;
          const left = cell.x + tile / 2 - current / 2;
          const top = cell.y + tile / 2 - current / 2;
          return (
          <div
            className="absolute z-10"
            style={{
              left,
              top,
              width: current,
              height: current,
              borderRadius: radius,
            }}
          >
            <button
              type="button"
              aria-label={`Close preview of ${pivotTemplate.displayTitle || pivotTemplate.slug}`}
              onClick={() => exitPivot()}
              className="size-full overflow-hidden bg-muted shadow-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
              style={{ borderRadius: radius }}
            >
              <ThumbImage
                key={pivotTemplate.templateId}
                src={templateImageUrl(pivotTemplate.templateId)}
                alt={pivotTemplate.displayTitle || pivotTemplate.slug}
                eager
                className="size-full object-cover"
              />
            </button>
            <div
              className="pointer-events-auto absolute top-full left-1/2 mt-4 flex -translate-x-1/2 items-center gap-1.5"
              style={{ opacity: pivotAnim }}
            >
              <div className="flex items-center gap-1 rounded-full bg-panel/90 p-1 shadow-lg ring-1 ring-foreground/10 backdrop-blur-xl">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 rounded-full px-2.5 text-xs"
                  onClick={() => setDetailOpen(true)}
                >
                  <InfoIcon className="size-3.5" />
                  View details
                </Button>
              </div>
            </div>
          </div>
          );
        })()}
      </div>

      {/* Industry chips */}
      <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center px-20">
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2">
          {homePivotId ? (
            <>
              {visibleIndustries[0] && (
                <button
                  type="button"
                  onClick={() => openIndustry(visibleIndustries[0].name)}
                  className="flex h-8 items-center gap-2 rounded-full bg-panel/80 pr-3 pl-1.5 text-[13px] shadow-sm ring-1 ring-foreground/10 backdrop-blur-xl transition-colors hover:bg-panel"
                >
                  {visibleIndustries[0].thumb && (
                    <span className="size-5 overflow-hidden rounded-md bg-muted">
                      <ThumbImage
                        src={templateImageUrl(visibleIndustries[0].thumb.templateId)}
                        alt=""
                        className="size-full object-cover"
                      />
                    </span>
                  )}
                  <span className="lowercase">{visibleIndustries[0].name}</span>
                </button>
              )}
              <button
                type="button"
                onClick={exitPivot}
                className="flex h-8 items-center gap-1.5 rounded-full bg-panel/80 px-3 text-[13px] shadow-sm ring-1 ring-foreground/10 backdrop-blur-xl transition-colors hover:bg-panel"
              >
                <XIcon className="size-3.5" />
                Back to canvas
              </button>
            </>
          ) : (
            visibleIndustries.map((ind) => (
              <button
                key={ind.name}
                type="button"
                onClick={() => openIndustry(ind.name)}
                className="flex h-8 items-center gap-2 rounded-full bg-panel/80 pr-3 pl-1.5 text-[13px] shadow-sm ring-1 ring-foreground/10 backdrop-blur-xl transition-colors hover:bg-panel"
              >
                {ind.thumb && (
                  <span className="size-5 overflow-hidden rounded-md bg-muted">
                    <ThumbImage
                      src={templateImageUrl(ind.thumb.templateId)}
                      alt=""
                      className="size-full object-cover"
                    />
                  </span>
                )}
                <span className="lowercase">{ind.name}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {showHint && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
          <p className="rounded-full bg-foreground/85 px-4 py-2 text-sm text-background shadow-lg backdrop-blur-sm">
            Drag to explore · click a design to see similar
          </p>
        </div>
      )}

      {!all.length && (
        <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
          Loading templates…
        </div>
      )}
    </div>
  );
}
