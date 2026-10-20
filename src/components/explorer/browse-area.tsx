"use client";
import { useMemo } from "react";
import {
  BookmarkIcon,
  CompassIcon,
  ListChecksIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  TagIcon,
  XIcon,
} from "lucide-react";
import { activeFilterCount, sentenceCase, type FacetKey } from "@/lib/facets";
import { relatedChips } from "@/lib/query";
import type { Template } from "@/lib/schema";
import { useIsCompact } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BackButton } from "./back-button";
import { BoardMenu } from "./board-menu";
import { BoardsPage } from "./boards-page";
import { PublicBoardArea, PublicMoodboardArea } from "./public-item-area";
import { PublicProfilePage } from "./public-profile-page";
import { DesignerRow } from "./designer-row";
import { BriefPage } from "./brief-page";
import { HeaderDetectedChips } from "./chips";
import { useExplorer, type View } from "./context";
import {
  HEADER_CONTROL,
  HEADER_CONTROL_IDLE,
  HEADER_CONTROL_ON,
  HEADER_INSET,
  HEADER_ROW,
  HEADER_TITLE,
} from "./header";
import { GridView } from "./grid-view";
import { HomeCanvas } from "./home-canvas";
import { ThemeSwitch } from "./theme-switch";
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

function FilterToggle() {
  const { effective, filterPanelOpen, setFilterPanelOpen } = useExplorer();
  const active = activeFilterCount(effective) + (effective.color ? 1 : 0);
  return (
    <button
      type="button"
      aria-pressed={filterPanelOpen}
      aria-label="Filters"
      title="Filters"
      data-onboarding="filter"
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
  const isCompact = useIsCompact();
  const q = query.trim();
  const lead = isCompact ? "Results for" : "Showing results for";
  return (
    <div className="flex min-w-0 shrink items-center gap-2">
      <h2 className="truncate text-xl text-muted-foreground">
        {imageQuery ? (
          `${lead} your image`
        ) : q ? (
          <>
            {lead}{" "}
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

/** Result count (or "Searching…") for the header row. Hidden on tablet + phone. */
function ResultCount() {
  const { results, searching } = useExplorer();
  return (
    <span
      className="shrink-0 text-xs text-muted-foreground tabular-nums max-lg:hidden"
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
  const isCompact = useIsCompact();
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
          {!isCompact && <ThemeSwitch />}
        </div>
        {hasSearch ? <RelatedChips /> : <PopularTags />}
        {!hasSearch ? <DesignerRow /> : null}
      </div>
      <div className="relative min-h-0 flex-1">
        <GridView items={browseItems} thumbs markDropTarget />
        {browseItems.length === 0 && <EmptyState />}
      </div>
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
  const templateIds = board?.templateIds;
  const items = useMemo(
    () => (templateIds ?? []).map((id) => byId(id)).filter((t): t is Template => !!t),
    [templateIds, byId],
  );
  const selecting = !!boardSelection;
  const isCompact = useIsCompact();

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
          <h2 className={cn(HEADER_TITLE, "min-w-0 flex-1")}>{board.name}</h2>
        ) : (
          <h2 className={cn(HEADER_TITLE, "flex-1")}>Board</h2>
        )}
        {board ? (
          <BoardMenu
            board={board}
            onDeleted={() => {
              setView({ kind: "search" });
              setPage("boards");
            }}
          />
        ) : null}
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
        {!isCompact && <ThemeSwitch />}
      </div>
      <div className="relative min-h-0 flex-1">
        <GridView items={items} hideSave overscan={1} eagerRows={1} thumbs />
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
  const { page, view, profileKind } = useExplorer();
  if (page === "home") return <HomeCanvas />;
  if (page === "brief") return <BriefPage />;
  if (page === "profile") {
    if (profileKind === "board") return <PublicBoardArea />;
    if (profileKind === "moodboard") return <PublicMoodboardArea />;
    return <PublicProfilePage />;
  }
  // /boards is the index; /boards/<id> is one board, which stays behind a design opened in it.
  if (page === "boards") return boardIdOf(view) ? <BoardArea /> : <BoardsPage />;
  if (view.kind === "board") return <BoardArea />;
  return <ExploreArea />;
}
