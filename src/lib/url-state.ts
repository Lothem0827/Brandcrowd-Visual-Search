import { FACETS, type ColorFilter, type FacetKey, type FacetSelection } from "./facets";
import { normalizeHex, type ColorMatchMode } from "./color";

/**
 * The shareable part of the explorer state, mirrored in the URL so searches can be
 * bookmarked/shared and Back/Forward step through them:
 *
 *   ?q=retro+serif&industry=Construction&aesthetic=bold&color=F07B22&cm=any
 *    &design=<id>&view=focus&board=<id>&scope=all&sort=shuffle
 *
 * (An uploaded image can't be put in a URL; it stays local.)
 */
export type SortMode = "relevance" | "shuffle";

export interface UrlState {
  query: string;
  facets: FacetSelection;
  color: ColorFilter | null;
  /** focused-view design id (single) or similar-view trail (many), most recent last */
  design: string[];
  /** true when `design` describes the grid lightbox rather than the similar mind-map */
  focused: boolean;
  /** board view, or the board a similar trail started from */
  board: string | null;
  scope: "industry" | "all";
  sort: SortMode;
  /** seed for shuffle; present iff `sort === "shuffle"` */
  shuffleSeed: number | null;
}

export const EMPTY_URL_STATE: UrlState = {
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

const FACET_KEYS = FACETS.map((f) => f.key);
const FACET_SET = new Set<string>(FACET_KEYS);
export const MAX_QUERY_LENGTH = 200;
const MAX_TRAIL = 20;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Serialise to a query string ("" or "?…") with a stable parameter order. */
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
  if (s.board) p.set("board", s.board);
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
  const board = p.get("board");
  const sort: SortMode = p.get("sort") === "shuffle" || p.has("shuffle") ? "shuffle" : "relevance";
  const seedNum = Number(p.get("shuffle"));
  const shuffleSeed = sort === "shuffle" ? (Number.isInteger(seedNum) ? seedNum : 1) : null;
  return {
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

/** True when only the free-text query differs (i.e. the user is typing). */
export function onlyQueryChanged(a: UrlState, b: UrlState): boolean {
  return a.query !== b.query && toSearch({ ...a, query: "" }) === toSearch({ ...b, query: "" });
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
  if (toSearch(prev) === toSearch(next)) return { action: "none", typing: lastWasTyping };
  if (onlyQueryChanged(prev, next)) return { action: lastWasTyping ? "replace" : "push", typing: true };
  return { action: "push", typing: false };
}
