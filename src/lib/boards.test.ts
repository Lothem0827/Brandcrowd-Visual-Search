import { describe, expect, it } from "vitest";
import { LocalBoardStore, uniqueTemplateCount } from "./boards";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe("unique save count", () => {
  it("counts a design once when it sits on more than one board", () => {
    expect(
      uniqueTemplateCount([
        { templateIds: ["a", "b"] },
        { templateIds: ["b", "c"] },
      ]),
    ).toBe(3);
  });

  it("updates the cached count when designs are added and removed", () => {
    const store = new LocalBoardStore(memoryStorage());
    expect(store.savedCount()).toBe(0);
    store.add("saved", "a");
    store.add("saved", "a");
    const extra = store.create("Pitches");
    store.add(extra.id, "a");
    store.add(extra.id, "b");
    expect(store.savedCount()).toBe(2);
    store.removeItem("saved", "a");
    expect(store.savedCount()).toBe(2);
    store.removeItem(extra.id, "a");
    expect(store.savedCount()).toBe(1);
    store.remove(extra.id);
    expect(store.savedCount()).toBe(0);
  });
});

describe("board description", () => {
  it("stores a blurb and clears it when empty", () => {
    const store = new LocalBoardStore(memoryStorage());
    const board = store.create("Pitches", "for clients");
    expect(store.list().find((b) => b.id === board.id)?.description).toBe("for clients");
    store.setDescription(board.id, "  revised  ");
    expect(store.list().find((b) => b.id === board.id)?.description).toBe("revised");
    store.setDescription(board.id, "   ");
    expect(store.list().find((b) => b.id === board.id)?.description).toBeUndefined();
  });
});
