"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookmarkIcon,
  CompassIcon,
  ListChecksIcon,
  MoonIcon,
  PencilIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  SunIcon,
  TagIcon,
  XIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { activeFilterCount, sentenceCase, type FacetKey } from "@/lib/facets";
import { relatedChips } from "@/lib/query";
import type { Template } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BackButton } from "./back-button";
import { BoardsPage } from "./boards-page";
import { BriefPage } from "./brief-page";
import { HeaderDetectedChips } from "./chips";
import { useExplorer, type View } from "./context";
import {
  HEADER_CONTROL,
  HEADER_CONTROL_IDLE,
  HEADER_CONTROL_ON,
  HEADER_INSET,
  HEADER_ROW,
  HEADER_SEGMENT,
  HEADER_SEGMENT_ITEM,
  HEADER_TITLE,
} from "./header";
import { GridView } from "./grid-view";
import { HomeCanvas } from "./home-canvas";
import { useBoards } from "./use-boards";
import { useDragScroll } from "./use-drag-scroll";

/** Shared look for the single-row, grab-and-drag chip strips at the top of the browse area. */
function useChipRow() {
  const drag = useDragScroll();
  return {
    drag,
    className: cn(
      "no-scrollbar flex min-h-8 gap-1.5 overflow-x-auto overscroll-x-contain pt-0.5",
      drag.dragging ? "cursor-grabbing" : "cursor-grab",
    ),
  };
}

function ThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <div className={HEADER_SEGMENT} role="group" aria-label="Color theme">
      <button
        type="button"
        aria-pressed={!dark}
        aria-label="Light mode"
        title="Light mode"
        onClick={() => setTheme("light")}
        className={cn(
          HEADER_SEGMENT_ITEM,
          !dark
            ? HEADER_CONTROL_ON
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <SunIcon className="size-3.5" />
      </button>
      <button
        type="button"
        aria-pressed={dark}
        aria-label="Dark mode"
        title="Dark mode"
        onClick={() => setTheme("dark")}
        className={cn(
          HEADER_SEGMENT_ITEM,
          dark
            ? HEADER_CONTROL_ON
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <MoonIcon className="size-3.5" />
      </button>
    </div>
  );
}

function FilterToggle() {
  const { effective, filterPanelOpen, setFilterPanelOpen } = useExplorer();
  const active = activeFilterCount(effective) + (effective.color ? 1 : 0);
  return (
    <button
      type="button"
      aria-pressed={filterPanelOpen}
      aria-label="Filters"
      title="Filters"
      onClick={() => setFilterPanelOpen(!filterPanelOpen)}
      className={cn(
        "relative",
        HEADER_CONTROL,
        filterPanelOpen ? HEADER_CONTROL_ON : HEADER_CONTROL_IDLE,
      )}
    >
      <SlidersHorizontalIcon className="size-4" />
      {active > 0 && (
        <span className="absolute -top-1 -right-1 rounded-full bg-[#F0812F] px-1 text-[9px] leading-4 text-white tabular-nums">
          {active}
        </span>
      )}
    </button>
  );
}

function ResultsHeading() {
  const { query, parsed, imageQuery, ai } = useExplorer();
  const q = query.trim();
  return (
    <div className="flex min-w-0 shrink items-center gap-2">
      <h2 className="truncate text-xl text-muted-foreground">
        {imageQuery ? (
          "Showing results for your image"
        ) : q ? (
          <>
            Showing results for{" "}
            <span className="font-semibold text-foreground">{q}</span>
          </>
        ) : (
          <span className="font-semibold text-foreground">
            Filtered results
          </span>
        )}
      </h2>
      {ai?.text && (
        <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
          <SparklesIcon className="size-3" /> + “{ai.text}”
        </span>
      )}
      {parsed.text && !q && (
        <span className="text-xs text-muted-foreground">
          + text “{parsed.text}”
        </span>
      )}
    </div>
  );
}

/** Related search chips: the terms/tags the committed query matches, minus what's already applied. */
function RelatedChips() {
  const { query, setQuery, vocab, tagCounts, parsed, filters } = useExplorer();
  const { drag, className } = useChipRow();
  const chips = useMemo(() => {
    const applied = [
      ...parsed.chips.map((c) => ({ facet: c.facet, value: c.value })),
      ...(Object.entries(filters.facets) as [FacetKey, string[]][]).flatMap(
        ([facet, values]) => (values ?? []).map((value) => ({ facet, value })),
      ),
    ];
    return relatedChips(query, vocab, tagCounts, applied);
  }, [query, vocab, tagCounts, parsed, filters]);
  if (!chips.length) return null;
  return (
    <div data-testid="related-chips" {...drag.props} className={className}>
      {chips.map((s) => (
        <button
          key={`${s.facet}:${s.value}`}
          type="button"
          onClick={() => setQuery(s.label)}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-panel px-3 text-[13px] transition-colors hover:bg-muted"
        >
          <span>{sentenceCase(s.label)}</span>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {s.count}
          </span>
        </button>
      ))}
    </div>
  );
}

function PopularTags() {
  const { tagCounts, addFacet, effective } = useExplorer();
  const { drag, className } = useChipRow();
  const selected = new Set(effective.facets.tag ?? []);
  const top = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16);
  if (!top.length) return null;
  return (
    <div data-testid="popular-tags" {...drag.props} className={className}>
      {top.map(([tag, count]) => {
        const on = selected.has(tag);
        return (
          <button
            key={tag}
            type="button"
            aria-pressed={on}
            onClick={() => addFacet("tag", tag)}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors",
              on ? "bg-foreground text-background" : "bg-panel hover:bg-muted",
            )}
          >
            <span>{sentenceCase(tag)}</span>
            <span
              className={cn(
                "text-[11px] tabular-nums",
                on ? "text-background/60" : "text-muted-foreground",
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function EmptyState() {
  const { hasSearch, unsearchable, noCloseMatch, query, clearAll, searching } =
    useExplorer();
  if (searching) return null;
  if (!hasSearch) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center text-muted-foreground">
        <CompassIcon className="size-7" />
        <div className="text-sm font-semibold text-foreground">
          No templates in this category
        </div>
      </div>
    );
  }
  return (
    <div className="absolute inset-0 grid place-items-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-1.5 text-center">
        <TagIcon className="size-7 text-muted-foreground" />
        <div className="text-sm font-semibold">
          {unsearchable
            ? "That query can't be searched"
            : noCloseMatch
              ? `No close match for “${query.trim()}”`
              : "No designs match these filters"}
        </div>
        <div className="text-xs text-muted-foreground">
          {unsearchable
            ? "Search works in English for now — try keywords like “bold”, “retro serif” or “sale”."
            : noCloseMatch
              ? "Try a broader term, or search by an image or colour."
              : "Remove a filter or clear the search to see more."}
        </div>
        <button
          type="button"
          onClick={clearAll}
          className="mt-2 flex h-8 items-center gap-1.5 rounded-full bg-panel px-3 text-sm font-medium hover:bg-muted"
        >
          <XIcon className="size-4" /> Clear search
        </button>
      </div>
    </div>
  );
}

/** Result count (or "Searching…") for the header row. */
function ResultCount() {
  const { results, searching } = useExplorer();
  return (
    <span
      className="shrink-0 text-xs text-muted-foreground tabular-nums"
      role="status"
    >
      {searching
        ? "Searching…"
        : `${results.length} result${results.length === 1 ? "" : "s"}`}
    </span>
  );
}

/** Explore: popular tags / results heading, filter + theme toggle, then the grid. */
function ExploreArea() {
  const { hasSearch, browseItems } = useExplorer();
  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "z-10 shrink-0 space-y-2 bg-background",
          HEADER_INSET,
          "pb-4",
        )}
      >
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            {hasSearch ? (
              <>
                <ResultsHeading />
                <FilterToggle />
                <HeaderDetectedChips />
                <ResultCount />
              </>
            ) : (
              <div className="flex items-center gap-2 text-xl font-semibold">
                Popular tags
                <FilterToggle />
              </div>
            )}
          </div>
          <ThemeSwitch />
        </div>
        {hasSearch ? <RelatedChips /> : <PopularTags />}
      </div>
      <div className="relative min-h-0 flex-1">
        <GridView items={browseItems} />
        {browseItems.length === 0 && <EmptyState />}
      </div>
    </div>
  );
}

/**
 * Board title with inline rename: the pencil swaps the heading for a text input, Enter or blur
 * commits through `store.rename`, Escape discards. Lives here (not in the boards panel) so the
 * header is the single place a board's name is edited.
 */
function BoardName({ id, name }: { id: string; name: string }) {
  const { store } = useBoards();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  // Escape must not save the discarded draft, and the blur React may still fire afterwards must
  // not save it either — nor may a save run twice (blur after Enter).
  const cancelled = useRef(false);
  const settled = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const start = () => {
    setDraft(name);
    cancelled.current = false;
    settled.current = false;
    setEditing(true);
  };
  const settle = (save: boolean) => {
    if (settled.current) return;
    settled.current = true;
    if (save && !cancelled.current) store.rename(id, draft.trim() || name);
    setEditing(false);
  };

  // Focus and pre-select the whole name so typing replaces it. Done here rather than with
  // `autoFocus` + `onFocus`: the effect is guaranteed to run after the input commits, so the
  // selection cannot be wiped by the browser finishing the focus it was given.
  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        aria-label="Board name"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => settle(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            settle(true);
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancelled.current = true;
            settle(false);
          }
        }}
        className="h-8 w-full min-w-0 rounded-md bg-panel px-2 text-[15px] font-semibold ring-1 ring-foreground/15 outline-none"
      />
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-1">
      <h2 className={HEADER_TITLE}>{name}</h2>
      <button
        type="button"
        aria-label="Rename board"
        title="Rename board"
        onClick={start}
        className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <PencilIcon className="size-4" />
      </button>
    </div>
  );
}

/**
 * The board a view belongs to: the board itself, or the origin of a design opened from one.
 * The boards route keeps the board grid underneath the lightbox/mind-map for exactly this.
 */
function boardIdOf(view: View): string | null {
  if (view.kind === "board") return view.boardId;
  if (view.kind === "focused" || view.kind === "similar") {
    return view.origin.kind === "board" ? view.origin.boardId : null;
  }
  return null;
}

/** Board: one saved board's designs in the browse area grid. */
function BoardArea() {
  const {
    view,
    setView,
    setPage,
    byId,
    boardSelection,
    startBoardSelect,
    stopBoardSelect,
    clearAll,
    pinBoard,
  } = useExplorer();
  const { boards } = useBoards();
  const boardId = boardIdOf(view);
  const board = boardId
    ? boards.find((b) => b.id === boardId)
    : undefined;
  const items = (board?.templateIds ?? [])
    .map((id) => byId(id))
    .filter((t): t is Template => !!t);
  const selecting = !!boardSelection;

  const findMore = () => {
    if (!board) return;
    clearAll();
    pinBoard(board.id);
    setPage("explore");
  };

  return (
    <div className="flex h-full flex-col">
      <div className={cn(HEADER_ROW, "z-10 bg-background")}>
        <BackButton
          label="Back to boards"
          side="top"
          // Boards open from the full-page index now, so Back returns there. Clearing the view
          // too rewrites /boards/<id> to /boards and stops the index's Esc bouncing back in.
          onClick={() => {
            setView({ kind: "search" });
            setPage("boards");
          }}
        />
        {board ? (
          <div className="min-w-0 flex-1">
            <BoardName id={board.id} name={board.name} />
          </div>
        ) : (
          <h2 className={cn(HEADER_TITLE, "flex-1")}>Board</h2>
        )}
        <span
          className="shrink-0 text-xs text-muted-foreground tabular-nums"
          role="status"
        >
          {items.length} design{items.length === 1 ? "" : "s"}
        </span>
        {board && (
          <Button
            type="button"
            size="sm"
            data-testid="find-more-design"
            onClick={findMore}
            className="h-8 shrink-0"
          >
            Find more design
          </Button>
        )}
        {board && (
          <button
            type="button"
            aria-pressed={selecting}
            aria-label="Select designs"
            title="Select designs"
            onClick={() =>
              selecting ? stopBoardSelect() : startBoardSelect(board.id)
            }
            className={cn(
              HEADER_CONTROL,
              selecting ? HEADER_CONTROL_ON : HEADER_CONTROL_IDLE,
            )}
          >
            <ListChecksIcon className="size-4" />
          </button>
        )}
        <ThemeSwitch />
      </div>
      <div className="relative min-h-0 flex-1">
        <GridView items={items} hideSave />
        {items.length === 0 && (
          <div className="absolute inset-0 grid place-items-center p-6">
            <div className="flex max-w-sm flex-col items-center gap-1.5 text-center">
              <BookmarkIcon className="size-7 text-muted-foreground" />
              <div className="text-sm font-semibold">This board is empty</div>
              <div className="text-xs text-muted-foreground">
                Open any design and press Save to add it here.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function BrowseArea() {
  const { page, view } = useExplorer();
  if (page === "home") return <HomeCanvas />;
  if (page === "brief") return <BriefPage />;
  // /boards is the index; /boards/<id> is one board, which stays behind a design opened in it.
  if (page === "boards") return boardIdOf(view) ? <BoardArea /> : <BoardsPage />;
  if (view.kind === "board") return <BoardArea />;
  return <ExploreArea />;
}
