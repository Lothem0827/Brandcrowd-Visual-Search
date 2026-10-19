"use client";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { TemplateRepository } from "@/lib/data";
import { applyFilters, EMPTY_FILTERS, mergeSelections, replaceSelections, restoreSelections, type FacetKey, type FacetSelection, type FilterState } from "@/lib/facets";
import { buildVocab, chipsToSelection, isUnsearchableQuery, parseQuery, removeChipFromQuery } from "@/lib/query";
import { createSearchClient, type SearchClient } from "@/lib/search-client";
import { fromUrl, historyAction, toUrl, type Page, type UrlState } from "@/lib/url-state";
import { findAllSimilar, rankByImage } from "@/lib/similarity";
import { rng } from "@/lib/color";
import { SITE_NAME, SITE_TITLE } from "@/lib/site";
import { paletteFromFile } from "@/lib/image-search";
import { toast } from "@/components/ui/toast";
import { useAiInterpretation } from "./use-ai-interpretation";
import { ExplorerContext, type BoardSelection, type BrowseMode, type ExplorerApi, type HoverState, type ImageQuery, type Origin, type SearchStep, type SortMode, type View } from "./context";
import { Sidebar } from "./sidebar";
import { SearchDock } from "./search-dock";
import { BrowseArea } from "./browse-area";
import { FocusedView } from "./focused-view";
import { FilterPanel } from "./filter-panel";
import { DetailPanel } from "./detail-panel";
import { BoardPanel } from "./board-panel";
import { MoodboardPanel } from "./moodboard-panel";
import { useMoodboardPinned } from "./use-moodboards";
import { getMoodboardStore } from "@/lib/moodboards";
import { getBoardStore } from "@/lib/boards";
import { BoardSelectBar } from "./board-select-bar";
import { ImageDropOverlay } from "./image-drop";
import { OfflineBanner } from "./offline-banner";

const IMAGE_RESULTS = 60;
const BROWSE_MODE_KEY = "template-taxonomy:browse:v1";

/** View described by the URL; design ids that aren't in the dataset are dropped. */
function viewFromUrl(u: UrlState, exists: (id: string) => boolean): View {
  const trail = u.design.filter(exists);
  if (trail.length) {
    const origin: Origin = u.board ? { kind: "board", boardId: u.board } : { kind: "search" };
    if (u.focused) return { kind: "focused", id: trail[trail.length - 1], origin };
    return { kind: "similar", trail, origin };
  }
  if (u.board) return { kind: "board", boardId: u.board };
  return { kind: "search" };
}

const searchKey = (query: string, filters: FilterState, imageUrl: string | undefined, category: string) =>
  JSON.stringify([query, filters, imageUrl, category]);

function seededShuffle<T>(list: T[], seed: number): T[] {
  const r = rng(seed);
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function Explorer({ repo, dataUrl, detailsUrl }: { repo: TemplateRepository; dataUrl: string; detailsUrl?: string }) {
  const all = repo.all();
  const categories = useMemo(() => repo.categories(), [repo]);
  const [category] = useState(categories[0] ?? "Instagram Post");
  const base = useMemo(() => all.filter((t) => t.category === category), [all, category]);
  const vocab = useMemo(() => buildVocab(base), [base]);
  // The text index is built in a Web Worker (see search-client.ts), never on the main thread.
  const [searchClient, setSearchClient] = useState<SearchClient | null>(null);
  const baseRef = useRef(base);
  useEffect(() => {
    baseRef.current = base;
  }, [base]);
  useEffect(() => {
    const client = createSearchClient({ dataUrl, detailsUrl, category, getTemplates: () => repo.ensureDetails().then(() => baseRef.current, () => baseRef.current) });
    setSearchClient(client);
    return () => client.dispose();
  }, [dataUrl, detailsUrl, category, repo]);

  // Long-text details (description, copy, hashtags…) load after the tree is up.
  const [detailsReady, setDetailsReady] = useState(() => repo.detailsLoaded());
  const [detailsError, setDetailsError] = useState(false);
  const loadDetails = useCallback(() => {
    setDetailsError(false);
    repo.ensureDetails().then(
      () => setDetailsReady(true),
      () => setDetailsError(true),
    );
  }, [repo]);
  useEffect(() => {
    const id = window.setTimeout(loadDetails, 1500);
    return () => window.clearTimeout(id);
  }, [loadDetails]);
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of base) for (const g of t.tags) m.set(g.toLowerCase(), (m.get(g.toLowerCase()) ?? 0) + 1);
    return m;
  }, [base]);

  // Initial state comes from the URL (/?q=…&design=…, /boards/<id>), see lib/url-state.ts.
  const [initialUrl] = useState(() => fromUrl(window.location.pathname, window.location.search));
  const [query, setQuery] = useState(initialUrl.query);
  const [filters, setFilters] = useState<FilterState>({ facets: initialUrl.facets, color: initialUrl.color });
  const [imageQuery, setImageQuery] = useState<ImageQuery | null>(null);
  const [sort, setSort] = useState<SortMode>(initialUrl.sort);
  const [shuffleSeed, setShuffleSeed] = useState<number | null>(initialUrl.shuffleSeed);
  const [view, setView] = useState<View>(() => viewFromUrl(initialUrl, (id) => !!repo.byId(id)));
  const [page, setPageState] = useState<Page>(() => initialUrl.page);
  const [browseMode, setBrowseMode] = useState<BrowseMode>(() => {
    try {
      const v = window.localStorage.getItem(BROWSE_MODE_KEY);
      if (v === "tree" || v === "grid") return v;
    } catch {
      /* storage unavailable */
    }
    return "grid";
  });
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [simScope, setSimScope] = useState<"industry" | "all">(initialUrl.scope);
  const [detailOpen, setDetailOpen] = useState(() => view.kind === "similar");
  const [hover, setHover] = useState<HoverState | null>(null);
  const [boardSelection, setBoardSelection] = useState<BoardSelection | null>(null);
  const [boardGroup, setBoardGroup] = useState<"layout" | "style">("layout");
  /** Board docked beside Explore — React state so Find-more survives the page switch. */
  const [pinnedBoardId, setPinnedBoardId] = useState<string | null>(null);
  const [searchPath, setSearchPath] = useState<SearchStep[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  /**
   * Every page change goes through here: the URL follows `page`, so a stale view from the
   * previous page (a board, a lightbox, the mind-map) must not leak into the new one. Staying
   * on the same page is a no-op, which lets a board open by setting the view afterwards.
   */
  const setPage = useCallback((next: Page) => {
    if (next === page) return;
    setPageState(next);
    setDetailOpen(false);
    setHover(null);
    // The filter panel belongs to Explore; leaving it must not leave the panel over another page.
    setFilterPanelOpen(false);
    setView((v) => (v.kind === "search" ? v : { kind: "search" }));
  }, [page]);

  useEffect(() => {
    try {
      window.localStorage.setItem(BROWSE_MODE_KEY, browseMode);
    } catch {
      /* storage unavailable */
    }
  }, [browseMode]);

  // Navigation is a history push rather than a Next route change, so the title the route
  // metadata set on load would otherwise stick to every page after it.
  useEffect(() => {
    const title = page === "boards" ? (view.kind === "board" ? "Board" : "Boards") : page === "brief" ? "Moodboard" : null;
    document.title = title ? `${title} | ${SITE_NAME}` : SITE_TITLE;
  }, [page, view]);

  // The search dock debounces typing before it reaches `query`, so no further debounce is needed
  // here — the whole explorer already updates once per typing pause.
  const debouncedQuery = query;
  const parsed = useMemo(() => parseQuery(debouncedQuery, vocab), [debouncedQuery, vocab]);
  const { ai, status: aiStatus, enabled: aiEnabled, dismiss: dismissAi } = useAiInterpretation(
    debouncedQuery,
    category,
    parsed,
  );

  // Text search runs in the worker on the typed words plus any AI keywords. While a newer
  // search is in flight the previous scores stay applied, so the tree doesn't flash back
  // to "all templates". `fallback` holds scores for the typed words alone, used when the
  // AI keywords would otherwise blank out a working result set.
  const aiText = ai?.text ?? "";
  const combinedText = [parsed.text, aiText].filter(Boolean).join(" ").trim();
  const [textHits, setTextHits] = useState<{
    text: string;
    scores: Map<string, number>;
    fallback: Map<string, number> | null;
  } | null>(null);
  useEffect(() => {
    if (!combinedText || !searchClient) return;
    let live = true;
    const fallbackText = aiText && parsed.text ? parsed.text : "";
    Promise.all([
      searchClient.search(combinedText),
      fallbackText ? searchClient.search(fallbackText) : Promise.resolve(null),
    ]).then(
      ([scores, fallback]) => live && setTextHits({ text: combinedText, scores, fallback }),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [combinedText, aiText, parsed.text, searchClient]);
  const liveHits = combinedText ? textHits : null;
  const searching = !!combinedText && textHits?.text !== combinedText;
  const effective = useMemo<FilterState>(
    () => ({
      facets: mergeSelections(
        mergeSelections(filters.facets, chipsToSelection(parsed.chips)),
        ai?.facets ?? {},
      ),
      color: filters.color,
    }),
    [filters, parsed, ai],
  );

  const imageScores = useMemo(() => {
    if (!imageQuery) return null;
    return new Map(rankByImage(imageQuery.palette, imageQuery.features, base).map((r) => [r.template.templateId, r.score]));
  }, [imageQuery, base]);

  // Text-relevance scores for the current free-text query, used to order tree branches.
  const textScores = useMemo(() => (liveHits ? liveHits.scores : null), [liveHits]);

  // Emoji/CJK-only queries used to be silently ignored (all 7,000 shown); now they match nothing
  // and the empty state explains why.
  const unsearchable = useMemo(() => isUnsearchableQuery(debouncedQuery), [debouncedQuery]);

  const facetActive = Object.values(effective.facets).some((v) => v?.length);
  const hasSearch = !!query.trim() || facetActive || !!effective.color || !!imageQuery || !!parsed.text;

  const results = useMemo(() => {
    if (unsearchable) return [];
    let list = applyFilters(base, effective);
    if (liveHits) {
      const rank = (scores: Map<string, number>) =>
        list.filter((t) => scores.has(t.templateId)).sort((a, b) => scores.get(b.templateId)! - scores.get(a.templateId)!);
      let next = rank(liveHits.scores);
      // AI keywords are a guess: never let them blank out an otherwise working set
      if (!next.length && aiText) next = liveHits.fallback ? rank(liveHits.fallback) : parsed.text ? next : list;
      list = next;
    }
    if (imageScores) {
      list = [...list].sort((a, b) => imageScores.get(b.templateId)! - imageScores.get(a.templateId)!).slice(0, IMAGE_RESULTS);
    }
    if (sort === "shuffle" && shuffleSeed !== null) list = seededShuffle(list, shuffleSeed);
    return list;
  }, [base, effective, liveHits, aiText, parsed.text, imageScores, sort, shuffleSeed, unsearchable]);

  // A free-text query that found nothing (and wasn't just filters narrowing the set)
  // is a "no close match", distinct from "remove a chip / clear the filters".
  const filtered = !!effective.color || facetActive;
  const noCloseMatch = !!combinedText && !unsearchable && results.length === 0 && !filtered;

  // The browse list trails the input/chips by a frame so a commit never stalls typing.
  const browseItems = useDeferredValue(results);

  const byId = useCallback((id: string) => repo.byId(id), [repo]);
  const focused = view.kind === "focused" ? byId(view.id) ?? null : null;
  const center = view.kind === "similar" ? byId(view.trail[view.trail.length - 1]) ?? null : null;
  const detailTemplate = focused ?? center;
  const similar = useMemo(() => {
    if (!detailTemplate) return null;
    const pool = simScope === "industry" ? base.filter((t) => t.industry === detailTemplate.industry) : base;
    return findAllSimilar(detailTemplate, pool, 6);
  }, [detailTemplate, simScope, base]);

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
  // Canvas "search within": narrow the search and remember the step so it can be undone.
  // Each step *replaces* the facet values of the group being entered (a group is a
  // specific subset, not a union), so drilling into merged "Other (more)" groups still
  // narrows the tree. A click that would change nothing is skipped so the breadcrumb
  // doesn't gain a duplicate crumb.
  const searchWithin = useCallback(
    ({ label, facets }: { label: string; facets: FacetSelection }) => {
      const prev: FacetSelection = {};
      let changed = false;
      for (const k of Object.keys(facets) as FacetKey[]) {
        const cur = filters.facets[k] ?? [];
        if (cur.length) prev[k] = cur;
        const next = facets[k] ?? [];
        if (cur.length !== next.length || !next.every((v) => cur.includes(v))) {
          changed = true;
        }
      }
      if (!changed) return;
      setFilters((f) => ({ ...f, facets: replaceSelections(f.facets, facets) }));
      setSearchPath((p) => [
        ...p,
        {
          id: `${p.length}:${label}`,
          label,
          facets,
          prev: Object.keys(prev).length ? prev : undefined,
        },
      ]);
    },
    [filters.facets],
  );
  // Undo `steps` (the ones being removed), restoring the values each step replaced.
  // Steps are undone newest-first so a facet narrowed repeatedly is restored in order.
  const dropSteps = useCallback((steps: SearchStep[]) => {
    setFilters((f) =>
      [...steps].reverse().reduce((acc, s) => restoreSelections(acc, s), f),
    );
  }, []);
  const backOneStep = useCallback(() => {
    if (!searchPath.length) return;
    dropSteps([searchPath[searchPath.length - 1]]);
    setSearchPath(searchPath.slice(0, -1));
  }, [searchPath, dropSteps]);
  const jumpToStep = useCallback(
    (index: number) => {
      dropSteps(searchPath.slice(index + 1));
      setSearchPath(searchPath.slice(0, index + 1));
    },
    [searchPath, dropSteps],
  );
  const clearAll = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setQuery("");
    setImageQuery(null);
    setSearchPath([]);
  }, []);

  // Image search: one analysis at a time from the UI's point of view; a newer file always
  // wins over a slower, older one (token), and leftover text/filters are cleared so results
  // aren't silently narrowed (with a Restore action).
  const [imageBusy, setImageBusy] = useState(false);
  const imageToken = useRef(0);
  const latest = useRef({ query, filters });
  useEffect(() => {
    latest.current = { query, filters };
  }, [query, filters]);
  const searchByImage = useCallback(async (file: File) => {
    const token = ++imageToken.current;
    setImageBusy(true);
    const toastId = "image-search";
    toast.loading("Reading image colors…", { id: toastId, description: undefined, action: undefined });
    try {
      const res = await paletteFromFile(file);
      if (token !== imageToken.current) return; // a newer image was dropped meanwhile
      if (!res.ok) {
        toast.error(res.message, { id: toastId, description: undefined, action: undefined });
        return;
      }
      const prev = latest.current;
      const hadSearch =
        !!prev.query.trim() || !!prev.filters.color || Object.values(prev.filters.facets).some((v) => v?.length);
      setQuery("");
      setFilters(EMPTY_FILTERS);
      setSearchPath([]);
      setPage("explore");
      setView({ kind: "search" });
      setImageQuery({ url: res.thumbUrl, palette: res.palette, features: res.features, name: file.name });
      toast.success("Searching by image colors", {
        id: toastId,
        description: hadSearch ? "Your previous search and filters were cleared." : undefined,
        action: hadSearch
          ? {
              label: "Restore",
              onClick: () => {
                setQuery(prev.query);
                setFilters(prev.filters);
              },
            }
          : undefined,
      });
    } catch {
      if (token === imageToken.current) {
        toast.error("Couldn't read that image.", { id: toastId, description: undefined, action: undefined });
      }
    } finally {
      if (token === imageToken.current) setImageBusy(false);
    }
  }, [setPage]);

  /** Grid/Home click: open the focused lightbox, remembering where we came from. */
  const openTemplate = useCallback((id: string) => {
    setHover(null);
    setDetailOpen(false);
    setView((v) => {
      const origin: Origin =
        v.kind === "board"
          ? { kind: "board", boardId: v.boardId }
          : v.kind === "focused" || v.kind === "similar"
            ? v.origin
            : { kind: "search" };
      if (v.kind === "focused" && v.id === id) return v;
      return { kind: "focused", id, origin };
    });
  }, []);

  /** Tree/board click: open the similar mind-map (keeps the four similarity buckets). */
  const openSimilar = useCallback((id: string) => {
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

  /** Clicking a related image inside the lightbox re-centers it without a new history entry. */
  const recenter = useCallback((id: string) => {
    setDetailOpen(false);
    setView((v) => (v.kind === "focused" ? { ...v, id } : v));
  }, []);

  /** Clicking a thumbnail inside the detail panel re-centers it, keeping the panel open. */
  const recenterDetail = useCallback((id: string) => {
    setView((v) => {
      if (v.kind === "focused") return { ...v, id };
      if (v.kind === "similar")
        return { ...v, trail: v.trail.length ? [...v.trail.slice(0, -1), id] : [id] };
      return v;
    });
  }, []);

  /** Board multi-select: a sticky mode inside one board, cleared whenever the board changes. */
  const startBoardSelect = useCallback((boardId: string) => {
    setBoardSelection({ boardId, ids: [] });
  }, []);
  const stopBoardSelect = useCallback(() => setBoardSelection(null), []);
  const toggleBoardSelect = useCallback((id: string) => {
    setBoardSelection((sel) => {
      if (!sel) return sel;
      const ids = sel.ids.includes(id) ? sel.ids.filter((x) => x !== id) : [...sel.ids, id];
      return { ...sel, ids };
    });
  }, []);

  // Leaving the board (or switching to the mind-map or the Boards page) ends selection. Reset
  // during render — the same derived-state pattern ThumbImage uses for a src change — so the
  // toolbar can never paint a selection that belongs to a board that's no longer on screen.
  const selectionLive =
    !!boardSelection &&
    view.kind === "board" &&
    view.boardId === boardSelection.boardId &&
    browseMode === "grid";
  if (boardSelection && !selectionLive) setBoardSelection(null);
  const activeBoardSelection = selectionLive ? boardSelection : null;

  // when the filters/search change while exploring a design, go back to the browse view
  const lastSearchKey = useRef("");
  useEffect(() => {
    const key = searchKey(query, filters, imageQuery?.url, category);
    if (lastSearchKey.current && key !== lastSearchKey.current) {
      setView((v) => (v.kind === "search" ? v : { kind: "search" }));
    }
    lastSearchKey.current = key;
  }, [query, filters, imageQuery, category]);

  // a new query or image is a fresh search: drop the drill-down history (filters are set elsewhere)
  const lastPathKey = useRef("");
  useEffect(() => {
    const key = JSON.stringify([query, imageQuery?.url]);
    if (lastPathKey.current && key !== lastPathKey.current) setSearchPath([]);
    lastPathKey.current = key;
  }, [query, imageQuery?.url]);

  // ---- URL sync: state -> URL (push for discrete changes, replace while typing) ----
  const urlState = useMemo<UrlState>(
    () => ({
      page,
      query,
      facets: filters.facets,
      color: filters.color,
      design: view.kind === "focused" ? [view.id] : view.kind === "similar" ? view.trail : [],
      focused: view.kind === "focused",
      board:
        view.kind === "board"
          ? view.boardId
          : view.kind === "focused" || view.kind === "similar"
            ? view.origin.kind === "board"
              ? view.origin.boardId
              : null
            : null,
      scope: simScope,
      sort,
      shuffleSeed,
    }),
    [page, query, filters, view, simScope, sort, shuffleSeed],
  );
  const lastUrl = useRef<UrlState | null>(null);
  const typingRun = useRef(false);
  useEffect(() => {
    const url = (s: UrlState) => toUrl(s) + window.location.hash;
    if (!lastUrl.current) {
      // first render: normalise the address (drop unknown design ids, move old links to their
      // route) without adding a history entry
      lastUrl.current = urlState;
      if (window.location.pathname + window.location.search !== toUrl(urlState)) {
        window.history.replaceState(null, "", url(urlState));
      }
      return;
    }
    const { action, typing } = historyAction(lastUrl.current, urlState, typingRun.current);
    typingRun.current = typing;
    lastUrl.current = urlState;
    if (action === "push") window.history.pushState(null, "", url(urlState));
    else if (action === "replace") window.history.replaceState(null, "", url(urlState));
  }, [urlState]);

  // ---- URL -> state on Back/Forward ----
  const imageUrlRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    imageUrlRef.current = imageQuery?.url;
  }, [imageQuery]);
  useEffect(() => {
    const onPop = () => {
      const u = fromUrl(window.location.pathname, window.location.search);
      const nextFilters: FilterState = { facets: u.facets, color: u.color };
      const nextView = viewFromUrl(u, (id) => !!byId(id));
      lastUrl.current = u;
      typingRun.current = false;
      // restoring a design view together with a different query must not bounce back to the tree
      lastSearchKey.current = searchKey(u.query, nextFilters, imageUrlRef.current, category);
      setQuery(u.query);
      setFilters(nextFilters);
      setView(nextView);
      // raw setter: the URL already decided the page, so no view normalising here
      setPageState(u.page);
      setSimScope(u.scope);
      setSort(u.sort);
      setShuffleSeed(u.shuffleSeed);
      setSearchPath([]);
      setHover(null);
      setDetailOpen(nextView.kind === "similar");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [byId, category]);

  const focusSearch = useCallback(() => searchRef.current?.focus(), []);

  /** Home nav: the browse page, keeping the current search. */
  const goBrowse = useCallback(() => {
    setPage("explore");
  }, [setPage]);

  const pinBoard = useCallback((boardId: string) => {
    getMoodboardStore().unpin();
    getBoardStore().pin(boardId);
    getBoardStore().setLastUsedBoard(boardId);
    setPinnedBoardId(boardId);
  }, []);

  const unpinBoard = useCallback(() => {
    getBoardStore().unpin();
    setPinnedBoardId(null);
  }, []);

  const moodboardPinned = useMoodboardPinned();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === "Escape" && !typing) {
        if (document.querySelector("[data-slot=dialog-content], [role=menu], [data-slot=popover-content]")) return;
        if (activeBoardSelection) stopBoardSelect();
        else if (pinnedBoardId && page === "explore") {
          const id = pinnedBoardId;
          unpinBoard();
          setPage("boards");
          setView({ kind: "board", boardId: id });
        } else if (detailOpen) setDetailOpen(false);
        else if (filterPanelOpen) setFilterPanelOpen(false);
        // Escape leaves one level: a board goes back to the Boards index (/boards), the
        // index and the Moodboard go back to Home (/).
        else if (page === "boards" && (view.kind === "board" || view.kind === "focused" || view.kind === "similar")) {
          setView({ kind: "search" });
        } else if (page === "boards" || page === "brief") setPage("explore");
        else setHover(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeBoardSelection, stopBoardSelect, detailOpen, filterPanelOpen, page, view, setPage, pinnedBoardId, unpinBoard, setView]);

  const api: ExplorerApi = {
    all, base, results, browseItems, byId, vocab, tagCounts, category,
    query, setQuery, parsed, searching, unsearchable, noCloseMatch, hasSearch, filters, setFilters, effective, toggleFacet, addFacet, clearAll,
    ai, aiStatus, aiEnabled, dismissAi,
    searchPath, searchWithin, backOneStep, jumpToStep,
    imageQuery, setImageQuery, imageScores, textScores, imageBusy, searchByImage,
    page, setPage, browseMode, setBrowseMode, sort, setSort, shuffleSeed, setShuffleSeed,
    filterPanelOpen, setFilterPanelOpen,
    view, setView, openTemplate, openSimilar, recenter, recenterDetail, focused, simScope, setSimScope, similar, center,
    detailsReady, detailsError, loadDetails,
    detailOpen, setDetailOpen, hover, setHover, boardGroup, setBoardGroup, focusSearch,
    boardSelection: activeBoardSelection, startBoardSelect, stopBoardSelect, toggleBoardSelect,
    pinnedBoardId, pinBoard, unpinBoard,
  };

  return (
    <ExplorerContext.Provider value={api}>
      <div className="flex h-full overflow-hidden bg-background text-foreground">
        {/* Keyboard users reach the search before the hundreds of grid/tree buttons. */}
        <a
          href="#template-search"
          onClick={(e) => {
            e.preventDefault();
            searchRef.current?.focus();
          }}
          className="sr-only z-[70] rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background focus:not-sr-only focus:absolute focus:top-3 focus:left-3"
        >
          Skip to search
        </a>
        <h1 className="sr-only">Template Taxonomy: explore design.com Instagram post templates</h1>
        <Sidebar onBrowse={goBrowse} />
        <div className="relative flex min-w-0 flex-1 flex-col">
          <main className="relative flex-1 overflow-hidden" aria-label="Template browser">
            <BrowseArea />
            {focused && <FocusedView />}
          </main>
          {/* The board selection toolbar belongs to whichever page shows the board grid;
              the search dock only makes sense on Home. */}
          {activeBoardSelection ? (
            <BoardSelectBar />
          ) : page === "explore" ? (
            <SearchDock inputRef={searchRef} />
          ) : null}
        </div>
        <FilterPanel />
        {pinnedBoardId && page === "explore" ? (
          <BoardPanel />
        ) : moodboardPinned && page === "explore" ? (
          <MoodboardPanel />
        ) : (
          detailTemplate && <DetailPanel template={detailTemplate} />
        )}
      </div>
      <ImageDropOverlay />
      <OfflineBanner />
    </ExplorerContext.Provider>
  );
}
