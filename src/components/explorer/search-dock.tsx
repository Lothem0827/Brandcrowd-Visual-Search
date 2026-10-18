"use client";
import {
  startTransition,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  ImagePlusIcon,
  LoaderCircleIcon,
  SearchIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { useIsMobile } from "@/lib/use-media-query";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { MAX_QUERY_LENGTH } from "@/lib/url-state";
import {
  completeQuery,
  highlightLabel,
  suggest,
  facetLabel,
  type Suggestion,
} from "@/lib/query";
import { cn } from "@/lib/utils";
import { useExplorer } from "./context";
import { ColorSearchButton } from "./color-search";

/**
 * Typing only updates the suggestion dropdown. The designs (and the URL, chips and AI call)
 * change when the user commits: Enter searches the typed text, clicking a suggestion searches
 * that suggestion.
 */
const SUGGEST_DEBOUNCE_MS = 100;

function SearchBox({
  inputRef,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const {
    query,
    setQuery,
    setPage,
    vocab,
    tagCounts,
    addFacet,
    imageQuery,
    setImageQuery,
    imageBusy,
    searchByImage,
  } = useExplorer();
  const [open, setOpen] = useState(false);
  // -1 means "no suggestion highlighted", so a plain Enter searches the typed text.
  const [active, setActive] = useState(-1);
  // `text` is local (only this box re-renders while typing); `query` is the committed search the
  // rest of the explorer sees. `lastPushed` records what we last wrote to `query` so external
  // changes can be told apart from our own commits (which must not move the caret).
  const [text, setText] = useState(query);
  const lastPushed = useRef(query);
  const fileRef = useRef<HTMLInputElement>(null);

  // Global search -> input, for changes this box didn't make (chip removal, image search,
  // Back/Forward). Our own commits are skipped so the caret never jumps.
  useEffect(() => {
    if (query === lastPushed.current) return;
    lastPushed.current = query;
    setText(query);
  }, [query]);

  /**
   * Commit a search: the box updates synchronously, while the (expensive) explorer-wide render
   * runs as a transition so a keystroke during it is handled first. Committing a non-empty
   * search also moves to Explore, since the user is now searching.
   */
  const commit = (next: string) => {
    if (next === lastPushed.current) return;
    lastPushed.current = next;
    setText(next);
    startTransition(() => {
      setQuery(next);
      if (next.trim()) setPage("explore");
    });
  };

  // Backspacing the query away should drop the search it was still showing.
  const onTextChange = (next: string) => {
    setText(next);
    setOpen(true);
    setActive(-1);
    if (!next) commit("");
  };
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
  // Suggestions come from the (lightly) debounced text so a fast typist doesn't run the vocab
  // scan on every key; the list still hides instantly when `text` ends in a space.
  const debouncedText = useDebouncedValue(text, SUGGEST_DEBOUNCE_MS);
  const suggestions = useMemo(
    () => (open ? suggest(debouncedText, vocab, tagCounts, 8) : []),
    [open, debouncedText, vocab, tagCounts],
  );
  const showList = open && suggestions.length > 0 && !/\s$/.test(text);

  const pick = (s: Suggestion) => {
    if (s.kind === "tag") {
      addFacet("tag", s.value);
      const words = text.trim().split(/\s+/);
      words.pop();
      commit(words.join(" ") + (words.length ? " " : ""));
    } else {
      commit(completeQuery(text, s.label));
    }
    setActive(-1);
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div className="relative w-full">
      <div className="flex h-13 items-center gap-1 rounded-full bg-panel/75 pr-2 pl-4 shadow-[0_8px_30px_rgb(0_0_0/0.12)] backdrop-blur-md transition-shadow focus-within:ring-2 focus-within:ring-ring/40">
        <SearchIcon
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        {imageQuery && (
          <span className="ml-1 flex shrink-0 items-center gap-1.5 rounded-full bg-muted py-0.5 pr-1 pl-0.5 text-xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageQuery.url}
              alt=""
              className="size-6 rounded-full object-cover"
            />
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
              className="rounded-full p-0.5 hover:bg-background"
              onClick={() => setImageQuery(null)}
            >
              <XIcon className="size-3" />
            </button>
          </span>
        )}
        <input
          ref={inputRef}
          id="template-search"
          maxLength={MAX_QUERY_LENGTH}
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (showList && e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1 >= suggestions.length ? 0 : a + 1));
            } else if (showList && e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a <= 0 ? suggestions.length - 1 : a - 1));
            } else if (showList && active >= 0 && e.key === "Tab") {
              // Tab accepts the highlighted suggestion, like clicking it.
              e.preventDefault();
              pick(suggestions[active]);
            } else if (e.key === "Enter") {
              // Enter searches the typed text; only an arrow/Tab-highlighted suggestion is applied.
              e.preventDefault();
              if (showList && active >= 0) pick(suggestions[active]);
              else commit(text);
              setOpen(false);
            } else if (e.key === "Escape") {
              if (showList) setOpen(false);
              else inputRef.current?.blur();
            }
          }}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={
            showList && active >= 0 ? `${listId}-${active}` : undefined
          }
          aria-autocomplete="list"
          aria-label="Search templates by style, layout, color, content…"
          placeholder="Search style, layout, color, content…"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground"
          spellCheck={false}
          autoComplete="off"
        />
        {text && (
          <button
            type="button"
            aria-label="Clear search"
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
            onClick={() => commit("")}
          >
            <XIcon className="size-4" />
          </button>
        )}
        <button
          type="button"
          aria-label="Open the design brief workspace"
          title="Open the design brief (palette, title and tags)"
          onClick={() => setPage("brief")}
          className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <SparklesIcon className="size-[18px]" />
        </button>
        <button
          type="button"
          aria-label={imageBusy ? "Reading image colors" : "Search by image"}
          aria-busy={imageBusy}
          disabled={imageBusy}
          title="Search by image (or drop an image anywhere). Max 10 MB."
          onClick={openPicker}
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-full transition-colors hover:bg-muted",
            "text-muted-foreground",
          )}
        >
          {imageBusy ? (
            <LoaderCircleIcon className="size-[18px] animate-spin" />
          ) : (
            <ImagePlusIcon className="size-[18px]" />
          )}
        </button>
        <ColorSearchButton />
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
          className="absolute right-0 bottom-15 left-0 z-50 overflow-hidden rounded-xl bg-popover p-1 text-sm shadow-xl"
        >
          {suggestions.map((s, i) => {
            const { before, match, after } = highlightLabel(
              s.label,
              debouncedText,
            );
            return (
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
                <span className="flex-1 truncate text-muted-foreground">
                  {before}
                  <span className="font-semibold text-foreground">{match}</span>
                  {after}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {s.count}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Minimal bottom-center dock: text search + image search + colour search. */
export function SearchDock({
  inputRef,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const { detailOpen } = useExplorer();
  const isMobile = useIsMobile();
  if (isMobile && detailOpen) return null; // details take the full screen on phones
  return (
    <div
      className={cn(
        // No panel compensation here: the dock lives inside the browse column, which the
        // detail/filter panels already shrink, so the pill centers itself.
        "pointer-events-none absolute inset-x-0 bottom-5 z-30 flex justify-center px-4",
        "max-md:bottom-0 max-md:px-0",
      )}
    >
      <div
        className={cn(
          "pointer-events-auto w-full max-w-[620px]",
          "max-md:max-w-none max-md:rounded-b-none",
        )}
        data-testid="search-dock"
        role="search"
        aria-label="Search templates"
      >
        <SearchBox inputRef={inputRef} />
      </div>
    </div>
  );
}
