"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TemplateRepository } from "@/lib/data";
import { applyFilters, EMPTY_FILTERS, mergeSelections, removeSelections, type FacetKey, type FacetSelection, type FilterState } from "@/lib/facets";
import { buildVocab, chipsToSelection, isUnsearchableQuery, parseQuery, removeChipFromQuery } from "@/lib/query";
import { createSearchClient, type SearchClient } from "@/lib/search-client";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { fromSearch, historyAction, toSearch, type UrlState } from "@/lib/url-state";
import { findAllSimilar, rankByPalette } from "@/lib/similarity";
import { rng } from "@/lib/color";
import { paletteFromFile } from "@/lib/image-search";
import { toast } from "sonner";
import { useAiInterpretation } from "./use-ai-interpretation";
import { ExplorerContext, type ExplorerApi, type HoverState, type ImageQuery, type SearchStep, type View } from "./context";
import { TopBar } from "./top-bar";
import { SearchDock } from "./search-dock";
import { TreeCanvas } from "./tree-canvas";
import { DetailPanel } from "./detail-panel";
import { BoardsPanel } from "./boards-panel";
import { ImageDropOverlay } from "./image-drop";
import { OfflineBanner } from "./offline-banner";

const IMAGE_RESULTS = 36;
/** Typing is debounced so the 7,000-record filter + tree layout runs once per pause, not per key. */
const QUERY_DEBOUNCE_MS = 180;

/** View described by the URL; design ids that aren't in the dataset are dropped. */
function viewFromUrl(u: UrlState, exists: (id: string) => boolean): View {
  const trail = u.design.filter(exists);
  if (trail.length) {
    return { kind: "similar", trail, origin: u.board ? { kind: "board", boardId: u.board } : { kind: "search" } };
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

  // Initial state comes from the URL (?q=…&industry=…&design=…), see lib/url-state.ts.
  const [initialUrl] = useState(() => fromSearch(window.location.search));
  const [query, setQuery] = useState(initialUrl.query);
  const [filters, setFilters] = useState<FilterState>({ facets: initialUrl.facets, color: initialUrl.color });
  const [imageQuery, setImageQuery] = useState<ImageQuery | null>(null);
  const [shuffleSeed, setShuffleSeed] = useState<number | null>(initialUrl.shuffle);
  const [view, setView] = useState<View>(() => viewFromUrl(initialUrl, (id) => !!repo.byId(id)));
  const [simScope, setSimScope] = useState<"industry" | "all">(initialUrl.scope);
  const [detailOpen, setDetailOpen] = useState(() => view.kind === "similar");
  const [hover, setHover] = useState<HoverState | null>(null);
  const [boardsOpen, setBoardsOpen] = useState(false);
  const [boardGroup, setBoardGroup] = useState<"layout" | "style">("layout");
  const [searchPath, setSearchPath] = useState<SearchStep[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  const debouncedQuery = useDebouncedValue(query, QUERY_DEBOUNCE_MS);
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
  const searching = (!!combinedText && textHits?.text !== combinedText) || debouncedQuery !== query;
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
    return new Map(rankByPalette(imageQuery.palette, base).map((r) => [r.template.templateId, r.score]));
  }, [imageQuery, base]);

  // Text-relevance scores for the current free-text query, used to order tree branches.
  const textScores = useMemo(() => (liveHits ? liveHits.scores : null), [liveHits]);

  // Emoji/CJK-only queries used to be silently ignored (all 7,000 shown); now they match nothing
  // and the empty state explains why.
  const unsearchable = useMemo(() => isUnsearchableQuery(debouncedQuery), [debouncedQuery]);
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
    if (shuffleSeed !== null) list = seededShuffle(list, shuffleSeed);
    return list;
  }, [base, effective, liveHits, aiText, parsed.text, imageScores, shuffleSeed, unsearchable]);

  // A free-text query that found nothing (and wasn't just filters narrowing the set)
  // is a "no close match", distinct from "remove a chip / clear the filters".
  const filtered =
    !!effective.color || Object.values(effective.facets).some((v) => v?.length);
  const noCloseMatch = !!combinedText && !unsearchable && results.length === 0 && !filtered;

  const byId = useCallback((id: string) => repo.byId(id), [repo]);
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
  // Canvas "search within": narrow the search and remember the step so it can be undone.
  const searchWithin = useCallback(
    ({ label, facets }: { label: string; facets: FacetSelection }) => {
      setFilters((f) => ({ ...f, facets: mergeSelections(f.facets, facets) }));
      setSearchPath((p) => [
        ...p,
        { id: `${p.length}:${label}`, label, facets },
      ]);
    },
    [],
  );
  // Drop the facets of `steps` (the ones being undone), keeping any other filters.
  const dropSteps = useCallback((steps: SearchStep[]) => {
    setFilters((f) => steps.reduce((acc, s) => removeSelections(acc, s.facets), f));
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
      setImageQuery({ url: res.thumbUrl, palette: res.palette, name: file.name });
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
      query,
      facets: filters.facets,
      color: filters.color,
      design: view.kind === "similar" ? view.trail : [],
      board:
        view.kind === "board" ? view.boardId : view.kind === "similar" && view.origin.kind === "board" ? view.origin.boardId : null,
      scope: simScope,
      shuffle: shuffleSeed,
    }),
    [query, filters, view, simScope, shuffleSeed],
  );
  const lastUrl = useRef<UrlState | null>(null);
  const typingRun = useRef(false);
  useEffect(() => {
    const url = (s: UrlState) => window.location.pathname + toSearch(s) + window.location.hash;
    if (!lastUrl.current) {
      // first render: normalise the address (e.g. drop unknown design ids) without a new entry
      lastUrl.current = urlState;
      if (window.location.search !== toSearch(urlState)) window.history.replaceState(null, "", url(urlState));
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
      const u = fromSearch(window.location.search);
      const nextFilters: FilterState = { facets: u.facets, color: u.color };
      const nextView = viewFromUrl(u, (id) => !!byId(id));
      lastUrl.current = u;
      typingRun.current = false;
      // restoring a design view together with a different query must not bounce back to the tree
      lastSearchKey.current = searchKey(u.query, nextFilters, imageUrlRef.current, category);
      setQuery(u.query);
      setFilters(nextFilters);
      setView(nextView);
      setSimScope(u.scope);
      setShuffleSeed(u.shuffle);
      setSearchPath([]);
      setHover(null);
      setDetailOpen(nextView.kind === "similar");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [byId, category]);

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
    query, setQuery, parsed, searching, unsearchable, noCloseMatch, filters, setFilters, effective, toggleFacet, addFacet, clearAll,
    ai, aiStatus, aiEnabled, dismissAi,
    searchPath, searchWithin, backOneStep, jumpToStep,
    imageQuery, setImageQuery, imageScores, textScores, imageBusy, searchByImage, shuffleSeed, setShuffleSeed,
    view, setView, openTemplate, simScope, setSimScope, similar, center,
    detailsReady, detailsError, loadDetails,
    detailOpen, setDetailOpen, hover, setHover, boardsOpen, setBoardsOpen, boardGroup, setBoardGroup, focusSearch,
  };

  return (
    <ExplorerContext.Provider value={api}>
      <div className="relative h-full overflow-hidden bg-background text-foreground">
        {/* Keyboard users reach the search before the hundreds of tree buttons. */}
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
        <TopBar />
        <SearchDock inputRef={searchRef} />
        <main className="absolute inset-0" aria-label="Template tree">
          <TreeCanvas />
        </main>
        {center && detailOpen && <DetailPanel template={center} />}
        <BoardsPanel />
        <ImageDropOverlay />
        <OfflineBanner />
      </div>
    </ExplorerContext.Provider>
  );
}
