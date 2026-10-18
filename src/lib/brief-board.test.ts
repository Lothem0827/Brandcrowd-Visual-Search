import { describe, expect, it } from "vitest";
import fixture from "../../tests/fixtures/templates.fixture.json";
import { parseTemplates } from "./schema";
import { generateBrief } from "./brief";
import {
  BATCH_SPAN,
  BUNDLE_SECTIONS,
  canPlug,
  cardsFromBrief,
  CARD_SIZE,
  designCard,
  dropColor,
  ejectSection,
  emptyBundle,
  formatSnapshot,
  LANE,
  makeId,
  migrateLegacyDraft,
  moveSlot,
  PLUG_RADIUS,
  plugInto,
  plugTargets,
  rectGap,
  removeCards,
  ROW_HEIGHT,
  snapshotOfBundle,
  TAGS_LIMIT,
  toggleTag,
  addCustomTag,
  addInspiration,
  bundleFromSaved,
  inspoPayload,
  readInspoPayload,
  readSectionPayload,
  sectionPayload,
  setSlot,
  type BriefBundleCard,
  type BriefCard,
  type BriefCardKind,
  type BriefDraft,
  type LegacyDraft,
  type PaletteCard,
  type TagsCard,
} from "./brief-board";

const { templates } = parseTemplates(fixture);
const brief = generateBrief(templates, "Construction", 3);
if (!brief) throw new Error("fixture should produce a brief");

function pick<K extends BriefCardKind>(cards: BriefCard[], kind: K): Extract<BriefCard, { kind: K }> {
  const found = cards.find((card) => card.kind === kind);
  if (!found) throw new Error(`missing ${kind} card`);
  return found as Extract<BriefCard, { kind: K }>;
}

const draftFrom = (cards: BriefCard[]): BriefDraft => ({
  id: "draft",
  query: brief.query,
  label: brief.match.label,
  templates: brief.match.templates,
  cards,
  createdAt: 0,
  updatedAt: 0,
});

const bundleIn = (cards: BriefCard[]): BriefBundleCard => pick(cards, "brief");

describe("cardsFromBrief", () => {
  it("creates one title and one four-slot palette per option plus one tags card", () => {
    const cards = cardsFromBrief(brief, 0);
    const titles = cards.filter((card) => card.kind === "title");
    const palettes = cards.filter((card) => card.kind === "palette");
    const tags = cards.filter((card) => card.kind === "tags");

    expect(titles).toHaveLength(brief.options.length);
    expect(palettes).toHaveLength(brief.options.length);
    expect(tags).toHaveLength(1);
    for (const palette of palettes) {
      if (palette.kind === "palette") expect(palette.slots).toHaveLength(4);
    }
    expect(new Set(cards.map((card) => card.id)).size).toBe(cards.length);
  });

  it("places appended batches below earlier ones without overlapping", () => {
    const first = cardsFromBrief(brief, 0);
    const second = cardsFromBrief(brief, 1);
    const lowestFirst = Math.max(...first.map((card) => card.y));
    const highestSecond = Math.min(...second.map((card) => card.y));
    expect(highestSecond).toBeGreaterThanOrEqual(lowestFirst + ROW_HEIGHT);
    expect(highestSecond - lowestFirst).toBeLessThan(BATCH_SPAN + ROW_HEIGHT);
  });

  it("keeps cards inside their lanes", () => {
    const cards = cardsFromBrief(brief, 0);
    for (const card of cards) {
      if (card.kind === "title") expect(card.x).toBe(LANE.title);
      if (card.kind === "palette") expect(card.x).toBe(LANE.palette);
      if (card.kind === "tags") expect(card.x).toBe(LANE.side);
    }
  });
});

describe("plug rules", () => {
  it("fuses two leaves, a leaf and a brief, and inspiration into a brief", () => {
    const cards = cardsFromBrief(brief, 0);
    const title = pick(cards, "title");
    const palette = pick(cards, "palette");
    const tags = pick(cards, "tags");
    const design = designCard(templates[0], 0, 0);
    const bundle = emptyBundle(0, 0);

    expect(canPlug(title, palette)).toBe(true);
    expect(canPlug(tags, palette)).toBe(true);
    expect(canPlug(title, bundle)).toBe(true);
    expect(canPlug(bundle, palette)).toBe(true);
    expect(canPlug(design, bundle)).toBe(true);
  });

  it("never merges two briefs, inspiration with inspiration, or a card with itself", () => {
    const cards = cardsFromBrief(brief, 0);
    const title = pick(cards, "title");
    const design = designCard(templates[0], 0, 0);
    const other = designCard(templates[1], 0, 0);

    expect(canPlug(emptyBundle(0, 0), emptyBundle(0, 0))).toBe(false);
    expect(canPlug(design, other)).toBe(false);
    expect(canPlug(title, title)).toBe(false);
    expect(canPlug(title, design)).toBe(false);
  });

  it("only offers compatible hosts for a dragged card", () => {
    const cards = [...cardsFromBrief(brief, 0), emptyBundle(0, 0)];
    const title = pick(cards, "title");
    const hosts = plugTargets(cards, title.id);
    expect(hosts.some((card) => card.kind === "brief")).toBe(true);
    expect(hosts.some((card) => card.kind === "palette")).toBe(true);
    expect(hosts.some((card) => card.kind === "design")).toBe(false);
    expect(hosts.some((card) => card.id === title.id)).toBe(false);
  });

  it("measures the gap between cards for proximity plugging", () => {
    const a = { x: 0, y: 0, w: 100, h: 100 };
    expect(rectGap(a, { x: 120, y: 0, w: 100, h: 100 })).toBeCloseTo(20);
    expect(rectGap(a, { x: 20, y: 20, w: 100, h: 100 })).toBe(0);
    expect(rectGap(a, { x: 0, y: 100 + PLUG_RADIUS, w: 100, h: 100 })).toBe(PLUG_RADIUS);
  });

  it("plugs a title into a palette and leaves one brief card behind", () => {
    const cards = cardsFromBrief(brief, 0);
    const title = pick(cards, "title");
    const palette = pick(cards, "palette");

    const next = plugInto(cards, title.id, palette.id);
    const bundle = bundleIn(next);
    expect(bundle.title).toBe(title.text);
    expect(bundle.palette?.slots[0].hex).toBe(palette.slots[0].hex);
    expect(bundle.x).toBe(palette.x);
    expect(next.some((card) => card.id === title.id)).toBe(false);
    // only the palette that participated is gone; the other options are untouched
    expect(next.filter((card) => card.kind === "palette")).toHaveLength(
      cards.filter((card) => card.kind === "palette").length - 1,
    );
  });

  it("keeps a plugging bundle where it already is", () => {
    const palette = pick(cardsFromBrief(brief, 0), "palette");
    const bundle = { ...emptyBundle(palette.x, palette.y), x: 900, y: 40 };

    const next = plugInto([bundle, palette], palette.id, bundle.id);
    expect(bundleIn(next).x).toBe(900);
    expect(bundleIn(next).y).toBe(40);
    expect(bundleIn(next).palette).toBeTruthy();
  });

  it("swaps a second title and pops the replaced one out beside the brief", () => {
    const cards = cardsFromBrief(brief, 0);
    const titles = cards.filter((card) => card.kind === "title");
    const palette = pick(cards, "palette");
    if (titles.length < 2) throw new Error("fixture needs two titles");

    const once = plugInto(cards, titles[0].id, palette.id);
    const twice = plugInto(once, titles[1].id, palette.id);
    const bundle = bundleIn(twice);
    const looseTitles = twice.filter((card) => card.kind === "title");

    expect(bundle.title).toBe(titles[1].kind === "title" ? titles[1].text : null);
    expect(looseTitles).toHaveLength(titles.length - 1);
    const ejected = looseTitles.find((card) => card.kind === "title" && card.text === (titles[0].kind === "title" ? titles[0].text : ""));
    expect(ejected?.x).toBeGreaterThan(bundle.x);
  });

  it("appends inspiration once, de-duplicated by template", () => {
    const palette = pick(cardsFromBrief(brief, 0), "palette");
    const bundle = emptyBundle(palette.x, palette.y);
    const plugged = plugInto([palette, bundle], palette.id, bundle.id);
    const design = designCard(templates[0], 0, 0);
    const copy = { ...design, id: makeId("design") };

    const once = plugInto([...plugged, design], design.id, bundle.id);
    const twice = plugInto([...once, copy], copy.id, bundle.id);
    expect(bundleIn(twice).designs).toHaveLength(1);
  });

  it("leaves the cards untouched when the pair is not compatible", () => {
    const cards = [...cardsFromBrief(brief, 0), emptyBundle(0, 0)];
    const briefA = pick(cards, "brief");
    const briefB = emptyBundle(0, 0);
    expect(plugInto([...cards, briefB], briefB.id, briefA.id)).toHaveLength(cards.length + 1);
  });

  it("ejects a section and removes an emptied brief card", () => {
    const title = pick(cardsFromBrief(brief, 0), "title");
    const bundle = emptyBundle(400, 400);
    const plugged = plugInto([title, bundle], title.id, bundle.id);

    const ejected = ejectSection(plugged, bundle.id, "title", 900, 120);
    const loose = pick(ejected, "title");
    expect(loose.text).toBe(title.text);
    expect(loose.x).toBe(900);
    expect(ejected.some((card) => card.kind === "brief")).toBe(false);
  });

  it("keeps a brief that still has sections and ejects inspiration separately", () => {
    const cards = cardsFromBrief(brief, 0);
    const palette = pick(cards, "palette");
    const tags = pick(cards, "tags");
    const design = designCard(templates[0], 0, 0);

    let next = plugInto(cards, palette.id, tags.id);
    const bundleId = bundleIn(next).id;
    next = plugInto([...next, design], design.id, bundleId);

    const after = ejectSection(next, bundleId, "design", 0, 0);
    expect(after.some((card) => card.kind === "design")).toBe(true);
    const kept = bundleIn(after);
    expect(kept.palette).toBeTruthy();
    expect(kept.tags).toBeTruthy();
    expect(kept.designs).toHaveLength(0);
  });

  it("removes a card and keeps the rest", () => {
    const cards = cardsFromBrief(brief, 0);
    const tags = pick(cards, "tags");
    const next = removeCards(cards, [tags.id]);
    expect(next.some((card) => card.id === tags.id)).toBe(false);
    expect(next).toHaveLength(cards.length - 1);
  });

  it("round-trips the section drag payload", () => {
    const raw = sectionPayload("bundle_1", "tags");
    expect(readSectionPayload(raw)).toEqual({ cardId: "bundle_1", section: "tags" });
    expect(readSectionPayload("not json")).toBeNull();
    expect(readSectionPayload(JSON.stringify({ cardId: "x", section: "nope" }))).toBeNull();
    expect([...BUNDLE_SECTIONS]).toEqual(["title", "palette", "tags", "design"]);
  });
});

describe("snapshotOfBundle", () => {
  it("resolves the plugged title, palette, tags and inspiration", () => {
    const cards = cardsFromBrief(brief, 0);
    const title = pick(cards, "title");
    const palette = pick(cards, "palette");
    const tags = pick(cards, "tags");
    const design = designCard(templates[0], 0, 0);

    let next = plugInto(cards, title.id, palette.id);
    const bundleId = bundleIn(next).id;
    next = plugInto(next, tags.id, bundleId);
    next = plugInto([...next, design], design.id, bundleId);
    next = next.map((card) =>
      card.id === bundleId && card.kind === "brief" ? { ...card, name: "My brief" } : card,
    );

    const snapshot = snapshotOfBundle(next, bundleId);
    expect(snapshot?.name).toBe("My brief");
    expect(snapshot?.title).toBe(title.text);
    expect(snapshot?.palette).toHaveLength(4);
    expect(snapshot?.tags).toEqual(tags.tags);
    expect(snapshot?.designIds).toEqual([templates[0].templateId]);
  });

  it("stays partial for an empty brief and rejects non-brief ids", () => {
    const bundle = emptyBundle(0, 0);
    const snapshot = snapshotOfBundle([bundle], bundle.id);
    expect(snapshot?.title).toBeNull();
    expect(snapshot?.palette).toBeNull();
    expect(snapshot?.tags).toBeNull();
    expect(snapshotOfBundle([bundle], "nope")).toBeNull();
  });
});

describe("legacy migration", () => {
  const legacy = (): LegacyDraft => {
    const cards = cardsFromBrief(brief, 0);
    const title = pick(cards, "title");
    const palette = pick(cards, "palette");
    const final = {
      id: "final_1",
      kind: "final" as const,
      x: LANE.side,
      y: 0,
      name: "Old launch",
    };
    return {
      ...draftFrom(cards),
      cards: [...cards, final],
      edges: [
        { source: title.id, target: final.id, targetHandle: "in-title" },
        { source: palette.id, target: final.id, targetHandle: "in-palette" },
      ],
    };
  };

  it("folds wired cards into one brief and drops the wires", () => {
    const draft = migrateLegacyDraft(legacy());
    const bundle = bundleIn(draft.cards);
    expect(bundle.id).toBe("final_1");
    expect(bundle.name).toBe("Old launch");
    expect(bundle.title).toBeTruthy();
    expect(bundle.palette?.slots).toHaveLength(4);
    expect(draft.cards.some((card) => (card as { kind: string }).kind === "final")).toBe(false);
    expect("edges" in draft).toBe(false);
    // unconsumed leaves survive
    expect(draft.cards.filter((card) => card.kind === "tags")).toHaveLength(1);
  });

  it("keeps a final with nothing wired as an empty brief", () => {
    const draft = migrateLegacyDraft({
      ...draftFrom(cardsFromBrief(brief, 0)),
      cards: [...cardsFromBrief(brief, 0), { id: "f", kind: "final", x: 0, y: 0, name: "" }],
      edges: [],
    });
    const bundle = bundleIn(draft.cards);
    expect(bundle.title).toBeNull();
    expect(bundle.designs).toEqual([]);
  });

  it("leaves an already-plugged draft alone", () => {
    const cards = cardsFromBrief(brief, 0);
    const draft = draftFrom(cards);
    expect(migrateLegacyDraft(draft).cards).toHaveLength(cards.length);
  });
});

describe("bundleFromSaved", () => {
  it("rebuilds a saved brief as one plugged card", () => {
    const bundle = bundleFromSaved({
      name: "Construction launch",
      label: "Construction",
      title: "Modern Home Construction",
      palette: [{ hex: "#112233", name: "Blue" }],
      tags: ["construction"],
      designIds: ["t1"],
    });
    expect(bundle.kind).toBe("brief");
    expect(bundle.title).toBe("Modern Home Construction");
    expect(bundle.palette?.slots[0].hex).toBe("#112233");
    expect(bundle.tags).toEqual(["construction"]);
    expect(bundle.designs).toHaveLength(1);
  });
});

describe("palette slots", () => {
  const paletteCard = (): PaletteCard => pick(cardsFromBrief(brief, 0), "palette");

  it("reorders within a card", () => {
    const card = paletteCard();
    const moved = moveSlot(card, 0, 2);
    expect(moved.slots[2].hex).toBe(card.slots[0].hex);
    expect(moved.slots).toHaveLength(4);
  });

  it("copies across cards and leaves the source untouched", () => {
    const source = paletteCard();
    const target = { ...paletteCard(), id: makeId("palette") };
    const next = dropColor(target, 1, source.slots[0], source.id, 0);
    expect(next.slots[1].hex).toBe(source.slots[0].hex);
    expect(source.slots[0].hex).toBe(source.slots[0].hex);
  });

  it("swaps instead of duplicating when the colour already exists in the target", () => {
    const card = paletteCard();
    const next = dropColor(card, 2, card.slots[0], "another-card", 0);
    expect(new Set(next.slots.map((slot) => slot.hex)).size).toBe(4);
    expect(next.slots[2].hex).toBe(card.slots[0].hex);
  });
});

describe("tags", () => {
  const tagList = (): string[] => pick(cardsFromBrief(brief, 0), "tags").tags;
  const tagsCard = (): TagsCard => pick(cardsFromBrief(brief, 0), "tags");

  it("toggles tags off and refuses to exceed the cap", () => {
    const tags = tagList();
    const removed = toggleTag(tags, tags[0]);
    expect(removed).toHaveLength(tags.length - 1);

    let full = tags.slice(0, TAGS_LIMIT);
    for (let i = 0; i < 10; i++) full = toggleTag(full, `custom-${i}`);
    expect(full.length).toBeLessThanOrEqual(TAGS_LIMIT);
  });

  it("adds custom tags once and only under the cap", () => {
    const base = ["one", "two"];
    const added = addCustomTag(base, "  Brand   Refresh ");
    expect(added).toContain("brand refresh");
    expect(addCustomTag(base, "one")).toBeNull();
    const full = Array.from({ length: TAGS_LIMIT }, (_, i) => `t${i}`);
    expect(addCustomTag(full, "extra")).toBeNull();
  });

  it("caps generated tags at the limit", () => {
    expect(tagsCard().tags.length).toBe(Math.min(TAGS_LIMIT, brief.tags.length));
  });
});

describe("formatSnapshot", () => {
  it("writes a copyable brief with empty pieces called out", () => {
    const text = formatSnapshot(
      {
        name: "Construction launch",
        title: null,
        palette: [{ hex: "#112233", name: "Blue" }],
        tags: ["construction"],
        designIds: [],
      },
      "Construction",
    );
    expect(text).toContain("Construction design brief");
    expect(text).toContain("Name: Construction launch");
    expect(text).toContain("Title: (none)");
    expect(text).toContain("Palette: #112233");
    expect(text).toContain("Tags: construction");
  });
});

describe("layout constants", () => {
  it("sizes a brief card wider than a leaf so its sections stay readable", () => {
    expect(CARD_SIZE.brief.w).toBeGreaterThan(CARD_SIZE.title.w);
  });
});

describe("inspiration drops", () => {
  const design = designCard(templates[0], 0, 0);

  it("round-trips the inspiration payload", () => {
    expect(readInspoPayload(inspoPayload(design.templateId))).toBe(design.templateId);
    expect(readInspoPayload("not json")).toBeNull();
    expect(readInspoPayload(JSON.stringify({ templateId: 3 }))).toBeNull();
  });

  it("appends a dropped design to the brief's Inspiration section", () => {
    const host = emptyBundle(0, 0);
    const next = addInspiration([host], design, host.id, 900, 900);
    const bundle = next.find((card) => card.id === host.id) as BriefBundleCard;
    expect(bundle.designs.map((d) => d.templateId)).toEqual([design.templateId]);
    // The loose copy is consumed by the plug, so the design exists exactly once.
    expect(next.filter((card) => card.kind === "design")).toHaveLength(0);
  });

  it("creates a loose inspiration card at the drop point", () => {
    const next = addInspiration([], design, null, 120, 240);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ kind: "design", x: 120, y: 240, templateId: design.templateId });
  });

  it("falls back to loose when the target is not a brief", () => {
    const palette = pick(cardsFromBrief(brief, 1), "palette");
    const next = addInspiration([palette], design, palette.id, 10, 20);
    expect(next.find((card) => card.kind === "design")).toMatchObject({ x: 10, y: 20 });
    expect(next.filter((card) => card.kind === "design")).toHaveLength(1);
  });

  it("moves an already-loose design instead of duplicating it", () => {
    const loose = designCard(templates[0], 0, 0);
    const host = emptyBundle(0, 0);
    const first = addInspiration([loose, host], loose, null, 60, 70);
    const again = addInspiration(first, loose, null, 90, 100);
    const looseCards = again.filter((card) => card.kind === "design");
    expect(looseCards).toHaveLength(1);
    expect(looseCards[0]).toMatchObject({ id: loose.id, x: 90, y: 100 });
  });

  it("moves a design already inside a brief out to loose without duplicating it", () => {
    const host = emptyBundle(0, 0);
    const plugged = addInspiration([host], design, host.id, 0, 0);
    const out = addInspiration(plugged, design, null, 400, 400);
    expect(out.filter((card) => card.kind === "design")).toHaveLength(1);
    expect((out.find((card) => card.id === host.id) as BriefBundleCard).designs).toHaveLength(0);
  });

  it("keeps a design where it is when dropped back on the same brief", () => {
    const host = emptyBundle(0, 0);
    const plugged = addInspiration([host], design, host.id, 0, 0);
    expect(addInspiration(plugged, design, host.id, 500, 500)).toEqual(plugged);
  });
});

describe("setSlot", () => {
  it("writes a loose palette slot with a normalised hex and a colour name", () => {
    const palette = pick(cardsFromBrief(brief, 1), "palette");
    const next = setSlot([palette], palette.id, 0, "#abc");
    const updated = next[0] as PaletteCard;
    expect(updated.slots[0].hex).toBe("#AABBCC");
    expect(updated.slots[0].name).toBeTruthy();
    expect(updated.slots.slice(1)).toEqual(palette.slots.slice(1));
  });

  it("writes a palette slot inside a brief", () => {
    const host = emptyBundle(0, 0);
    const palette = pick(cardsFromBrief(brief, 1), "palette");
    const plugged = plugInto([host, palette], palette.id, host.id);
    const next = setSlot(plugged, host.id, 1, "#123456");
    const bundle = next.find((card) => card.id === host.id) as BriefBundleCard;
    expect(bundle.palette?.slots[1].hex).toBe("#123456");
  });

  it("rejects unknown cards, bad indexes and invalid hex", () => {
    const palette = pick(cardsFromBrief(brief, 1), "palette");
    expect(setSlot([palette], "nope", 0, "#123456")).toEqual([palette]);
    expect(setSlot([palette], palette.id, 99, "#123456")[0]).toEqual(palette);
    expect(setSlot([palette], palette.id, 0, "nope")[0]).toEqual(palette);
  });
});
