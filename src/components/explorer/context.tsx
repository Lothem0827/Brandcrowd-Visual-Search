"use client";
import { createContext, useContext } from "react";
import type { Template } from "@/lib/schema";
import type { FacetKey, FacetSelection, FilterState } from "@/lib/facets";
import type { ParsedQuery, VocabTerm } from "@/lib/query";
import type { SimilarHit, SimilarKind } from "@/lib/similarity";
import type { RoleColor } from "@/lib/color";

export type View =
  | { kind: "search" }
  | { kind: "similar"; trail: string[]; origin: { kind: "search" } | { kind: "board"; boardId: string } }
  | { kind: "board"; boardId: string };

export interface HoverState {
  template: Template;
  rect: DOMRect;
  note?: string;
}

export interface ImageQuery {
  url: string;
  palette: RoleColor[];
  name: string;
}

/** One canvas "search within" drill-down, tracked so it can be stepped back. */
export interface SearchStep {
  id: string;
  /** crumb text, e.g. "Construction · Centered stack" */
  label: string;
  /** facets this step added to the search */
  facets: FacetSelection;
}

export interface ExplorerApi {
  all: Template[];
  base: Template[];
  results: Template[];
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
  /** an uploaded image is being analysed */
  imageBusy: boolean;
  /** validate + analyse an image and search by its colors (newest file wins) */
  searchByImage: (file: File) => Promise<void>;
  shuffleSeed: number | null;
  setShuffleSeed: (s: number | null) => void;
  view: View;
  setView: (v: View) => void;
  openTemplate: (id: string) => void;
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
  boardsOpen: boolean;
  setBoardsOpen: (o: boolean) => void;
  boardGroup: "layout" | "style";
  setBoardGroup: (g: "layout" | "style") => void;
  focusSearch: () => void;
}

export const ExplorerContext = createContext<ExplorerApi | null>(null);

export function useExplorer() {
  const v = useContext(ExplorerContext);
  if (!v) throw new Error("useExplorer outside provider");
  return v;
}
