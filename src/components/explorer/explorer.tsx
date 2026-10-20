"use client";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { TemplateRepository } from "@/lib/data";
import { applyFilters, EMPTY_FILTERS, mergeSelections, replaceSelections, restoreSelections, type FacetKey, type FacetSelection, type FilterState } from "@/lib/facets";
import { buildVocab, chipsToSelection, isUnsearchableQuery, parseQuery, removeChipFromQuery, type VocabTerm } from "@/lib/query";
import { createSearchClient, type SearchClient } from "@/lib/search-client";
import { fromUrl, historyAction, toUrl, type Page, type ProfileKind, type UrlState } from "@/lib/url-state";
import { useAuth } from "@/components/auth/auth-provider";
import { findAllSimilar, rankByImage } from "@/lib/similarity";
import { SITE_NAME, SITE_TITLE } from "@/lib/site";
import { paletteFromFile } from "@/lib/image-search";
import { toast } from "@/components/ui/toast";
import { useAiInterpretation } from "./use-ai-interpretation";
import { ExplorerContext, type BoardSelection, type ExplorerApi, type HoverState, type ImageQuery, type Origin, type SearchStep, type View } from "./context";
import { BottomNav, Sidebar } from "./sidebar";
import { SearchDock } from "./search-dock";
import { BrowseArea } from "./browse-area";
import { FocusedView } from "./focused-view";
import { FilterPanel } from "./filter-panel";
import { SettingsPanel } from "./settings-panel";
import { DetailPanel } from "./detail-panel";
import { BoardPanel } from "./board-panel";
import { MoodboardPanel } from "./moodboard-panel";
import { useMoodboardPinned } from "./use-moodboards";
import { getBoardStore } from "@/lib/boards";
import { BoardSelectBar } from "./board-select-bar";
import { ImageDropOverlay } from "./image-drop";
import { OfflineBanner } from "./offline-banner";
import { OnboardingTour } from "./onboarding-tour";
import { AssistantPanel, AssistantToggle } from "./assistant-panel";

const IMAGE_RESULTS = 60;
const NO_VOCAB: VocabTerm[] = [];

/** View described by the URL; design ids that aren't in the dataset are dropped. */
function viewFromUrl(u: UrlState, exists: (id: string) => boolean): View {
  // On home, `design` is a canvas pivot — don't open the focused/similar views.
  if (u.page === "home") {
    if (u.board) return { kind: "board", boardId: u.board };
    return { kind: "search" };
  }
  const trail = u.design.filter(exists);
  if (trail.length) {
    const origin: Origin = u.board ? { kind: "board", boardId: u.board } : { kind: "search" };
    // Tree / similar mind-map is gone: any design deep-link opens the focused lightbox.
    return { kind: "focused", id: trail[trail.length - 1], origin };
  }
  if (u.board) return { kind: "board", boardId: u.board };
  return { kind: "search" };
}

const searchKey = (query: string, filters: FilterState, imageUrl: string | undefined, category: string) =>
  JSON.stringify([query, filters, imageUrl, category]);

export function Explorer({ repo, dataUrl, detailsUrl }: { repo: TemplateRepository; dataUrl: string; detailsUrl?: string }) {
  const { profile: authProfile } = useAuth();
  const all = repo.all();
  const categories = useMemo(() => repo.categories(), [repo]);
  const [category] = useState(categories[0] ?? "Instagram Post");
  const base = useMemo(() => all.filter((t) => t.category === category), [all, category]);
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
  // Building the vocabulary walks the whole catalogue (hundreds of ms). Only chip detection and
  // autocomplete use it, so it waits for idle time unless a query needs it right away.
  const [vocabWanted, setVocabWanted] = useState(() => initialUrl.query.trim() !== "");
  useEffect(() => {
    if (vocabWanted) return;
    const want = () => setVocabWanted(true);
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(want, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(want, 1000);
    return () => window.clearTimeout(id);
  }, [vocabWanted]);
  const needVocab = vocabWanted || query.trim() !== "";
  const vocab = useMemo(() => (needVocab ? buildVocab(base) : NO_VOCAB), [needVocab, base]);
  const [filters, setFilters] = useState<FilterState>({ facets: initialUrl.facets, color: initialUrl.color });
  const [imageQuery, setImageQuery] = useState<ImageQuery | null>(null);
  const [view, setView] = useState<View>(() => viewFromUrl(initialUrl, (id) => !!repo.byId(id)));
  const [page, setPageState] = useState<Page>(() => initialUrl.page);
  const [profileHandle, setProfileHandle] = useState<string | null>(() => initialUrl.profileHandle);
  const [profileKind, setProfileKind] = useState<ProfileKind>(() => initialUrl.profileKind);
  const [profileSlug, setProfileSlug] = useState<string | null>(() => initialUrl.profileSlug);
  const [homePivotId, setHomePivotId] = useState<string | null>(() =>
    initialUrl.page === "home" && initialUrl.design[0] && repo.byId(initialUrl.design[0])
      ? initialUrl.design[0]
      : null,
  );
  const [filterPanelOpen, setFilterPanelOpenState] = useState(false);
  const [settingsOpen, setSettingsOpenState] = useState(false);
  const [assistantOpen, setAssistantOpenState] = useState(false);
  const setFilterPanelOpen = useCallback((o: boolean) => {
    setFilterPanelOpenState(o);
    if (o) {
      setSettingsOpenState(false);
      setAssistantOpenState(false);
    }
  }, []);
  const setSettingsOpen = useCallback((o: boolean) => {
    setSettingsOpenState(o);
    if (o) {
      setFilterPanelOpenState(false);
      setAssistantOpenState(false);
    }
  }, []);
  const setAssistantOpen = useCallback((o: boolean) => {
    setAssistantOpenState(o);
    if (o) {
      setFilterPanelOpenState(false);
      setSettingsOpenState(false);
    }
  }, []);
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
    setSettingsOpen(false);
    setAssistantOpen(false);
    setView((v) => (v.kind === "search" ? v : { kind: "search" }));
    if (next !== "home") setHomePivotId(null);
    if (next !== "profile") {
      setProfileHandle(null);
      setProfileKind("index");
      setProfileSlug(null);
    }
  }, [page]);

  const openProfile = useCallback(
    (handle: string, dest?: { kind: "board" | "moodboard"; slug: string }) => {
      const next = handle.toLowerCase();
      if (authProfile?.handle && authProfile.handle === next && !dest) {
        setPage("boards");
        return;
      }
      setProfileHandle(next);
      setProfileKind(dest?.kind ?? "index");
      setProfileSlug(dest?.slug ?? null);
      setDetailOpen(false);
      setHover(null);
      setFilterPanelOpen(false);
      setSettingsOpen(false);
      setAssistantOpen(false);
      setView({ kind: "search" });
      setHomePivotId(null);
      setPageState("profile");
    },
    [authProfile?.handle, setPage],
  );

  if (
    page === "profile" &&
    profileKind === "index" &&
    authProfile?.handle &&
    profileHandle === authProfile.handle
  ) {
    setPage("boards");
  }

  // Navigation is a history push rather than a Next route change, so the title the route
  // metadata set on load would otherwise stick to every page after it.
  useEffect(() => {
    const title =
      page === "boards"
        ? view.kind === "board"
          ? "Board"
          : "Boards"
        : page === "brief"
          ? "Moodboard"
          : page === "explore"
            ? "Explore"
            : page === "profile"
              ? profileHandle
                ? profileKind === "index"
                  ? `@${profileHandle}`
                  : profileKind === "moodboard"
                    ? `Moodboard · @${profileHandle}`
                    : `Board · @${profileHandle}`
                : "Profile"
              : null;
    document.title = title ? `${title} | ${SITE_NAME}` : SITE_TITLE;
  }, [page, view, profileHandle, profileKind]);

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
    return list;
  }, [base, effective, liveHits, aiText, parsed.text, imageScores, unsearchable]);

  // A free-text query that found nothing (and wasn't just filters narrowing the set)
  // is a "no close match", distinct from "remove a chip / clear the filters".
  const filtered = !!effective.color || facetActive;
  const noCloseMatch = !!combinedText && !unsearchable && results.length === 0 && !filtered;

  // The browse list trails the input/chips by a frame so a commit never stalls typing.
  const browseItems = useDeferredValue(results);

  const byId = useCallback((id: string) => repo.byId(id), [repo]);
  const focused = view.kind === "focused" ? byId(view.id) ?? null : null;
  const center = view.kind === "similar" ? byId(view.trail[view.trail.length - 1]) ?? null : null;
  const detailTemplate = focused ?? center ?? (homePivotId ? byId(homePivotId) ?? null : null);
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

  /** Grid click: open the focused lightbox, remembering where we came from. */
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
    view.boardId === boardSelection.boardId;
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
      design:
        page === "home"
          ? homePivotId
            ? [homePivotId]
            : []
          : view.kind === "focused"
            ? [view.id]
            : view.kind === "similar"
              ? view.trail
              : [],
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
      profileHandle: page === "profile" ? profileHandle : null,
      profileKind: page === "profile" ? profileKind : "index",
      profileSlug: page === "profile" ? profileSlug : null,
    }),
    [page, query, filters, view, simScope, homePivotId, profileHandle, profileKind, profileSlug],
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
      setProfileHandle(u.profileHandle);
      setProfileKind(u.profileKind);
      setProfileSlug(u.profileSlug);
      setHomePivotId(
        u.page === "home" && u.design[0] && byId(u.design[0]) ? u.design[0] : null,
      );
      setSimScope(u.scope);
      setSearchPath([]);
      setHover(null);
      setDetailOpen(nextView.kind === "similar");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [byId, category]);

  const focusSearch = useCallback(() => searchRef.current?.focus(), []);

  /** Logo: the infinite-canvas home (also clears an open pivot when already there). */
  const goHome = useCallback(() => {
    setHomePivotId(null);
    setPage("home");
  }, [setPage]);

  const pinBoard = useCallback((boardId: string) => {
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
        else if (detailOpen) setDetailOpen(false);
        else if (homePivotId && page === "home") setHomePivotId(null);
        else if (pinnedBoardId) unpinBoard();
        else if (settingsOpen) setSettingsOpen(false);
        else if (filterPanelOpen) setFilterPanelOpen(false);
        else if (assistantOpen) setAssistantOpen(false);
        // Escape leaves one level: a board goes back to the Boards index (/boards), the
        // index and the Moodboard go back to Explore.
        else if (page === "boards" && (view.kind === "board" || view.kind === "focused" || view.kind === "similar")) {
          setView({ kind: "search" });
        } else if (page === "profile" && (view.kind === "focused" || view.kind === "similar")) {
          setView({ kind: "search" });
        } else if (page === "profile" && profileKind !== "index") {
          setProfileKind("index");
          setProfileSlug(null);
        } else if (page === "boards" || page === "brief" || page === "profile") setPage("explore");
        else setHover(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    activeBoardSelection,
    stopBoardSelect,
    detailOpen,
    filterPanelOpen,
    settingsOpen,
    assistantOpen,
    page,
    view,
    profileKind,
    setPage,
    pinnedBoardId,
    unpinBoard,
    setView,
    homePivotId,
  ]);

  const api: ExplorerApi = {
    all, base, results, browseItems, byId, vocab, tagCounts, category,
    query, setQuery, parsed, searching, unsearchable, noCloseMatch, hasSearch, filters, setFilters, effective, toggleFacet, addFacet, clearAll,
    ai, aiStatus, aiEnabled, dismissAi,
    searchPath, searchWithin, backOneStep, jumpToStep,
    imageQuery, setImageQuery, imageScores, textScores, imageBusy, searchByImage,
    page, setPage, profileHandle, profileKind, profileSlug, openProfile,
    filterPanelOpen, setFilterPanelOpen,
    settingsOpen, setSettingsOpen,
    assistantOpen, setAssistantOpen,
    view, setView, openTemplate, openSimilar, recenter, recenterDetail, focused, simScope, setSimScope, similar, center,
    detailsReady, detailsError, loadDetails,
    detailOpen, setDetailOpen, hover, setHover, boardGroup, setBoardGroup, focusSearch,
    boardSelection: activeBoardSelection, startBoardSelect, stopBoardSelect, toggleBoardSelect,
    pinnedBoardId, pinBoard, unpinBoard,
    homePivotId, setHomePivotId,
  };

  return (
    <ExplorerContext.Provider value={api}>
      <div className="relative flex h-full overflow-hidden bg-background text-foreground">
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
        <Sidebar onHome={goHome} />
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative flex min-h-0 flex-1 overflow-hidden">
            <div className="relative flex min-w-0 flex-1 flex-col">
              <main className="relative flex-1 overflow-hidden" aria-label="Template browser">
                <BrowseArea />
                {focused && <FocusedView />}
              </main>
              {/* The board selection toolbar belongs to whichever page shows the board grid;
                  the search dock belongs to Home and Explore. Absolute in this column so they
                  sit above the in-flow bottom nav on compact. */}
              {activeBoardSelection ? (
                <BoardSelectBar />
              ) : page === "explore" || page === "home" ? (
                <SearchDock inputRef={searchRef} />
              ) : null}
              <AssistantToggle />
            </div>
            <FilterPanel />
            <SettingsPanel />
            <AssistantPanel />
            {pinnedBoardId && <BoardPanel />}
            {moodboardPinned && page === "explore" && <MoodboardPanel />}
            {detailTemplate && <DetailPanel template={detailTemplate} />}
          </div>
          <BottomNav onHome={goHome} />
        </div>
      </div>
      <ImageDropOverlay />
      <OfflineBanner />
      <OnboardingTour />
    </ExplorerContext.Provider>
  );
}
