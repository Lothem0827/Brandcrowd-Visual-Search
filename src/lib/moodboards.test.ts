import { describe, expect, it } from "vitest";
import { LocalMoodboardStore, type GeneratedMoodboard } from "./moodboards";

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

const generated = (query = "Construction"): GeneratedMoodboard => ({
  query,
  tags: ["maintenance", "construction"],
  colors: [{ hex: "#dcaf3a", name: "Yellow", share: 0.4 }],
});

describe("LocalMoodboardStore", () => {
  it("keeps the draft id and inspiration when generating again", () => {
    const store = new LocalMoodboardStore(memory());
    store.applyGenerated(generated());
    store.addInspo("7569b899-c9a7-47f9-9e70-7bf8075c0971");
    const id = store.getState().draft?.id;
    store.applyGenerated(generated("Healthcare"));
    const draft = store.getState().draft;
    expect(draft?.id).toBe(id);
    expect(draft?.query).toBe("Healthcare");
    expect(draft?.inspoIds).toEqual(["7569b899-c9a7-47f9-9e70-7bf8075c0971"]);
    expect(draft?.harmony).toBe("analogous");
    expect(store.getState().titlesPending).toBe(true);
  });

  it("ignores a title response from an older generate", () => {
    const store = new LocalMoodboardStore(memory());
    const first = store.applyGenerated(generated());
    const second = store.applyGenerated(generated("Healthcare"));
    store.setTitles(first, ["Old title"]);
    expect(store.getState().draft?.titles).toEqual([]);
    store.setTitles(second, ["Clinic Hours"]);
    expect(store.getState().draft?.titles).toEqual(["Clinic Hours"]);
    expect(store.getState().titlesPending).toBe(false);
  });

  it("saves once and updates that same moodboard", () => {
    const store = new LocalMoodboardStore(memory());
    const token = store.applyGenerated(generated());
    store.setTitles(token, ["Site Prep"]);
    const saved = store.save();
    expect(saved?.query).toBe("Construction");
    expect(store.getState().saved).toHaveLength(1);
    store.setHarmony("triad");
    store.save();
    expect(store.getState().saved).toHaveLength(1);
    expect(store.getState().saved[0].harmony).toBe("triad");
    expect(store.getState().saved[0].id).toBe(saved?.id);
  });

  it("create new clears the draft and leaves the saved copy", () => {
    const store = new LocalMoodboardStore(memory());
    store.applyGenerated(generated());
    store.pin();
    store.save();
    store.createNew();
    expect(store.getState().draft).toBeNull();
    expect(store.getState().pinned).toBe(false);
    expect(store.getState().saved).toHaveLength(1);
  });

  it("opens a saved moodboard with its colours, harmony, and designs", () => {
    const store = new LocalMoodboardStore(memory());
    const token = store.applyGenerated(generated());
    store.setTitles(token, ["Site Prep"]);
    store.setOverride(0, "#112233");
    store.setHarmony("shades");
    store.addInspo("abc123");
    store.addInspo("abc123");
    store.save();
    store.createNew();
    store.open(store.getState().saved[0].id);
    const draft = store.getState().draft;
    expect(draft?.titles).toEqual(["Site Prep"]);
    expect(draft?.overrides["0"]).toBe("#112233");
    expect(draft?.harmony).toBe("shades");
    expect(draft?.inspoIds).toEqual(["abc123"]);
  });

  it("drops a saved moodboard without touching the one being edited", () => {
    const store = new LocalMoodboardStore(memory());
    store.applyGenerated(generated());
    const saved = store.save();
    store.removeSaved(saved!.id);
    expect(store.getState().saved).toEqual([]);
    expect(store.getState().draft?.query).toBe("Construction");
  });

  it("clears the working draft when nothing matches", () => {
    const store = new LocalMoodboardStore(memory());
    store.applyGenerated(generated());
    store.save();
    store.pin();
    store.miss("zzzzxq");
    expect(store.getState().draft).toBeNull();
    expect(store.getState().miss).toBe(true);
    expect(store.getState().pinned).toBe(false);
    expect(store.getState().saved).toHaveLength(1);
  });

  it("reloads the draft and the saved list from storage", () => {
    const storage = memory();
    const store = new LocalMoodboardStore(storage);
    const token = store.applyGenerated(generated());
    store.setTitles(token, ["Site Prep"]);
    store.save();
    const restored = new LocalMoodboardStore(storage);
    expect(restored.getState().draft?.query).toBe("Construction");
    expect(restored.getState().saved).toHaveLength(1);
    expect(restored.getState().pinned).toBe(false);
  });

  it("ignores corrupt storage", () => {
    const storage = memory();
    storage.setItem("template-taxonomy:moodboards:v1", "{");
    expect(new LocalMoodboardStore(storage).getState().draft).toBeNull();
  });
});
