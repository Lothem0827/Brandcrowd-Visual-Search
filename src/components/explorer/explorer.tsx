"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { templateRepository } from "@/lib/data";
import { applyFilters, EMPTY_FILTERS, mergeSelections, type FacetKey, type FilterState } from "@/lib/facets";
import { buildVocab, chipsToSelection, parseQuery, removeChipFromQuery } from "@/lib/query";
import { buildSearchIndex } from "@/lib/search";
import { findAllSimilar, rankByPalette } from "@/lib/similarity";
import { rng } from "@/lib/color";
import { ExplorerContext, type ExplorerApi, type HoverState, type ImageQuery, type View } from "./context";
import { TopBar } from "./top-bar";
import { SearchDock } from "./search-dock";
import { TreeCanvas } from "./tree-canvas";
import { DetailPanel } from "./detail-panel";
import { BoardsPanel } from "./boards-panel";
import { ImageDropOverlay } from "./image-drop";

const IMAGE_RESULTS = 36;

function seededShuffle<T>(list: T[], seed: number): T[] {
  const r = rng(seed);
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function Explorer() {
  const all = templateRepository.all();
  const categories = useMemo(() => templateRepository.categories(), []);
  const [category] = useState(categories[0] ?? "Instagram Post");
  const base = useMemo(() => all.filter((t) => t.category === category), [all, category]);
  const vocab = useMemo(() => buildVocab(base), [base]);
  const index = useMemo(() => buildSearchIndex(base), [base]);
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of base) for (const g of t.tags) m.set(g.toLowerCase(), (m.get(g.toLowerCase()) ?? 0) + 1);
    return m;
  }, [base]);

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [imageQuery, setImageQuery] = useState<ImageQuery | null>(null);
  const [shuffleSeed, setShuffleSeed] = useState<number | null>(null);
  const [view, setView] = useState<View>({ kind: "search" });
  const [simScope, setSimScope] = useState<"industry" | "all">("industry");
  const [detailOpen, setDetailOpen] = useState(false);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [boardsOpen, setBoardsOpen] = useState(false);
  const [boardGroup, setBoardGroup] = useState<"layout" | "style">("layout");
  const searchRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => parseQuery(query, vocab), [query, vocab]);
  const effective = useMemo<FilterState>(
    () => ({ facets: mergeSelections(filters.facets, chipsToSelection(parsed.chips)), color: filters.color }),
    [filters, parsed],
  );

  const imageScores = useMemo(() => {
    if (!imageQuery) return null;
    return new Map(rankByPalette(imageQuery.palette, base).map((r) => [r.template.templateId, r.score]));
  }, [imageQuery, base]);

  const results = useMemo(() => {
    let list = applyFilters(base, effective);
    if (parsed.text) {
      const scores = index.search(parsed.text);
      list = list.filter((t) => scores.has(t.templateId)).sort((a, b) => scores.get(b.templateId)! - scores.get(a.templateId)!);
    }
    if (imageScores) {
      list = [...list].sort((a, b) => imageScores.get(b.templateId)! - imageScores.get(a.templateId)!).slice(0, IMAGE_RESULTS);
    }
    if (shuffleSeed !== null) list = seededShuffle(list, shuffleSeed);
    return list;
  }, [base, effective, parsed.text, index, imageScores, shuffleSeed]);

  const byId = useCallback((id: string) => templateRepository.byId(id), []);
  const center = view.kind === "similar" ? byId(view.trail[view.trail.length - 1]) ?? null : null;
  const similar = useMemo(() => {
    if (!center) return null;
    const pool = simScope === "industry" ? base.filter((t) => t.industry === center.industry) : base;
    return findAllSimilar(center, pool, 6);
  }, [center, simScope, base]);

  const toggleFacet = useCallback(
    (k: FacetKey, v: string) => {
      // a chip detected from the query is removed by editing the query
      const fromQuery = parsed.chips.find((c) => c.facet === k && c.value === v);
      if (fromQuery) {
        setQuery((q) => removeChipFromQuery(q, fromQuery));
        return;
      }
      setFilters((f) => {
        const cur = f.facets[k] ?? [];
        const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
        return { ...f, facets: { ...f.facets, [k]: next } };
      });
    },
    [parsed.chips],
  );
  const addFacet = useCallback((k: FacetKey, v: string) => {
    setFilters((f) => {
      const cur = f.facets[k] ?? [];
      if (cur.includes(v)) return f;
      return { ...f, facets: { ...f.facets, [k]: [...cur, v] } };
    });
  }, []);
  const clearAll = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setQuery("");
    setImageQuery(null);
  }, []);

  const openTemplate = useCallback((id: string) => {
    setHover(null);
    setDetailOpen(true);
    setView((v) => {
      if (v.kind === "similar") {
        if (v.trail[v.trail.length - 1] === id) return v;
        return { ...v, trail: [...v.trail, id] };
      }
      return { kind: "similar", trail: [id], origin: v.kind === "board" ? { kind: "board", boardId: v.boardId } : { kind: "search" } };
    });
  }, []);

  // when the filters/search change while exploring similar, go back to the search tree
  const lastSearchKey = useRef("");
  useEffect(() => {
    const key = JSON.stringify([query, filters, imageQuery?.url, category]);
    if (lastSearchKey.current && key !== lastSearchKey.current) {
      setView((v) => (v.kind === "search" ? v : { kind: "search" }));
    }
    lastSearchKey.current = key;
  }, [query, filters, imageQuery, category]);

  const focusSearch = useCallback(() => searchRef.current?.focus(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === "Escape" && !typing) {
        if (document.querySelector("[data-slot=sheet-content], [role=menu], [data-slot=popover-content]")) return;
        if (detailOpen) setDetailOpen(false);
        else setHover(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailOpen]);

  const api: ExplorerApi = {
    all, base, results, byId, vocab, tagCounts, category,
    query, setQuery, parsed, filters, setFilters, effective, toggleFacet, addFacet, clearAll,
    imageQuery, setImageQuery, imageScores, shuffleSeed, setShuffleSeed,
    view, setView, openTemplate, simScope, setSimScope, similar, center,
    detailOpen, setDetailOpen, hover, setHover, boardsOpen, setBoardsOpen, boardGroup, setBoardGroup, focusSearch,
  };

  return (
    <ExplorerContext.Provider value={api}>
      <div className="relative h-full overflow-hidden bg-background text-foreground">
        <main className="absolute inset-0" aria-label="Template tree">
          <TreeCanvas />
        </main>
        <TopBar />
        <SearchDock inputRef={searchRef} />
        {center && detailOpen && <DetailPanel template={center} />}
        <BoardsPanel />
        <ImageDropOverlay />
      </div>
    </ExplorerContext.Provider>
  );
}
