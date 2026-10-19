"use client";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ChevronDownIcon,
  SparklesIcon,
  WandSparklesIcon,
  XIcon,
} from "lucide-react";
import { displayValue, FACET_MAP, type FacetKey } from "@/lib/facets";
import type { ColorMatchMode } from "@/lib/color";
import { ignoredQueryText } from "@/lib/query";
import { useIsMobile } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { useExplorer } from "./context";
import { useDragScroll } from "./use-drag-scroll";

const COLOR_LABEL: Record<ColorMatchMode, string> = {
  background: "Background",
  primary: "Primary",
  accent: "Accent",
  any: "Colour",
};

// useLayoutEffect warns when a client component is server-rendered.
const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

type ChipMetrics = {
  rows: number;
  /** Height that shows exactly 2 rows, or null when the chips fit in 2 rows. */
  collapsePx: number | null;
  /** Height that shows exactly 6 rows, or null when the chips fit in 6 rows. */
  expandPx: number | null;
};

/** Compact active chips + Clear all for the explore header row. */
export function HeaderDetectedChips() {
  const {
    parsed,
    filters,
    toggleFacet,
    setFilters,
    clearAll,
    imageQuery,
    setImageQuery,
    query,
  } = useExplorer();
  const detected = parsed.chips;
  const committed = (
    Object.entries(filters.facets) as [FacetKey, string[]][]
  ).flatMap(([k, vs]) =>
    (vs ?? [])
      .filter((v) => !detected.some((c) => c.facet === k && c.value === v))
      .map((v) => ({ facet: k, value: v })),
  );
  const colors = filters.color?.colors ?? [];
  const any =
    detected.length > 0 ||
    committed.length > 0 ||
    colors.length > 0 ||
    !!imageQuery ||
    !!query.trim();

  const drag = useDragScroll();

  if (!any) return null;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div
        {...drag.props}
        className={cn(
          "no-scrollbar flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto overscroll-x-contain",
          drag.dragging ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        {detected.map((c) => (
          <Chip
            key={`d:${c.facet}:${c.value}`}
            dark
            label={FACET_MAP[c.facet].label}
            value={displayValue(c.facet, c.value)}
            onRemove={() => toggleFacet(c.facet, c.value)}
          />
        ))}
        {committed.map((c) => (
          <Chip
            key={`c:${c.facet}:${c.value}`}
            label={FACET_MAP[c.facet].label}
            value={displayValue(c.facet, c.value)}
            onRemove={() => toggleFacet(c.facet, c.value)}
          />
        ))}
        {colors.map((hex, i) => (
          <Chip
            key={hex}
            label={
              i === 0
                ? filters.color?.mode === "background"
                  ? "Background"
                  : COLOR_LABEL[filters.color?.mode ?? "any"]
                : ""
            }
            value={hex}
            swatch={hex}
            onRemove={() => {
              const rest = colors.filter((c) => c !== hex);
              setFilters((f) => ({
                ...f,
                color: rest.length
                  ? { colors: rest, mode: f.color?.mode ?? "background" }
                  : null,
              }));
            }}
          />
        ))}
        {imageQuery && (
          <Chip
            label="Image"
            value="colors from upload"
            swatch={imageQuery.palette[0]?.hex}
            onRemove={() => setImageQuery(null)}
          />
        )}
      </div>
      <button
        type="button"
        onClick={clearAll}
        className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        Clear all
      </button>
    </div>
  );
}

export function ActiveChips() {
  const {
    parsed,
    filters,
    toggleFacet,
    setFilters,
    clearAll,
    imageQuery,
    setImageQuery,
    query,
    searching,
    ai,
    aiStatus,
    dismissAi,
  } = useExplorer();
  const isMobile = useIsMobile();
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  const [metrics, setMetrics] = useState<ChipMetrics>({
    rows: 0,
    collapsePx: null,
    expandPx: null,
  });
  const detected = parsed.chips;
  const ignored = ignoredQueryText(query);
  const committed = (
    Object.entries(filters.facets) as [FacetKey, string[]][]
  ).flatMap(([k, vs]) =>
    (vs ?? [])
      .filter((v) => !detected.some((c) => c.facet === k && c.value === v))
      .map((v) => ({ facet: k, value: v })),
  );
  // interpreted chips that aren't already shown as detected/committed
  const aiChips = (Object.entries(ai?.facets ?? {}) as [FacetKey, string[]][]).flatMap(
    ([k, vs]) =>
      (vs ?? [])
        .filter((v) => !detected.some((c) => c.facet === k && c.value === v))
        .filter((v) => !(filters.facets[k] ?? []).includes(v))
        .map((v) => ({ facet: k, value: v })),
  );
  const showAi = aiChips.length > 0 || !!ai?.text;
  const any =
    detected.length ||
    committed.length ||
    filters.color?.colors.length ||
    imageQuery ||
    showAi ||
    query.trim();

  // Any change to the chip set re-measures and re-collapses the list.
  const signature = [
    detected.length,
    committed.length,
    aiChips.length,
    ai?.text ?? "",
    (filters.color?.colors ?? []).join(","),
    filters.color?.mode ?? "",
    imageQuery?.url ?? "",
    query.trim(),
  ].join("|");

  // Collapse again whenever the chip set changes (new search or facets).
  const lastSignature = useRef<string | null>(null);

  const measure = useCallback(() => {
    if (lastSignature.current !== signature) {
      lastSignature.current = signature;
      setExpanded(false);
    }
    const el = listRef.current;
    if (!el) return;
    const items = Array.from(el.children) as HTMLElement[];
    if (!items.length) {
      setMetrics((m) =>
        m.rows === 0 && m.collapsePx === null && m.expandPx === null
          ? m
          : { rows: 0, collapsePx: null, expandPx: null },
      );
      return;
    }
    const top = el.getBoundingClientRect().top;
    // Items are centre-aligned, so a shared vertical centre means a shared row.
    const centers = items.map((c) => {
      const r = c.getBoundingClientRect();
      return Math.round(r.top + r.height / 2);
    });
    const rows = Array.from(new Set(centers)).sort((a, b) => a - b);
    const rowsCount = rows.length;
    const bottomOfFirstRows = (count: number) => {
      let bottom = 0;
      items.forEach((c, i) => {
        if (rows.indexOf(centers[i]) < count) {
          bottom = Math.max(bottom, c.getBoundingClientRect().bottom - top);
        }
      });
      return Math.ceil(bottom);
    };
    const collapsePx = rowsCount > 2 ? bottomOfFirstRows(2) : null;
    const expandPx = rowsCount > 6 ? bottomOfFirstRows(6) : null;
    setMetrics((m) =>
      m.rows === rowsCount &&
      m.collapsePx === collapsePx &&
      m.expandPx === expandPx
        ? m
        : { rows: rowsCount, collapsePx, expandPx },
    );
  }, [signature]);

  // Re-measure when the chip set changes: `measure` keeps a stable identity until `signature`
  // changes, so keystrokes/renders that don't alter the chips no longer force layout reads.
  // Width changes (the panel opening, a resize) are handled by the ResizeObserver below.
  useIsoLayoutEffect(() => {
    if (!isMobile) measure();
  }, [isMobile, measure]);

  // Width changes re-wrap the chips, so re-measure on container resize.
  useEffect(() => {
    if (isMobile || typeof ResizeObserver === "undefined") return;
    const el = listRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMobile, measure]);

  const overflow = !isMobile && metrics.collapsePx !== null;
  const scrollable = overflow && expanded && metrics.expandPx !== null;
  const maxHeight = !overflow
    ? undefined
    : expanded
      ? (metrics.expandPx ?? undefined)
      : (metrics.collapsePx ?? undefined);

  return (
    <div className="space-y-1.5">
      <div
        ref={listRef}
        id={listId}
        className={cn(
          "flex min-h-7 flex-wrap items-center gap-1.5",
          overflow && !expanded && "overflow-hidden",
          scrollable && "thin-scroll overflow-y-auto overscroll-contain pr-1",
        )}
        style={{ maxHeight }}
      >
      {detected.length > 0 && (
        <span className="mr-1 flex items-center gap-1 text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
          <SparklesIcon className="size-3" /> Detected
        </span>
      )}
      {detected.map((c) => (
        <Chip
          key={`d:${c.facet}:${c.value}`}
          dark
          label={FACET_MAP[c.facet].label}
          value={displayValue(c.facet, c.value)}
          onRemove={() => toggleFacet(c.facet, c.value)}
        />
      ))}
      {committed.map((c) => (
        <Chip
          key={`c:${c.facet}:${c.value}`}
          label={FACET_MAP[c.facet].label}
          value={displayValue(c.facet, c.value)}
          onRemove={() => toggleFacet(c.facet, c.value)}
        />
      ))}
      {aiStatus === "loading" && (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <WandSparklesIcon className="size-3 animate-pulse text-primary" />
          Reading your query…
        </span>
      )}
      {showAi && (
        <>
          <span className="flex items-center gap-1 text-[10px] font-medium tracking-[0.12em] text-primary uppercase">
            <WandSparklesIcon className="size-3" /> AI
          </span>
          {aiChips.map((c) => (
            <Chip
              key={`ai:${c.facet}:${c.value}`}
              ai
              label={FACET_MAP[c.facet].label}
              value={displayValue(c.facet, c.value)}
              onRemove={() => dismissAi(c.facet, c.value)}
            />
          ))}
          {ai?.text && (
            <span className="text-xs text-muted-foreground">
              + keywords “{ai.text}”
            </span>
          )}
          {ai?.reason && (
            <span className="flex items-baseline gap-1 text-xs text-muted-foreground/80">
              {ai.reason}
              <button
                type="button"
                onClick={() => dismissAi()}
                className="shrink-0 underline underline-offset-2 hover:text-foreground"
              >
                dismiss
              </button>
            </span>
          )}
        </>
      )}
      {(filters.color?.colors ?? []).map((hex, i) => (
        <Chip
          key={hex}
          label={i === 0 ? (filters.color?.mode === "background" ? "Background" : COLOR_LABEL[filters.color?.mode ?? "any"]) : ""}
          value={hex}
          swatch={hex}
          onRemove={() => {
            const rest = (filters.color?.colors ?? []).filter((c) => c !== hex);
            setFilters((f) => ({ ...f, color: rest.length ? { colors: rest, mode: f.color?.mode ?? "background" } : null }));
          }}
        />
      ))}
      {imageQuery && (
        <Chip
          label="Image"
          value="colors from upload"
          swatch={imageQuery.palette[0]?.hex}
          onRemove={() => setImageQuery(null)}
        />
      )}
      {parsed.text && (
        <span className="max-w-[260px] truncate text-xs text-muted-foreground" title={parsed.text}>
          + text “{parsed.text}”
        </span>
      )}
      {ignored && (
        <span className="max-w-[260px] truncate text-xs text-muted-foreground" title={ignored}>
          Ignored “{ignored}” (English keywords only)
        </span>
      )}
      {searching && query.trim() && (
        <span className="text-xs text-muted-foreground" role="status">
          Searching…
        </span>
      )}
      {!any && (
        <span className="text-xs text-muted-foreground">
          Try “construction bold design”, “retro serif cutout”, or “text only
          quote”.
        </span>
      )}
      </div>
      {any && (
        <div className="flex items-center gap-3">
          {overflow && (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => setExpanded((e) => !e)}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {expanded ? "Show less" : `Show all ${metrics.rows} rows`}
              <ChevronDownIcon
                className={cn(
                  "size-3.5 transition-transform",
                  expanded && "rotate-180",
                )}
                aria-hidden
              />
            </button>
          )}
          <button
            type="button"
            onClick={clearAll}
            className="ml-auto text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

export function Chip({
  label,
  value,
  onRemove,
  dark,
  ai,
  swatch,
}: {
  label: string;
  value: string;
  onRemove: () => void;
  dark?: boolean;
  ai?: boolean;
  swatch?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full pr-1 pl-2.5 text-xs",
        dark ? "bg-foreground text-background" : "bg-panel",
        ai && "bg-primary/5",
      )}
    >
      {ai && <WandSparklesIcon className="size-3 text-primary" aria-hidden />}
      {swatch && (
        <span
          className="size-3 shrink-0 rounded-full ring-1 ring-black/15"
          style={{ background: swatch }}
        />
      )}
      {label && (
        <span className={dark ? "text-background/65" : "text-muted-foreground"}>
          {label}:
        </span>
      )}
      <span className="font-medium">{value}</span>
      <button
        type="button"
        aria-label={`Remove ${label} ${value}`}
        onClick={onRemove}
        className={cn(
          "grid size-6 place-items-center rounded-full",
          dark ? "hover:bg-background/20" : "hover:bg-muted",
        )}
      >
        <XIcon className="size-3" />
      </button>
    </span>
  );
}
