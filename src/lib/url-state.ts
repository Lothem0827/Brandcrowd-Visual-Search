import { FACETS, type ColorFilter, type FacetKey, type FacetSelection } from "./facets";
import { normalizeHex, type ColorMatchMode } from "./color";

/** Which top-level page the URL names. */
export type Page = "home" | "explore" | "boards" | "brief" | "profile";

/** Sub-view of `/u/{handle}`: the profile index, a public board, or a public moodboard. */
export type ProfileKind = "index" | "board" | "moodboard";

/**
 * The shareable part of the explorer state, mirrored in the URL so pages can be refreshed,
 * bookmarked/shared and Back/Forward can step through them:
 *
 *   /?design=<id>                         (home canvas pivot)
 *   /explore?q=retro&industry=Construction&aesthetic=bold&color=F07B22&cm=any
 *   /explore?design=<id>&view=focus&scope=all
 *   /boards/<id>?design=<id>&view=focus
 *   /u/{handle}
 *   /u/{handle}/b/{slug}
 *   /u/{handle}/m/{slug}
 *
 * (An uploaded image can't be put in a URL; it stays local.)
 */
export interface UrlState {
  /** which top-level page (pathname: /, /explore, /boards, /brief, /u/…) */
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
  /** Public profile handle when `page` is `"profile"`. */
  profileHandle: string | null;
  profileKind: ProfileKind;
  profileSlug: string | null;
}

export const EMPTY_URL_STATE: UrlState = {
  page: "home",
  query: "",
  facets: {},
  color: null,
  design: [],
  focused: false,
  board: null,
  scope: "industry",
  profileHandle: null,
  profileKind: "index",
  profileSlug: null,
};

const PAGE_PATH: Record<Exclude<Page, "profile">, string> = {
  home: "/",
  explore: "/explore",
  boards: "/boards",
  brief: "/brief",
};

const FACET_KEYS = FACETS.map((f) => f.key);
const FACET_SET = new Set<string>(FACET_KEYS);
export const MAX_QUERY_LENGTH = 200;
const MAX_TRAIL = 20;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const HANDLE = /^[a-z0-9_]{3,32}$/;
const SLUG = /^[a-z0-9_-]{1,64}$/;

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
  const str = p.toString();
  return str ? `?${str}` : "";
}

/** Drop a trailing slash ("/explore/" → "/explore"), leaving the root alone. */
function trimPath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

/** Map a pathname to the page it names. */
export function pageFromPath(pathname: string): Page {
  if (profileFromPath(pathname)) return "profile";
  const path = trimPath(pathname);
  if (path === "/boards" || path.startsWith("/boards/")) return "boards";
  if (path === "/brief") return "brief";
  if (path === "/explore") return "explore";
  return "home";
}

/** `/u/{handle}`, `/u/{handle}/b/{slug}`, `/u/{handle}/m/{slug}`. */
export function profileFromPath(pathname: string): {
  handle: string;
  kind: ProfileKind;
  slug: string | null;
} | null {
  const match = /^\/u\/([^/]+)(?:\/(b|m)\/([^/]+))?$/.exec(trimPath(pathname));
  if (!match) return null;
  let handle: string;
  try {
    handle = decodeURIComponent(match[1]).toLowerCase();
  } catch {
    return null;
  }
  if (!HANDLE.test(handle)) return null;
  if (!match[2]) return { handle, kind: "index", slug: null };
  let slug: string;
  try {
    slug = decodeURIComponent(match[3]);
  } catch {
    return null;
  }
  if (!SLUG.test(slug)) return null;
  return { handle, kind: match[2] === "b" ? "board" : "moodboard", slug };
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
 * True when the search describes a browse/search view (query, facets, colour) rather than
 * a home-canvas pivot (`design` alone). Used to fold old `/?q=…` links onto `/explore`.
 */
function hasBrowseSearch(s: UrlState): boolean {
  if (s.query.trim()) return true;
  if (s.color) return true;
  if (s.focused) return true;
  if (s.design.length > 1) return true;
  for (const k of FACET_KEYS) {
    if (s.facets[k]?.length) return true;
  }
  return false;
}

/**
 * The canonical URL for a state: pathname derived from the page, query from the rest.
 * The Boards index and the Brief drop the query entirely — they have no searchable view.
 * Home keeps only `design` (canvas pivot).
 */
export function toUrl(s: UrlState): string {
  if (s.page === "profile") {
    if (!s.profileHandle) return PAGE_PATH.explore;
    const base = `/u/${encodeURIComponent(s.profileHandle)}`;
    const path =
      s.profileKind === "board" && s.profileSlug
        ? `${base}/b/${encodeURIComponent(s.profileSlug)}`
        : s.profileKind === "moodboard" && s.profileSlug
          ? `${base}/m/${encodeURIComponent(s.profileSlug)}`
          : base;
    const shown: UrlState = {
      ...EMPTY_URL_STATE,
      page: "profile",
      profileHandle: s.profileHandle,
      profileKind: s.profileKind,
      profileSlug: s.profileSlug,
      design: s.design,
      focused: s.focused,
      scope: s.scope,
    };
    return `${path}${toSearch(shown)}`;
  }
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
    };
    return `/boards/${encodeURIComponent(s.board)}${toSearch(shown)}`;
  }
  if (s.page === "brief") return PAGE_PATH.brief;
  if (s.page === "home") {
    const home: UrlState = {
      ...EMPTY_URL_STATE,
      page: "home",
      design: s.design.slice(-1),
      focused: false,
    };
    return `${PAGE_PATH.home}${toSearch(home)}`;
  }
  return `${PAGE_PATH.explore}${toSearch(s)}`;
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
  return {
    page: "home",
    query: (p.get("q") ?? "").slice(0, MAX_QUERY_LENGTH),
    facets,
    color: colors.length ? { colors, mode } : null,
    design,
    focused: p.get("view") === "focus" && design.length > 0,
    board: board && ID.test(board) ? board : null,
    scope: p.get("scope") === "all" ? "all" : "industry",
    profileHandle: null,
    profileKind: "index",
    profileSlug: null,
  };
}

/**
 * Parse a URL into the full state. The page comes from the pathname, and links made before
 * pages had routes (`/?q=…`, `?board=<id>`) are folded into their canonical route so the
 * first render can rewrite the address.
 */
export function fromUrl(pathname: string, search = ""): UrlState {
  const state = fromSearch(search);
  const profile = profileFromPath(pathname);
  if (profile) {
    return {
      ...state,
      page: "profile",
      board: null,
      profileHandle: profile.handle,
      profileKind: profile.kind,
      profileSlug: profile.slug,
    };
  }
  const page = pageFromPath(pathname);
  const board = boardFromPath(pathname) ?? state.board;
  if (board) return { ...state, page: "boards", board };
  if (page === "boards") return { ...state, page, board: null };
  if (page === "brief") return { ...state, page: "brief" };
  if (page === "explore") return { ...state, page: "explore" };
  // `/` with browse params (old home-was-search links) folds onto /explore.
  if (hasBrowseSearch(state)) return { ...state, page: "explore" };
  return { ...state, page: "home", query: "", facets: {}, color: null, focused: false, design: state.design.slice(-1) };
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
  // Home canvas pivots replace so Back leaves the page instead of stepping through every design.
  if (
    prev.page === "home" &&
    next.page === "home" &&
    toUrl({ ...prev, design: [] }) === toUrl({ ...next, design: [] })
  ) {
    return { action: "replace", typing: false };
  }
  return { action: "push", typing: false };
}
