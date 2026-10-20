import { describe, expect, it } from "vitest";
import {
  DONE_COPY,
  EMPTY_ONBOARDING,
  ONBOARDING_KEY,
  PAN_THRESHOLD_PX,
  STEP_COPY,
  STEP_ORDER,
  firstIncomplete,
  loadOnboarding,
  reduceOnboarding,
  saveOnboarding,
  type OnboardingState,
} from "./onboarding";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

function reduce(state: OnboardingState, event: Parameters<typeof reduceOnboarding>[1]) {
  return reduceOnboarding(state, event);
}

describe("onboarding progress", () => {
  it("requires a real pan and ignores zoom as a pan", () => {
    const short = reduce(EMPTY_ONBOARDING, { type: "pan", distance: PAN_THRESHOLD_PX - 1, page: "home" });
    expect(short.completed).not.toContain("pan");
    const panned = reduce(short, { type: "pan", distance: PAN_THRESHOLD_PX, page: "home" });
    expect(panned.completed).toContain("pan");
    expect(panned.completed).not.toContain("zoom");
    const offHome = reduce(EMPTY_ONBOARDING, { type: "pan", distance: 200, page: "explore" });
    expect(offHome.completed).not.toContain("pan");
  });

  it("counts zoom only on the home canvas", () => {
    const elsewhere = reduce(EMPTY_ONBOARDING, { type: "zoom", page: "explore" });
    expect(elsewhere.completed).not.toContain("zoom");
    const home = reduce(elsewhere, { type: "zoom", page: "home" });
    expect(home.completed).toContain("zoom");
    expect(home.completed).not.toContain("pan");
  });

  it("checks a step done even when it happens early", () => {
    const next = reduce(EMPTY_ONBOARDING, { type: "page", page: "explore" });
    expect(next.completed).toEqual(["explore"]);
    expect(firstIncomplete(next)).toBe("pan");
  });

  it("does not treat a text query as a filter", () => {
    const idle = reduce(EMPTY_ONBOARDING, { type: "filter", active: false });
    const typed = reduce(idle, { type: "query", text: "hello there" });
    expect(typed.completed).not.toContain("filter");
    const filtered = reduce(typed, { type: "filter", active: true });
    expect(filtered.completed).toContain("filter");
  });

  it("counts a save and ignores an unsave", () => {
    const removed = reduce(EMPTY_ONBOARDING, { type: "save", saved: false });
    expect(removed.completed).not.toContain("save");
    const saved = reduce(removed, { type: "save", saved: true });
    expect(saved.completed).toContain("save");
  });

  it("counts a board drop only on Explore", () => {
    const home = reduce(EMPTY_ONBOARDING, { type: "drop", page: "home" });
    expect(home.completed).not.toContain("drop");
    const boards = reduce(home, { type: "drop", page: "boards" });
    expect(boards.completed).not.toContain("drop");
    const explore = reduce(boards, { type: "drop", page: "explore" });
    expect(explore.completed).toContain("drop");
  });

  it("opens Boards only after a save", () => {
    const early = reduce(EMPTY_ONBOARDING, { type: "page", page: "boards" });
    expect(early.completed).not.toContain("boards");
    const saved = reduce(early, { type: "save", saved: true });
    const found = reduce(saved, { type: "page", page: "boards" });
    expect(found.completed).toContain("boards");
  });

  it("skips the whole tour without completing a step", () => {
    const skipped = reduce(EMPTY_ONBOARDING, { type: "skip-tour" });
    expect(skipped.dismissed).toBe(true);
    expect(skipped.completed).toEqual([]);
    expect(reduce(skipped, { type: "zoom", page: "home" })).toBe(skipped);
  });

  it("skips only the current step, and the last skip finishes the tour", () => {
    const once = reduce(EMPTY_ONBOARDING, { type: "skip-step" });
    expect(once.dismissed).toBe(false);
    expect(once.completed).toEqual(["pan"]);
    let state = once;
    for (let i = 1; i < STEP_ORDER.length - 1; i++) state = reduce(state, { type: "skip-step" });
    expect(state.dismissed).toBe(false);
    expect(firstIncomplete(state)).toBe("boards");
    const done = reduce(state, { type: "skip-step" });
    expect(done.dismissed).toBe(true);
    expect(done.completed).toEqual([...STEP_ORDER]);
  });

  it("explains the canvas and the Explore grid in the Explore step", () => {
    expect(STEP_COPY.explore.body).toContain("infinite canvas");
    expect(STEP_COPY.explore.body).toContain("results grid");
    expect(STEP_COPY.explore.body.toLowerCase()).toContain("does not zoom");
    expect(STEP_COPY.zoom.body).toContain("Ctrl");
    expect(STEP_COPY.drop.body).toContain("only works on Explore");
    expect(STEP_COPY.drop.body).toContain("Save button");
    expect(STEP_COPY.drop.body).toContain("drop it on the board");
    expect(DONE_COPY.body).toContain("moodboard");
  });

  it("round-trips dismissal and drops unknown step ids", () => {
    const storage = memoryStorage();
    saveOnboarding({ dismissed: true, completed: ["pan", "zoom"] }, storage);
    expect(loadOnboarding(storage)).toEqual({ dismissed: true, completed: ["pan", "zoom"] });
    storage.setItem(ONBOARDING_KEY, JSON.stringify({ dismissed: false, completed: ["pan", "nope", "pan"] }));
    expect(loadOnboarding(storage)).toEqual({ dismissed: false, completed: ["pan"] });
    expect(loadOnboarding(null)).toEqual(EMPTY_ONBOARDING);
  });
});
