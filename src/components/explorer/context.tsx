"use client";
import { createContext, useContext } from "react";
import type { Template } from "@/lib/schema";
import type { FacetKey, FilterState } from "@/lib/facets";
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
  filters: FilterState;
  setFilters: (f: FilterState | ((f: FilterState) => FilterState)) => void;
  effective: FilterState;
  toggleFacet: (k: FacetKey, v: string) => void;
  addFacet: (k: FacetKey, v: string) => void;
  clearAll: () => void;
  imageQuery: ImageQuery | null;
  setImageQuery: (q: ImageQuery | null) => void;
  imageScores: Map<string, number> | null;
  shuffleSeed: number | null;
  setShuffleSeed: (s: number | null) => void;
  view: View;
  setView: (v: View) => void;
  openTemplate: (id: string) => void;
  simScope: "industry" | "all";
  setSimScope: (s: "industry" | "all") => void;
  similar: Record<SimilarKind, SimilarHit[]> | null;
  center: Template | null;
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
