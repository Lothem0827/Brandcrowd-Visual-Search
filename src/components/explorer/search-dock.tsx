"use client";
import { useId, useMemo, useRef, useState, type RefObject } from "react";
import { ChevronUpIcon, ImagePlusIcon, LoaderCircleIcon, SearchIcon, XIcon } from "lucide-react";
import { activeFilterCount } from "@/lib/facets";
import { useIsMobile } from "@/lib/use-media-query";
import { Button } from "@/components/ui/button";
import {
  completeQuery,
  suggest,
  facetLabel,
  type Suggestion,
} from "@/lib/query";
import { cn } from "@/lib/utils";
import { useExplorer } from "./context";
import { ActiveChips } from "./chips";
import { FilterBar } from "./filter-bar";

function SearchBox({
  inputRef,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const {
    query,
    setQuery,
    vocab,
    tagCounts,
    addFacet,
    imageQuery,
    setImageQuery,
    imageBusy,
    searchByImage,
  } = useExplorer();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  // Rapid clicks would otherwise queue one file picker per click.
  const pickerOpen = useRef(false);
  const openPicker = () => {
    if (pickerOpen.current || imageBusy) return;
    pickerOpen.current = true;
    const reset = () => {
      window.setTimeout(() => (pickerOpen.current = false), 400);
    };
    // the window regains focus when the picker closes, whether a file was chosen or not
    window.addEventListener("focus", reset, { once: true });
    fileRef.current?.addEventListener("cancel", reset, { once: true });
    fileRef.current?.click();
  };
  const listId = useId();
  const suggestions = useMemo(
    () => (open ? suggest(query, vocab, tagCounts, 8) : []),
    [open, query, vocab, tagCounts],
  );
  const showList = open && suggestions.length > 0 && !/\s$/.test(query);

  const pick = (s: Suggestion) => {
    if (s.kind === "tag") {
      addFacet("tag", s.value);
      const words = query.trim().split(/\s+/);
      words.pop();
      setQuery(words.join(" ") + (words.length ? " " : ""));
    } else {
      setQuery(completeQuery(query, s.label));
    }
    setActive(0);
    inputRef.current?.focus();
  };

  return (
    <div className="relative w-full">
      <div
        className={cn(
          "flex h-11 items-center gap-2 rounded-xl bg-panel pr-1.5 pl-3 transition-shadow",
          "focus-within:ring-3 focus-within:ring-ring/30",
        )}
      >
        <SearchIcon
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        {imageQuery && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-muted py-0.5 pr-1 pl-0.5 text-xs">
            {imageQuery.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageQuery.url}
                alt=""
                className="size-6 rounded object-cover"
              />
            )}
            <span className="flex gap-0.5">
              {imageQuery.palette.map((c) => (
                <span
                  key={c.hex}
                  className="size-2.5 rounded-full ring-1 ring-black/10"
                  style={{ background: c.hex }}
                />
              ))}
            </span>
            <button
              type="button"
              aria-label="Clear image search"
              className="rounded p-0.5 hover:bg-background"
              onClick={() => setImageQuery(null)}
            >
              <XIcon className="size-3" />
            </button>
          </span>
        )}
        <input
          ref={inputRef}
          id="template-search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (showList && e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % suggestions.length);
            } else if (showList && e.key === "ArrowUp") {
              e.preventDefault();
              setActive(
                (a) => (a - 1 + suggestions.length) % suggestions.length,
              );
            } else if (showList && (e.key === "Enter" || e.key === "Tab")) {
              e.preventDefault();
              pick(suggestions[active]);
            } else if (e.key === "Enter") {
              setOpen(false);
            } else if (e.key === "Escape") {
              if (showList) setOpen(false);
              else inputRef.current?.blur();
            }
          }}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
          aria-label="Search templates by style, layout, color, content…"
          placeholder="Search style, layout, color, content…"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground"
          spellCheck={false}
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            onClick={() => setQuery("")}
          >
            <XIcon className="size-3.5" />
          </button>
        )}
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={imageBusy ? "Reading image colors" : "Search by image"}
          aria-busy={imageBusy}
          disabled={imageBusy}
          title="Search by image (or drop an image anywhere). Max 10 MB."
          onClick={openPicker}
        >
          {imageBusy ? <LoaderCircleIcon className="animate-spin" /> : <ImagePlusIcon />}
        </Button>
        <kbd className="hidden h-6 min-w-6 items-center justify-center rounded-md bg-muted px-1.5 font-mono text-[11px] text-muted-foreground sm:flex">
          /
        </kbd>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          data-testid="image-upload"
          onChange={(e) => {
            pickerOpen.current = false;
            const f = e.target.files?.[0];
            if (f) void searchByImage(f);
            e.target.value = "";
          }}
        />
      </div>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute right-0 bottom-12 left-0 z-50 overflow-hidden rounded-xl bg-popover p-1 text-sm ring-1 ring-foreground/10"
        >
          {suggestions.map((s, i) => (
            <li
              key={`${s.facet}:${s.value}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5",
                i === active && "bg-muted",
              )}
            >
              <span className="w-24 shrink-0 text-[11px] tracking-wide text-muted-foreground uppercase">
                {facetLabel(s.facet)}
              </span>
              <span className="flex-1 truncate font-medium">{s.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {s.count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SearchDock({
  inputRef,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const { detailOpen, effective, imageQuery, results, base } = useExplorer();
  const isMobile = useIsMobile();
  // On phones the dock is a bottom sheet: search box always visible, chips + filters on demand.
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  if (isMobile && detailOpen) return null; // details take the full screen on phones
  const active = activeFilterCount(effective) + (effective.color ? 1 : 0) + (imageQuery ? 1 : 0);
  const showAll = !isMobile || expanded;
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center px-4",
        "max-md:bottom-0 max-md:px-0",
        detailOpen && "md:pr-[432px]",
      )}
    >
      <div
        className={cn(
          "pointer-events-auto w-full max-w-[800px] space-y-2 rounded-2xl bg-background/95 p-4 backdrop-blur",
          "max-md:rounded-b-none max-md:p-3 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-md:shadow-[0_-8px_24px_rgb(0_0_0/0.08)]",
        )}
        data-testid="search-dock"
        role="search"
        aria-label="Search templates"
      >
        {isMobile && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => setExpanded((e) => !e)}
            className="-mt-1 flex h-8 w-full items-center justify-between gap-2 rounded-lg px-1 text-xs text-muted-foreground"
          >
            <span className="tabular-nums">
              <b className="text-foreground">{results.length}</b> of {base.length} templates
            </span>
            <span className="flex items-center gap-1 font-medium text-foreground">
              {expanded ? "Hide filters" : "Filters"}
              {active > 0 && (
                <span className="rounded-full bg-[#F0812F] px-1.5 text-[10px] text-white tabular-nums">{active}</span>
              )}
              <ChevronUpIcon className={cn("size-4 transition-transform", expanded && "rotate-180")} aria-hidden />
            </span>
          </button>
        )}
        <div id={panelId} className={cn("space-y-2", !showAll && "hidden")}>
          <ActiveChips />
        </div>
        <SearchBox inputRef={inputRef} />
        {showAll && <FilterBar />}
      </div>
    </div>
  );
}
