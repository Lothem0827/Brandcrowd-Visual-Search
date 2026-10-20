import { describe, expect, it } from "vitest";
import {
  EMPTY_URL_STATE,
  boardFromPath,
  fromSearch,
  fromUrl,
  historyAction,
  pageFromPath,
  toSearch,
  toUrl,
  type UrlState,
} from "./url-state";

const s = (over: Partial<UrlState>): UrlState => ({ ...EMPTY_URL_STATE, ...over });

describe("URL state", () => {
  it("is empty for the default state", () => {
    expect(toSearch(EMPTY_URL_STATE)).toBe("");
    expect(fromSearch("")).toEqual(EMPTY_URL_STATE);
  });

  it("restores a plain ?q= search", () => {
    expect(fromSearch("?q=minimalist").query).toBe("minimalist");
  });

  it("round-trips query, filters, colour, view and options", () => {
    const state = s({
      page: "explore",
      query: "retro serif cutout",
      facets: { industry: ["Construction", "Real Estate"], aesthetic: ["bold"], structure: ["frame/border"] },
      color: { colors: ["#F07B22"], mode: "any" },
      design: ["e3426df5-a252-4977-983c-77751087ac14", "abc"],
      scope: "all",
    });
    const search = toSearch(state);
    expect(search).toContain("q=retro+serif+cutout");
    expect(search).toContain("industry=Construction&industry=Real+Estate");
    expect(fromSearch(search)).toEqual({ ...state, page: "home" });
  });

  it("round-trips multiple picked colours (OR) and their shared role mode", () => {
    const state = s({ color: { colors: ["#F07B22", "#123456"], mode: "primary" } });
    const search = toSearch(state);
    expect(search).toContain("color=F07B22");
    expect(search).toContain("color=123456");
    expect(search).toContain("cm=primary");
    expect(fromSearch(search).color).toEqual({ colors: ["#123456", "#F07B22"], mode: "primary" });
  });

  it("encodes the focused lightbox distinctly from the similar trail", () => {
    const focused = fromSearch(toSearch(s({ design: ["a1"], focused: true })));
    expect(focused.focused).toBe(true);
    expect(focused.design).toEqual(["a1"]);
    const similar = fromSearch(toSearch(s({ design: ["a1", "b2"], focused: false })));
    expect(similar.focused).toBe(false);
    expect(similar.design).toEqual(["a1", "b2"]);
  });

  it("produces a stable order regardless of selection order", () => {
    const a = toSearch(s({ facets: { mood: ["calm", "festive"], industry: ["Fitness"] } }));
    const b = toSearch(s({ facets: { industry: ["Fitness"], mood: ["festive", "calm"] } }));
    expect(a).toBe(b);
  });

  it("ignores unknown params and malformed values", () => {
    const st = fromSearch("?utm_source=x&color=nothex&design=<script>,ok-id&board=../../etc&shuffle=abc&scope=weird&nope=1");
    expect(st.color).toBeNull();
    expect(st.design).toEqual(["ok-id"]);
    expect(st.board).toBeNull();
    expect(st.scope).toBe("industry");
    expect(st.facets).toEqual({});
  });

  it("caps very long queries", () => {
    expect(fromSearch(`?q=${"a".repeat(5000)}`).query.length).toBe(200);
    expect(toSearch(s({ query: "b".repeat(5000) })).length).toBeLessThan(220);
  });

  it("keeps emoji and non-Latin text intact", () => {
    expect(fromSearch(toSearch(s({ query: "🍕 カフェ" }))).query).toBe("🍕 カフェ");
  });
});

describe("history policy", () => {
  const base = s({ page: "explore", query: "bold" });
  it("does nothing when the URL wouldn't change", () => {
    expect(historyAction(base, s({ page: "explore", query: "bold" }), false).action).toBe("none");
  });
  it("pushes the first edit of a typing run, then replaces", () => {
    const first = historyAction(base, s({ page: "explore", query: "bold r" }), false);
    expect(first).toEqual({ action: "push", typing: true });
    expect(historyAction(s({ page: "explore", query: "bold r" }), s({ page: "explore", query: "bold re" }), first.typing)).toEqual({
      action: "replace",
      typing: true,
    });
  });
  it("pushes discrete changes like filters or opening a design", () => {
    expect(historyAction(base, s({ page: "explore", query: "bold", facets: { mood: ["calm"] } }), true)).toEqual({
      action: "push",
      typing: false,
    });
    expect(historyAction(base, s({ page: "explore", query: "bold", design: ["x"] }), true).action).toBe("push");
  });
});

describe("routes", () => {
  it("maps a pathname to its page", () => {
    expect(pageFromPath("/")).toBe("home");
    expect(pageFromPath("/explore")).toBe("explore");
    expect(pageFromPath("/explore/")).toBe("explore");
    expect(pageFromPath("/boards")).toBe("boards");
    expect(pageFromPath("/boards/saved")).toBe("boards");
    expect(pageFromPath("/brief")).toBe("brief");
    expect(pageFromPath("/nope")).toBe("home");
  });

  it("reads a board id from the path only when it is valid", () => {
    expect(boardFromPath("/boards/saved")).toBe("saved");
    expect(boardFromPath("/boards")).toBeNull();
    expect(boardFromPath("/boards/../../etc")).toBeNull();
    expect(boardFromPath("/explore/boards/x")).toBeNull();
  });

  it("builds one URL per page", () => {
    expect(toUrl(s({}))).toBe("/");
    expect(toUrl(s({ page: "home", design: ["a1"] }))).toBe("/?design=a1");
    expect(toUrl(s({ page: "explore", query: "bold" }))).toBe("/explore?q=bold");
    expect(toUrl(s({ page: "explore" }))).toBe("/explore");
    expect(toUrl(s({ page: "boards" }))).toBe("/boards");
    expect(toUrl(s({ page: "boards", board: "saved" }))).toBe("/boards/saved");
    expect(toUrl(s({ page: "brief", query: "ignored" }))).toBe("/brief");
  });

  it("round-trips a board with a design opened from it", () => {
    const state = s({ page: "boards", board: "saved", design: ["a1"], focused: true });
    expect(toUrl(state)).toBe("/boards/saved?design=a1&view=focus");
    expect(fromUrl("/boards/saved", "?design=a1&view=focus")).toEqual(state);
  });

  it("keeps browse search on /explore and folds old /?q= links there", () => {
    const state = s({ page: "explore", query: "retro", facets: { industry: ["Fitness"] } });
    expect(toUrl(state)).toBe("/explore?q=retro&industry=Fitness");
    expect(fromUrl("/explore", toSearch(state))).toEqual(state);
    expect(fromUrl("/", toSearch(state))).toEqual(state);
  });

  it("folds pre-route links into the canonical route", () => {
    expect(fromUrl("/", "?q=retro").page).toBe("explore");
    expect(fromUrl("/", "?industry=Fitness").page).toBe("explore");
    expect(fromUrl("/", "?design=a1")).toEqual(s({ page: "home", design: ["a1"] }));
    expect(fromUrl("/", "?board=saved")).toEqual(s({ page: "boards", board: "saved" }));
    expect(fromUrl("/explore", "?board=saved")).toEqual(s({ page: "boards", board: "saved" }));
    expect(fromUrl("/explore", "")).toEqual(s({ page: "explore" }));
    expect(fromUrl("/", "")).toEqual(s({ page: "home" }));
  });

  it("pushes a page change as a single history entry", () => {
    expect(historyAction(s({}), s({ page: "boards" }), false).action).toBe("push");
    expect(historyAction(s({ page: "boards" }), s({ page: "brief" }), false).action).toBe("push");
    expect(historyAction(s({ page: "boards", board: "saved" }), s({ page: "boards" }), false).action).toBe("push");
    expect(historyAction(s({ page: "home" }), s({ page: "explore" }), false).action).toBe("push");
  });
});
