import { describe, expect, it } from "vitest";
import { EMPTY_URL_STATE, fromSearch, historyAction, toSearch, type UrlState } from "./url-state";

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
      query: "retro serif cutout",
      facets: { industry: ["Construction", "Real Estate"], aesthetic: ["bold"], structure: ["frame/border"] },
      color: { hex: "#F07B22", mode: "any" },
      design: ["e3426df5-a252-4977-983c-77751087ac14", "abc"],
      board: "saved",
      scope: "all",
      shuffle: 1234,
    });
    const search = toSearch(state);
    expect(search).toContain("q=retro+serif+cutout");
    expect(search).toContain("industry=Construction&industry=Real+Estate");
    expect(fromSearch(search)).toEqual(state);
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
    expect(st.shuffle).toBeNull();
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
  const base = s({ query: "bold" });
  it("does nothing when the URL wouldn't change", () => {
    expect(historyAction(base, s({ query: "bold" }), false).action).toBe("none");
  });
  it("pushes the first edit of a typing run, then replaces", () => {
    const first = historyAction(base, s({ query: "bold r" }), false);
    expect(first).toEqual({ action: "push", typing: true });
    expect(historyAction(s({ query: "bold r" }), s({ query: "bold re" }), first.typing)).toEqual({ action: "replace", typing: true });
  });
  it("pushes discrete changes like filters or opening a design", () => {
    expect(historyAction(base, s({ query: "bold", facets: { mood: ["calm"] } }), true)).toEqual({ action: "push", typing: false });
    expect(historyAction(base, s({ query: "bold", design: ["x"] }), true).action).toBe("push");
  });
});
