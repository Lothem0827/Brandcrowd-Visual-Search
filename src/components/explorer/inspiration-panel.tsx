"use client";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import type { Template } from "@/lib/schema";
import { INSPO_MIME, inspoPayload, type BriefDraft } from "@/lib/brief-board";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { cn } from "@/lib/utils";
import { useExplorer } from "./context";
import { ThumbImage } from "./thumb-image";

const RESULT_LIMIT = 60;

const matches = (template: Template, needle: string) => {
  if (!needle) return true;
  const haystack = [
    template.industry,
    template.category,
    template.displayTitle,
    template.name,
    template.topic,
    ...template.tags,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
};

/** One inspiration result: a draggable tile showing the whole design. */
function InspoTile({
  template,
  inBrief,
  onAdd,
  onPickColor,
}: {
  template: Template;
  inBrief: boolean;
  onAdd: (template: Template) => void;
  onPickColor: (template: Template, hex: string) => void;
}) {
  const label = template.displayTitle || template.name;
  const swatches = template.colors.slice(0, 4);
  // The design is the point of the grid, so its name and colours stay tucked away until asked for.
  const [details, setDetails] = useState(false);
  return (
    <div
      draggable
      data-testid="inspo-tile"
      onDragStart={(event) => {
        event.dataTransfer.setData(INSPO_MIME, inspoPayload(template.templateId));
        event.dataTransfer.effectAllowed = "copy";
      }}
      title="Drag onto a brief, or onto the canvas"
      className="group relative flex cursor-grab flex-col gap-1 rounded-xl bg-panel/50 p-1.5 ring-1 ring-foreground/10 transition-shadow hover:shadow-sm active:cursor-grabbing"
    >
      <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
        <ThumbImage
          src={template.thumbnailImage}
          alt={label}
          className="size-full object-contain"
        />
        {inBrief && (
          <span className="absolute top-1 left-1 rounded-full bg-foreground/85 px-1.5 py-0.5 text-[9px] font-semibold text-background backdrop-blur-sm">
            In brief
          </span>
        )}
        <button
          type="button"
          draggable={false}
          aria-expanded={details}
          aria-label={`${details ? "Hide" : "Show"} details for ${label}`}
          title={details ? "Hide details" : "Show title and colours"}
          onClick={(event) => {
            event.stopPropagation();
            setDetails((open) => !open);
          }}
          className="absolute top-1 right-1 grid size-6 place-items-center rounded-md bg-background/85 text-foreground ring-1 ring-foreground/10 backdrop-blur-sm transition-colors hover:bg-background"
        >
          {details ? <ChevronUpIcon className="size-3.5" /> : <ChevronDownIcon className="size-3.5" />}
        </button>
        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 pt-4 pb-1 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
          Drag to brief
        </span>
      </div>
      {details && (
        <div className="space-y-1 px-0.5 pb-0.5">
          <p className="line-clamp-2 text-[11px] leading-snug font-medium">{label}</p>
          <div className="flex items-center gap-1">
            {swatches.map((color) => (
              <button
                key={`${color.hex}-${color.role}`}
                type="button"
                data-testid="inspo-swatch"
                aria-label={`Use ${color.name || color.hex} from ${label}`}
                title={`Use ${color.hex} — fills the armed palette slot`}
                onClick={() => onPickColor(template, color.hex)}
                className="size-4 rounded-full ring-1 ring-black/15 transition-transform hover:scale-110"
                style={{ background: color.hex }}
              />
            ))}
            <button
              type="button"
              onClick={() => onAdd(template)}
              aria-label={`Add ${label} to the brief`}
              className="ml-auto flex h-5 items-center gap-0.5 rounded-full bg-panel px-1.5 text-[9px] font-medium md:hidden"
            >
              <PlusIcon className="size-2.5" /> Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Right-hand inspiration search.
 *
 * Mounted only while open, so the search input always starts on the board's industry. Search
 * uses the Explorer worker index without touching the Explore query, and every tile can be
 * dragged into a brief (or onto empty canvas for a loose inspiration card).
 */
export function InspirationPanel({
  open,
  industry,
  draft,
  onClose,
  onAddDesign,
  onPickColor,
  onTransitionEnd,
}: {
  open: boolean;
  /** the industry the board was generated with (`draft.query`, falling back to its label) */
  industry: string;
  draft?: BriefDraft;
  onClose: () => void;
  onAddDesign: (template: Template) => void;
  onPickColor: (template: Template, hex: string) => void;
  onTransitionEnd?: () => void;
}) {
  const { all, byId, designSearch } = useExplorer();
  const [text, setText] = useState(industry);
  const [answer, setAnswer] = useState<{ query: string; items: Template[] } | null>(null);
  const debounced = useDebouncedValue(text, 200);
  const query = debounced.trim() || industry.trim();

  // Keep following the board's industry, but never overwrite text the user typed.
  const [prefilled, setPrefilled] = useState(industry);
  if (prefilled !== industry) {
    if (text === prefilled) setText(industry);
    setPrefilled(industry);
  }

  const onBoard = useMemo(() => {
    const ids = new Set<string>();
    for (const card of draft?.cards ?? []) {
      if (card.kind === "design") ids.add(card.templateId);
      else if (card.kind === "brief") for (const design of card.designs) ids.add(design.templateId);
    }
    return ids;
  }, [draft?.cards]);

  // The local pass paints immediately and doubles as the fallback when the worker is busy.
  const local = useMemo(() => {
    const needle = debounced.trim().toLowerCase();
    const pool = needle
      ? all.filter((template) => matches(template, needle))
      : all.filter((template) => matches(template, industry.trim().toLowerCase()));
    return (pool.length ? pool : needle ? [] : all).slice(0, RESULT_LIMIT);
  }, [all, debounced, industry]);

  useEffect(() => {
    let cancelled = false;
    designSearch(query)
      .then((scores) => {
        if (cancelled) return;
        const ranked = [...scores.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([id]) => byId(id))
          .filter((template): template is Template => !!template)
          .slice(0, RESULT_LIMIT);
        setAnswer({ query, items: ranked });
      })
      .catch(() => {
        if (!cancelled) setAnswer({ query, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [byId, designSearch, query]);

  // Results only count for the query that produced them; otherwise the local pass shows.
  const resolved = answer?.query === query ? answer.items : null;
  const shown = resolved ?? local;
  const busy = resolved === null;
  const trimmed = text.trim();

  return (
    <aside
      aria-label="Design inspiration"
      aria-hidden={!open}
      onTransitionEnd={onTransitionEnd}
      className={cn(
        "relative z-20 h-full shrink-0 overflow-hidden bg-background transition-[width] duration-300 ease-out",
        open
          ? "visible w-[340px] max-md:fixed max-md:inset-x-0 max-md:top-16 max-md:bottom-0 max-md:z-40"
          : "invisible w-0",
      )}
      data-testid="inspiration-panel"
    >
      <div
        inert={!open}
        className="flex h-full w-[340px] flex-col border-l border-border/60 max-md:w-full"
      >
        <div className="flex shrink-0 items-center justify-between px-4 py-2.5">
          <div className="text-sm font-semibold">Inspiration</div>
          <button
            type="button"
            aria-label="Close inspiration"
            onClick={onClose}
            className="grid size-7 place-items-center rounded-lg bg-panel hover:bg-muted"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>

        <div className="shrink-0 space-y-2 px-4 pb-3">
          <div className="flex h-10 items-center gap-2 rounded-full bg-panel px-3 ring-1 ring-foreground/10 focus-within:ring-2 focus-within:ring-ring/40">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Search inspiration"
              aria-label="Search inspiration"
              maxLength={80}
              className="h-full min-w-0 flex-1 bg-transparent text-[13px] font-medium outline-none placeholder:text-muted-foreground/80"
            />
            {text && (
              <button
                type="button"
                aria-label="Clear inspiration search"
                onClick={() => setText("")}
                className="grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <XIcon className="size-3" />
              </button>
            )}
          </div>
          <p className="px-1 text-[11px] text-muted-foreground">
            Drag a design onto a brief, or onto the canvas. Click a swatch to fill the armed
            palette slot.
          </p>
        </div>

        <div className="thin-scroll flex-1 overflow-y-auto px-3 pb-24">
          {shown.length === 0 ? (
            <p className="px-2 py-10 text-center text-[12px] text-muted-foreground">
              {busy
                ? "Searching…"
                : trimmed
                  ? `No designs match “${trimmed}”.`
                  : "Search inspiration to find designs for this brief."}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {shown.map((template) => (
                <InspoTile
                  key={template.templateId}
                  template={template}
                  inBrief={onBoard.has(template.templateId)}
                  onAdd={onAddDesign}
                  onPickColor={onPickColor}
                />
              ))}
            </div>
          )}
          {resolved === null && (
            <p className="px-2 pt-2 text-center text-[11px] text-muted-foreground">
              {trimmed ? "Showing close matches." : "Search inspiration to narrow these designs."}
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
