import { describe, expect, it } from "vitest";
import {
  cardsFromBrief,
  emptyBundle,
  plugInto,
  type BriefBundleCard,
  type BriefCard,
} from "./brief-board";
import { generateBrief, type DesignBrief } from "./brief";
import { LocalBriefStore, SAVED_KEY } from "./briefs";
import fixture from "../../tests/fixtures/templates.fixture.json";
import { parseTemplates } from "./schema";

const { templates } = parseTemplates(fixture);
const generated = generateBrief(templates, "Construction", 2);
if (!generated) throw new Error("fixture should produce a brief");
// Narrowed into a typed constant so hoisted helpers below can use it.
const brief: DesignBrief = generated;

/** Minimal in-memory Storage so each test is isolated. */
function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

/** A draft with one plugged brief holding a title and a palette. */
function seededStore() {
  const store = new LocalBriefStore(memoryStorage());
  const draft = store.createDraft({
    query: brief.query,
    label: brief.match.label,
    templates: brief.match.templates,
  });
  const leaves = cardsFromBrief(brief, 0);
  const title = leaves.find((card) => card.kind === "title");
  const palette = leaves.find((card) => card.kind === "palette");
  if (!title || !palette) throw new Error("missing leaves");
  const cards = plugInto(leaves, title.id, palette.id);
  const bundle = cards.find((card): card is BriefBundleCard => card.kind === "brief");
  if (!bundle) throw new Error("missing brief");
  store.patchDraft(draft.id, { cards });
  return { store, draft, cards, bundleId: bundle.id };
}

describe("LocalBriefStore", () => {
  it("persists drafts, cards and the active draft", () => {
    const storage = memoryStorage();
    const store = new LocalBriefStore(storage);
    const draft = store.createDraft({ query: "Construction", label: "Construction", templates: 3 });
    store.patchDraft(draft.id, { cards: cardsFromBrief(brief, 0) });

    const reloaded = new LocalBriefStore(storage);
    const loaded = reloaded.getDraft(draft.id);
    expect(loaded?.cards.length).toBe(draft.cards.length + brief.options.length * 2 + 1);
    expect(reloaded.activeDraftId()).toBe(draft.id);
  });

  it("ignores corrupt payloads instead of throwing", () => {
    const storage = memoryStorage();
    storage.setItem("template-taxonomy:briefs:v1", "{not json");
    storage.setItem(SAVED_KEY, "42");
    const store = new LocalBriefStore(storage);
    expect(store.listDrafts()).toEqual([]);
    expect(store.listSaved()).toEqual([]);
  });

  it("snapshots a plugged brief and re-saves the same brief in place", () => {
    const { store, draft, bundleId } = seededStore();

    const first = store.saveSnapshot(draft.id, bundleId, "Construction launch");
    expect(first?.name).toBe("Construction launch");
    expect(first?.palette).toHaveLength(4);
    expect(first?.title).toBeTruthy();

    const second = store.saveSnapshot(draft.id, bundleId, "Renamed launch");
    expect(store.listSaved()).toHaveLength(1);
    expect(second?.id).toBe(first?.id);
    expect(store.listSaved()[0].name).toBe("Renamed launch");
  });

  it("never rewrites an existing snapshot when the draft changes later", () => {
    const { store, draft, cards, bundleId } = seededStore();
    const saved = store.saveSnapshot(draft.id, bundleId, "Snapshot");
    const originalTitle = saved?.title;

    store.patchDraft(draft.id, {
      cards: cards.map((card) =>
        card.id === bundleId && card.kind === "brief" ? { ...card, title: "Edited later" } : card,
      ),
    });

    expect(store.listSaved()[0].title).toBe(originalTitle);
    expect(store.listSaved()[0].title).not.toBe("Edited later");
  });

  it("allows a partial snapshot and falls back to a usable name", () => {
    const { store, draft, cards } = seededStore();
    const blank = emptyBundle(0, 0, "");
    store.patchDraft(draft.id, { cards: [...cards, blank] });

    const saved = store.saveSnapshot(draft.id, blank.id, "   ");
    expect(saved?.tags).toBeNull();
    expect(saved?.name).toBe(brief.match.label);
    expect(saved?.palette).toBeNull();
  });

  it("rejects saving against a missing draft or brief", () => {
    const { store, draft } = seededStore();
    expect(store.saveSnapshot("nope", "nope", "x")).toBeNull();
    expect(store.saveSnapshot(draft.id, "nope", "x")).toBeNull();
  });

  it("removes drafts and saved briefs independently", () => {
    const { store, draft, bundleId } = seededStore();
    const saved = store.saveSnapshot(draft.id, bundleId, "Keep me");
    store.removeDraft(draft.id);
    expect(store.getDraft(draft.id)).toBeUndefined();
    expect(store.listSaved()).toHaveLength(1);
    store.removeSaved(saved!.id);
    expect(store.listSaved()).toHaveLength(0);
  });

  it("migrates legacy drafts with final cards and edges on load", () => {
    const storage = memoryStorage();
    const legacyCards: BriefCard[] = cardsFromBrief(brief, 0);
    const title = legacyCards.find((card) => card.kind === "title");
    const palette = legacyCards.find((card) => card.kind === "palette");
    if (!title || !palette) throw new Error("missing leaves");
    storage.setItem(
      "template-taxonomy:briefs:v1",
      JSON.stringify([
        {
          id: "legacy",
          query: brief.query,
          label: brief.match.label,
          templates: brief.match.templates,
          createdAt: 0,
          updatedAt: 0,
          cards: [
            ...legacyCards,
            { id: "final_1", kind: "final", x: 800, y: 0, name: "Old brief" },
          ],
          edges: [
            { id: "e1", source: title.id, target: "final_1", targetHandle: "in-title" },
            { id: "e2", source: palette.id, target: "final_1", targetHandle: "in-palette" },
          ],
        },
      ]),
    );

    const store = new LocalBriefStore(storage);
    const [draft] = store.listDrafts();
    const bundle = draft.cards.find((card): card is BriefBundleCard => card.kind === "brief");
    expect(draft.cards.some((card) => (card as { kind: string }).kind === "final")).toBe(false);
    expect(bundle?.name).toBe("Old brief");
    expect(bundle?.title).toBe(title.kind === "title" ? title.text : null);
    expect(bundle?.palette?.slots).toHaveLength(4);
    expect(store.saveSnapshot(draft.id, bundle!.id, "Migrated")?.title).toBe(bundle?.title);
  });

  it("notifies subscribers on every commit", () => {
    const store = new LocalBriefStore(memoryStorage());
    let calls = 0;
    const off = store.subscribe(() => calls++);
    const draft = store.createDraft({ query: "x", label: "x", templates: 0 });
    store.patchDraft(draft.id, { label: "y" });
    store.removeDraft(draft.id);
    off();
    store.createDraft({ query: "z", label: "z", templates: 0 });
    // createDraft commits and then marks itself active; removing an active draft
    // commits the list and then re-points the active id.
    expect(calls).toBe(5);
  });
});
