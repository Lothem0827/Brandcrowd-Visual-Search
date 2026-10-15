import { FACETS, type ColorFilter, type FacetKey, type FacetSelection } from "./facets";
import { normalizeHex } from "./color";

/**
 * The shareable part of the explorer state, mirrored in the URL so searches can be
 * bookmarked/shared and Back/Forward step through them:
 *
 *   ?q=retro+serif&industry=Construction&aesthetic=bold&color=F07B22&cm=any
 *    &design=<id>,<id>&board=<id>&scope=all&shuffle=123
 *
 * (An uploaded image can't be put in a URL; it stays local.)
 */
export interface UrlState {
  query: string;
  facets: FacetSelection;
  color: ColorFilter | null;
  /** similar-view trail (template ids), most recent last */
  design: string[];
  /** board view, or the board a similar trail started from */
  board: string | null;
  scope: "industry" | "all";
  shuffle: number | null;
}

export const EMPTY_URL_STATE: UrlState = {
  query: "",
  facets: {},
  color: null,
  design: [],
  board: null,
  scope: "industry",
  shuffle: null,
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
  if (s.color) {
    p.set("color", s.color.hex.replace(/^#/, ""));
    p.set("cm", s.color.mode);
  }
  if (s.board) p.set("board", s.board);
  if (s.design.length) p.set("design", s.design.join(","));
  if (s.scope === "all") p.set("scope", "all");
  if (s.shuffle !== null) p.set("shuffle", String(s.shuffle));
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
  const hex = normalizeHex(p.get("color") ?? "");
  const cm = p.get("cm");
  const design = (p.get("design") ?? "")
    .split(",")
    .filter((id) => ID.test(id))
    .slice(-MAX_TRAIL);
  const board = p.get("board");
  const shuffle = Number(p.get("shuffle"));
  return {
    query: (p.get("q") ?? "").slice(0, MAX_QUERY_LENGTH),
    facets,
    color: hex ? { hex, mode: cm === "any" ? "any" : "background" } : null,
    design,
    board: board && ID.test(board) ? board : null,
    scope: p.get("scope") === "all" ? "all" : "industry",
    shuffle: p.has("shuffle") && Number.isInteger(shuffle) ? shuffle : null,
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
