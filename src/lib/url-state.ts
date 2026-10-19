import { FACETS, type ColorFilter, type FacetKey, type FacetSelection } from "./facets";
import { normalizeHex, type ColorMatchMode } from "./color";

/** Which top-level page the URL names. */
export type Page = "explore" | "boards" | "brief";

/**
 * The shareable part of the explorer state, mirrored in the URL so pages can be refreshed,
 * bookmarked/shared and Back/Forward can step through them:
 *
 *   /?q=retro+serif&industry=Construction&aesthetic=bold&color=F07B22&cm=any
 *   /?design=<id>&view=focus&scope=all&sort=shuffle
 *   /boards/<id>?design=<id>&view=focus
 *
 * (An uploaded image can't be put in a URL; it stays local.)
 */
export type SortMode = "relevance" | "shuffle";

export interface UrlState {
  /** which top-level page (also the pathname: /, /boards, /brief; /explore is an old alias of /) */
  page: Page;
  query: string;
  facets: FacetSelection;
  color: ColorFilter | null;
  /** focused-view design id (single) or similar-view trail (many), most recent last */
  design: string[];
  /** true when `design` describes the grid lightbox rather than the similar mind-map */
  focused: boolean;
  /** board open on the Boards page (/boards/<id>), or the board a similar trail started from */
  board: string | null;
  scope: "industry" | "all";
  sort: SortMode;
  /** seed for shuffle; present iff `sort === "shuffle"` */
  shuffleSeed: number | null;
}

export const EMPTY_URL_STATE: UrlState = {
  page: "explore",
  query: "",
  facets: {},
  color: null,
  design: [],
  focused: false,
  board: null,
  scope: "industry",
  sort: "relevance",
  shuffleSeed: null,
};

const PAGE_PATH: Record<Page, string> = {
  explore: "/",
  boards: "/boards",
  brief: "/brief",
};

const FACET_KEYS = FACETS.map((f) => f.key);
const FACET_SET = new Set<string>(FACET_KEYS);
export const MAX_QUERY_LENGTH = 200;
const MAX_TRAIL = 20;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Serialise the query string ("" or "?…") with a stable parameter order. */
export function toSearch(s: UrlState): string {
  const p = new URLSearchParams();
  const q = s.query.trim();
  if (q) p.set("q", q.slice(0, MAX_QUERY_LENGTH));
  for (const k of FACET_KEYS) {
    const vs = s.facets[k];
    if (vs?.length) for (const v of [...vs].sort()) p.append(k, v);
  }
  if (s.color?.colors.length) {
    const hexes = s.color.colors.map((c) => normalizeHex(c)).filter((h): h is string => !!h).sort();
    if (hexes.length) {
      for (const h of hexes) p.append("color", h.replace(/^#/, ""));
      p.set("cm", s.color.mode);
    }
  }
  if (s.design.length) {
    p.set("design", s.design.join(","));
    if (s.focused) p.set("view", "focus");
  }
  if (s.scope === "all") p.set("scope", "all");
  if (s.sort === "shuffle") {
    p.set("sort", "shuffle");
    if (s.shuffleSeed != null) p.set("shuffle", String(s.shuffleSeed));
  }
  const str = p.toString();
  return str ? `?${str}` : "";
}

/** Drop a trailing slash ("/explore/" → "/explore"), leaving the root alone. */
function trimPath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

/** Map a pathname to the page it names. `/` and the old `/explore` address are the browse page. */
export function pageFromPath(pathname: string): Page {
  const path = trimPath(pathname);
  if (path === "/boards" || path.startsWith("/boards/")) return "boards";
  if (path === "/brief") return "brief";
  return "explore";
}

/** `/boards/<id>` → id; null for the index and for ids that fail validation. */
export function boardFromPath(pathname: string): string | null {
  const match = /^\/boards\/([^/]+)$/.exec(trimPath(pathname));
  if (!match) return null;
  let id: string;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return ID.test(id) ? id : null;
}

/**
 * The canonical URL for a state: pathname derived from the page, query from the rest.
 * The Boards index and the Brief drop the query entirely — they have no searchable view.
 */
export function toUrl(s: UrlState): string {
  if (s.page === "boards") {
    if (!s.board) return PAGE_PATH.boards;
    // A board is a fixed set of designs: only what it can show (an opened design, the
    // similarity scope, its ordering) belongs in the URL — a search's query and filters don't.
    const shown: UrlState = {
      ...EMPTY_URL_STATE,
      page: "boards",
      board: s.board,
      design: s.design,
      focused: s.focused,
      scope: s.scope,
      sort: s.sort,
      shuffleSeed: s.shuffleSeed,
    };
    return `/boards/${encodeURIComponent(s.board)}${toSearch(shown)}`;
  }
  if (s.page === "brief") return PAGE_PATH.brief;
  return `${PAGE_PATH[s.page]}${toSearch(s)}`;
}

/** Parse a query string, ignoring anything unknown or malformed. */
export function fromSearch(search: string): UrlState {
  const p = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const facets: FacetSelection = {};
  for (const [k, v] of p) {
    if (!FACET_SET.has(k) || !v) continue;
    const key = k as FacetKey;
    const list = (facets[key] ??= []);
    if (!list.includes(v)) list.push(v);
  }
  const colors: string[] = [];
  for (const raw of p.getAll("color")) {
    const h = normalizeHex(raw);
    if (h && !colors.includes(h)) colors.push(h);
  }
  const cm = p.get("cm");
  const mode: ColorMatchMode = cm === "any" || cm === "primary" || cm === "accent" ? cm : "background";
  const design = (p.get("design") ?? "")
    .split(",")
    .filter((id) => ID.test(id))
    .slice(-MAX_TRAIL);
  // `?board=` is only read for links made before the Boards page had its own route.
  const board = p.get("board");
  const sort: SortMode = p.get("sort") === "shuffle" || p.has("shuffle") ? "shuffle" : "relevance";
  const seedNum = Number(p.get("shuffle"));
  const shuffleSeed = sort === "shuffle" ? (Number.isInteger(seedNum) ? seedNum : 1) : null;
  return {
    page: "explore",
    query: (p.get("q") ?? "").slice(0, MAX_QUERY_LENGTH),
    facets,
    color: colors.length ? { colors, mode } : null,
    design,
    focused: p.get("view") === "focus" && design.length > 0,
    board: board && ID.test(board) ? board : null,
    scope: p.get("scope") === "all" ? "all" : "industry",
    sort,
    shuffleSeed,
  };
}

/**
 * Parse a URL into the full state. The page comes from the pathname, and links made before
 * pages had routes (`/?q=…`, `?board=<id>`) are folded into their canonical route so the
 * first render can rewrite the address.
 */
export function fromUrl(pathname: string, search = ""): UrlState {
  const state = fromSearch(search);
  const page = pageFromPath(pathname);
  const board = boardFromPath(pathname) ?? state.board;
  if (board) return { ...state, page: "boards", board };
  if (page === "boards") return { ...state, page, board: null };
  return { ...state, page };
}

/** True when only the free-text query differs (i.e. the user is typing). */
export function onlyQueryChanged(a: UrlState, b: UrlState): boolean {
  return a.query !== b.query && toUrl({ ...a, query: "" }) === toUrl({ ...b, query: "" });
}

/**
 * How to record a state change in history: nothing if the URL is unchanged; `replace` while
 * the user keeps typing (one entry per typing run, not per keystroke); `push` otherwise.
 */
export function historyAction(
  prev: UrlState,
  next: UrlState,
  lastWasTyping: boolean,
): { action: "none" | "push" | "replace"; typing: boolean } {
  if (toUrl(prev) === toUrl(next)) return { action: "none", typing: lastWasTyping };
  if (onlyQueryChanged(prev, next)) return { action: lastWasTyping ? "replace" : "push", typing: true };
  return { action: "push", typing: false };
}
