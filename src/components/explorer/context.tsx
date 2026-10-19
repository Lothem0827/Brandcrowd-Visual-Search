"use client";
import { createContext, useContext } from "react";
import type { Template } from "@/lib/schema";
import type { FacetKey, FacetSelection, FilterState } from "@/lib/facets";
import type { ParsedQuery, VocabTerm } from "@/lib/query";
import type { SimilarHit, SimilarKind } from "@/lib/similarity";
import type { AiInterpretation } from "@/lib/llm";
import type { RoleColor } from "@/lib/color";
import type { ImageFeatures } from "@/lib/image-features";
import type { Page } from "@/lib/url-state";

/** Which top-level page the sidebar has selected (defined with the URL state it mirrors). */
export type { Page } from "@/lib/url-state";
/** Grid vs mind-map for the Explore browse area. */
export type BrowseMode = "grid" | "tree";
/** Result ordering. */
export type SortMode = "relevance" | "shuffle";

/** Where an opened design / drill-down started, so Back can return there. */
export type Origin = { kind: "search" } | { kind: "board"; boardId: string };

export type View =
  | { kind: "search" }
  /** focused lightbox (grid click) with flat related results */
  | { kind: "focused"; id: string; origin: Origin }
  /** similar mind-map (tree click) with four similarity buckets */
  | { kind: "similar"; trail: string[]; origin: Origin }
  | { kind: "board"; boardId: string };

export interface HoverState {
  template: Template;
  rect: DOMRect;
  note?: string;
}

export interface ImageQuery {
  url: string;
  palette: RoleColor[];
  features: ImageFeatures;
  name: string;
}

/** Active multi-select inside a board: the board it's on plus the chosen design ids. */
export interface BoardSelection {
  boardId: string;
  ids: string[];
}

/** One canvas "search within" drill-down, tracked so it can be stepped back. */
export interface SearchStep {
  id: string;
  /** crumb text, e.g. "Construction · Centered stack" */
  label: string;
  /** facets this step added to the search */
  facets: FacetSelection;
  /** per-facet values this step replaced, so undo can restore them */
  prev?: FacetSelection;
}

export interface ExplorerApi {
  all: Template[];
  base: Template[];
  results: Template[];
  /**
   * `results`, deferred so the heavy grid/tree list can lag a frame behind the input and chips
   * (used only by the browse area). `results` itself stays urgent for counts and empty states.
   */
  browseItems: Template[];
  byId: (id: string) => Template | undefined;
  vocab: VocabTerm[];
  tagCounts: Map<string, number>;
  category: string;
  query: string;
  setQuery: (q: string) => void;
  parsed: ParsedQuery;
  /** true while a typed query is debouncing or its text search is still running */
  searching: boolean;
  /** the query has text but nothing the search understands (emoji, non-Latin scripts) */
  unsearchable: boolean;
  /** a text query returned no close match (vs. filters narrowing to nothing) */
  noCloseMatch: boolean;
  /** true when any query, facet, colour or image search is active */
  hasSearch: boolean;
  /** LLM reading of the vague part of the query (null when not needed/available) */
  ai: AiInterpretation | null;
  aiStatus: "idle" | "loading" | "ready";
  aiEnabled: boolean;
  dismissAi: (facet?: FacetKey, value?: string) => void;
  filters: FilterState;
  setFilters: (f: FilterState | ((f: FilterState) => FilterState)) => void;
  effective: FilterState;
  toggleFacet: (k: FacetKey, v: string) => void;
  addFacet: (k: FacetKey, v: string) => void;
  clearAll: () => void;
  /** drill-down history created by canvas "search within" actions */
  searchPath: SearchStep[];
  searchWithin: (step: { label: string; facets: FacetSelection }) => void;
  backOneStep: () => void;
  /** jump to a step by index; -1 resets to the root search */
  jumpToStep: (index: number) => void;
  imageQuery: ImageQuery | null;
  setImageQuery: (q: ImageQuery | null) => void;
  imageScores: Map<string, number> | null;
  /** id -> text-relevance score for the current free-text query (null when no text) */
  textScores: Map<string, number> | null;
  /** an uploaded image is being analysed */
  imageBusy: boolean;
  /** validate + analyse an image and search by its colors + look */
  searchByImage: (file: File) => Promise<void>;
  page: Page;
  setPage: (p: Page) => void;
  browseMode: BrowseMode;
  setBrowseMode: (m: BrowseMode) => void;
  sort: SortMode;
  setSort: (s: SortMode) => void;
  shuffleSeed: number | null;
  setShuffleSeed: (s: number | null) => void;
  /** side filter panel (Style / Color / Layout / Image / More / Sort) visibility */
  filterPanelOpen: boolean;
  setFilterPanelOpen: (o: boolean) => void;
  view: View;
  setView: (v: View) => void;
  /** open a design from the grid/Home (focused lightbox) */
  openTemplate: (id: string) => void;
  /** open a design from the tree/board (similar mind-map) */
  openSimilar: (id: string) => void;
  /** re-center the focused lightbox on a related design (no new history entry) */
  recenter: (id: string) => void;
  /** re-center the detail panel (and mind-map) on a related design, keeping the panel open */
  recenterDetail: (id: string) => void;
  /** the template shown in the focused lightbox, if any */
  focused: Template | null;
  simScope: "industry" | "all";
  setSimScope: (s: "industry" | "all") => void;
  similar: Record<SimilarKind, SimilarHit[]> | null;
  center: Template | null;
  /** long-text template details (description, copy lines…) have been loaded */
  detailsReady: boolean;
  detailsError: boolean;
  loadDetails: () => void;
  detailOpen: boolean;
  setDetailOpen: (o: boolean) => void;
  hover: HoverState | null;
  setHover: (h: HoverState | null) => void;
  boardGroup: "layout" | "style";
  setBoardGroup: (g: "layout" | "style") => void;
  /** active multi-select inside a board (null when not selecting) */
  boardSelection: BoardSelection | null;
  startBoardSelect: (boardId: string) => void;
  stopBoardSelect: () => void;
  toggleBoardSelect: (id: string) => void;
  focusSearch: () => void;
}

export const ExplorerContext = createContext<ExplorerApi | null>(null);

export function useExplorer() {
  const v = useContext(ExplorerContext);
  if (!v) throw new Error("useExplorer outside provider");
  return v;
}
