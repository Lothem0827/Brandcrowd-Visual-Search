import type { BriefColorRole, DesignBrief } from "./brief";
import { nearestColorName, normalizeHex } from "./color";
import type { Template } from "./schema";

/**
 * Canvas board model for a Design brief workspace.
 *
 * Cards are plain data: the React Flow canvas only maps them to nodes and writes edits
 * back through these helpers, so placement, plugging and snapshot resolution stay pure
 * and unit-testable.
 *
 * There are no wires. A title, palette or tags card dropped near another compatible card
 * *plugs in*, and the pair becomes a single `brief` card holding one section per kind.
 * Dragging a section header back out ejects it as its own card again.
 */

/** Tags on a brief card never exceed this, even when the user adds their own. */
export const TAGS_LIMIT = 6;

/** How close (in flow units) two cards must be before a drop plugs them together. */
export const PLUG_RADIUS = 64;

export type BriefCardKind = "title" | "palette" | "tags" | "design" | "brief";

/** The sections a brief card can hold, in the order they render. */
export const BUNDLE_SECTIONS = ["title", "palette", "tags", "design"] as const;
export type BundleSection = (typeof BUNDLE_SECTIONS)[number];

export interface BriefSlot {
  hex: string;
  name: string;
}

export interface BriefAnchor {
  name: string;
  share: number;
}

interface CardBase {
  id: string;
  x: number;
  y: number;
}

export interface TitleCard extends CardBase {
  kind: "title";
  text: string;
}

/** The reusable palette payload, shared by loose palette cards and brief sections. */
export interface BriefPalette {
  /** exactly four slots in main -> secondary -> accent -> ink order */
  slots: BriefSlot[];
  anchor: BriefAnchor;
  /** human label for the card header, e.g. "Construction palette" */
  label: string;
  /** seeded variation of an existing colour story, not new data */
  variation: boolean;
}

export interface PaletteCard extends CardBase, BriefPalette {
  kind: "palette";
}

export interface TagsCard extends CardBase {
  kind: "tags";
  tags: string[];
}

export interface DesignCard extends CardBase {
  kind: "design";
  templateId: string;
  title: string;
  image: string;
  /** the design's own extracted colours, usable as drag sources */
  palette: BriefSlot[];
}

/**
 * A plugged card: one title, one palette, one tag set and any inspiration, stacked in a
 * single node. This is what the user names and saves.
 */
export interface BriefBundleCard extends CardBase {
  kind: "brief";
  name: string;
  title: string | null;
  palette: BriefPalette | null;
  tags: string[] | null;
  designs: DesignCard[];
}

export type BriefCard = TitleCard | PaletteCard | TagsCard | DesignCard | BriefBundleCard;

/** Cards that can plug into (or be plugged into by) another card on drop. */
export type PlugLeaf = TitleCard | PaletteCard | TagsCard;

export interface BriefDraft {
  id: string;
  query: string;
  label: string;
  templates: number;
  cards: BriefCard[];
  /** last variation seed handed to the generator; "Add more" increments it */
  seed?: number;
  createdAt: number;
  updatedAt: number;
}

/** Fixed slot order; labels stay positional when colours are dragged around. */
export const SLOT_LABELS = ["Main", "Secondary", "Accent", "Ink"] as const;
export type SlotLabel = (typeof SLOT_LABELS)[number];

export const ROLE_FOR_SLOT: Record<number, BriefColorRole> = {
  0: "main",
  1: "secondary",
  2: "accent",
  3: "ink",
};

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

/** Vertical lanes: titles, palettes, and a right-hand column for tags + inspiration. */
export const LANE = { title: 0, palette: 320, side: 660 } as const;
/** One option row: a title card beside its palette card. */
export const ROW_HEIGHT = 340;
/** Space reserved by each generated batch so appended batches never overlap. */
export const BATCH_SPAN = 1120;

export const CARD_SIZE: Record<BriefCardKind, { w: number; h: number }> = {
  title: { w: 280, h: 120 },
  palette: { w: 280, h: 300 },
  tags: { w: 280, h: 190 },
  design: { w: 240, h: 360 },
  brief: { w: 340, h: 520 },
};

/** Gap left between a bundle and a section ejected out of it. */
const EJECT_GAP = 24;

let counter = 0;
/** Stable-enough unique id; persistence only needs uniqueness, not reproducibility. */
export function makeId(prefix: string): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

const slotOf = (hex: string, name: string): BriefSlot => ({ hex, name });

/* ------------------------------------------------------------------ */
/* Creating cards                                                      */
/* ------------------------------------------------------------------ */

/** Cards for one generated batch, placed in its own band of the canvas. */
export function cardsFromBrief(
  brief: DesignBrief,
  batchIndex: number,
  startY?: number,
): BriefCard[] {
  const y0 = startY ?? Math.max(0, batchIndex) * BATCH_SPAN;
  const label = brief.match.label;
  const cards: BriefCard[] = [];
  brief.options.forEach((option, index) => {
    cards.push({
      id: makeId("title"),
      kind: "title",
      x: LANE.title,
      y: y0 + index * ROW_HEIGHT,
      text: option.title,
    });
    cards.push({
      id: makeId("palette"),
      kind: "palette",
      x: LANE.palette,
      y: y0 + index * ROW_HEIGHT,
      slots: option.palette.map((color) => slotOf(color.hex, color.name)),
      anchor: { name: option.anchor.name, share: option.anchor.share },
      label: `${label} palette`,
      variation: !!option.variation,
    });
  });
  // One shared tag card per batch: tags are common to every option.
  cards.push({
    id: makeId("tags"),
    kind: "tags",
    x: LANE.side,
    y: y0,
    tags: brief.tags.slice(0, TAGS_LIMIT),
  });
  return cards;
}

export function designCard(template: Template, x: number, y: number): DesignCard {
  return {
    id: makeId("design"),
    kind: "design",
    x,
    y,
    templateId: template.templateId,
    title: template.displayTitle || template.name,
    image: template.thumbnailImage,
    palette: template.colors.map((color) => slotOf(color.hex, color.name ?? "")),
  };
}

/** An empty brief card, ready for the user to plug sections into. */
export function emptyBundle(x: number, y: number, name = ""): BriefBundleCard {
  return {
    id: makeId("brief"),
    kind: "brief",
    x,
    y,
    name,
    title: null,
    palette: null,
    tags: null,
    designs: [],
  };
}

/* ------------------------------------------------------------------ */
/* Reading cards                                                       */
/* ------------------------------------------------------------------ */

export const isLeaf = (card: BriefCard | undefined): card is PlugLeaf =>
  !!card && (card.kind === "title" || card.kind === "palette" || card.kind === "tags");

export const isBundle = (card: BriefCard | undefined): card is BriefBundleCard =>
  !!card && card.kind === "brief";

const paletteOf = (card: BriefCard): BriefPalette | null => {
  if (card.kind === "palette") {
    return {
      slots: card.slots,
      anchor: card.anchor,
      label: card.label,
      variation: card.variation,
    };
  }
  return card.kind === "brief" ? card.palette : null;
};

/** Which sections are currently filled, so the node can render only those. */
export function bundleSections(bundle: BriefBundleCard): BundleSection[] {
  const sections: BundleSection[] = [];
  if (bundle.title !== null) sections.push("title");
  if (bundle.palette) sections.push("palette");
  if (bundle.tags) sections.push("tags");
  if (bundle.designs.length) sections.push("design");
  return sections;
}

/** A bundle with nothing plugged in yet is a blank slate, not a brief. */
export const isEmptyBundle = (bundle: BriefBundleCard) => bundleSections(bundle).length === 0;

/* ------------------------------------------------------------------ */
/* Plug rules                                                          */
/* ------------------------------------------------------------------ */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Shortest distance between two rectangles; 0 when they overlap. */
export function rectGap(a: Rect, b: Rect): number {
  const dx = Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w));
  const dy = Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h));
  return Math.hypot(dx, dy);
}

/**
 * Whether a dropped card can fuse with the card it landed on.
 *
 * Only title / palette / tags leaves and brief cards take part: two briefs never merge
 * (that would silently destroy a saved composition), and inspiration only ever appends
 * to a brief.
 */
export function canPlug(dragged: BriefCard | undefined, host: BriefCard | undefined): boolean {
  if (!dragged || !host || dragged.id === host.id) return false;
  if (isLeaf(dragged) && isLeaf(host)) return true;
  if (isLeaf(dragged) && isBundle(host)) return true;
  if (isBundle(dragged) && isLeaf(host)) return true;
  if (dragged.kind === "design" && isBundle(host)) return true;
  return false;
}

/** Cards the dragged card could plug into (geometry is decided by the canvas). */
export function plugTargets(cards: BriefCard[], draggedId: string): BriefCard[] {
  const dragged = cards.find((card) => card.id === draggedId);
  if (!dragged) return [];
  return cards.filter((card) => canPlug(dragged, card));
}

/** The section a card contributes when it plugs in. */
const sectionOf = (card: BriefCard): BundleSection | null =>
  card.kind === "title" || card.kind === "palette" || card.kind === "tags"
    ? card.kind
    : card.kind === "design"
      ? "design"
      : null;

interface MergeResult {
  bundle: BriefBundleCard;
  /** a previously plugged section that the newcomer replaced */
  displaced: BriefCard | null;
}

/** Fold one card into a bundle, one slot per kind. */
function mergeInto(bundle: BriefBundleCard, card: BriefCard, eject: { x: number; y: number }): MergeResult {
  switch (card.kind) {
    case "title":
      return {
        bundle: { ...bundle, title: card.text },
        displaced: bundle.title === null ? null : ejectLeaf(bundle, "title", eject),
      };
    case "palette":
      return {
        bundle: { ...bundle, palette: paletteOf(card) },
        displaced: bundle.palette === null ? null : ejectLeaf(bundle, "palette", eject),
      };
    case "tags":
      return {
        bundle: { ...bundle, tags: card.tags },
        displaced: bundle.tags === null ? null : ejectLeaf(bundle, "tags", eject),
      };
    case "design":
      return {
        bundle: bundle.designs.some((design) => design.templateId === card.templateId)
          ? bundle
          : { ...bundle, designs: [...bundle.designs, card] },
        displaced: null,
      };
    default:
      return { bundle, displaced: null };
  }
}

/** Build the loose card for one section of a bundle. */
function ejectLeaf(
  bundle: BriefBundleCard,
  section: Exclude<BundleSection, "design">,
  at: { x: number; y: number },
): BriefCard | null {
  switch (section) {
    case "title":
      return bundle.title === null
        ? null
        : { id: makeId("title"), kind: "title", x: at.x, y: at.y, text: bundle.title };
    case "palette":
      return bundle.palette
        ? { id: makeId("palette"), kind: "palette", x: at.x, y: at.y, ...bundle.palette }
        : null;
    case "tags":
      return bundle.tags
        ? { id: makeId("tags"), kind: "tags", x: at.x, y: at.y, tags: bundle.tags }
        : null;
  }
}

const clearSection = (bundle: BriefBundleCard, section: BundleSection): BriefBundleCard => {
  switch (section) {
    case "title":
      return { ...bundle, title: null };
    case "palette":
      return { ...bundle, palette: null };
    case "tags":
      return { ...bundle, tags: null };
    case "design":
      return { ...bundle, designs: [] };
  }
};

/**
 * Plug `draggedId` into `hostId`.
 *
 * The host keeps its position; when both cards are leaves the one dropped *onto* becomes
 * the host. A newcomer replaces an existing section of the same kind, and the replaced
 * section pops out beside the bundle so nothing is silently destroyed.
 */
export function plugInto(cards: BriefCard[], draggedId: string, hostId: string): BriefCard[] {
  const dragged = cards.find((card) => card.id === draggedId);
  const target = cards.find((card) => card.id === hostId);
  if (!canPlug(dragged, target) || !dragged || !target) return cards;

  // A bundle always hosts, so plugging into one never relocates the composition.
  const host = isBundle(target) ? target : isBundle(dragged) ? dragged : target;
  const incoming = host.id === dragged.id ? target : dragged;
  if (!sectionOf(incoming)) return cards;

  const hostBundle = isBundle(host) ? host : isLeaf(host) ? bundleFromLeaf(host) : null;
  if (!hostBundle) return cards;

  const ejectAt = { x: host.x + CARD_SIZE.brief.w + EJECT_GAP, y: host.y };
  const { bundle, displaced } = mergeInto(hostBundle, incoming, ejectAt);

  const removed = new Set([dragged.id, target.id]);
  const rest = cards.filter((card) => !removed.has(card.id));
  return displaced ? [...rest, bundle, displaced] : [...rest, bundle];
}

function bundleFromLeaf(card: PlugLeaf): BriefBundleCard {
  const base = emptyBundle(card.x, card.y);
  if (card.kind === "title") return { ...base, id: card.id, title: card.text };
  if (card.kind === "palette") return { ...base, id: card.id, palette: paletteOf(card) };
  return { ...base, id: card.id, tags: card.tags };
}

/**
 * Take one section out of a bundle and drop it at `x`, `y`.
 *
 * A bundle with nothing left is removed. Ejecting inspiration releases every design in
 * the section, stacked so they do not pile up in one spot.
 */
export function ejectSection(
  cards: BriefCard[],
  bundleId: string,
  section: BundleSection,
  x: number,
  y: number,
): BriefCard[] {
  const bundle = cards.find((card) => card.id === bundleId);
  if (!isBundle(bundle)) return cards;

  const ejected: BriefCard[] = [];
  if (section === "design") {
    const step = CARD_SIZE.design.h + EJECT_GAP;
    bundle.designs.forEach((design, index) => {
      ejected.push({ ...design, x, y: y + index * step });
    });
  } else {
    const leaf = ejectLeaf(bundle, section, { x, y });
    if (leaf) ejected.push(leaf);
  }
  if (!ejected.length) return cards;

  const trimmed = clearSection(bundle, section);
  const rest = cards.filter((card) => card.id !== bundle.id);
  return isEmptyBundle(trimmed) ? [...rest, ...ejected] : [...rest, trimmed, ...ejected];
}

/** Drop a card and keep the rest (there are no edges to clean up any more). */
export function removeCards(cards: BriefCard[], ids: string[]): BriefCard[] {
  const gone = new Set(ids);
  return cards.filter((card) => !gone.has(card.id));
}

/* ------------------------------------------------------------------ */
/* Snapshots                                                           */
/* ------------------------------------------------------------------ */

export interface BriefSnapshot {
  name: string;
  title: string | null;
  palette: BriefSlot[] | null;
  tags: string[] | null;
  designIds: string[];
}

/**
 * Resolve what a brief card currently represents. Missing sections stay null, so saving
 * a partial brief is allowed.
 */
export function snapshotOfBundle(cards: BriefCard[], bundleId: string): BriefSnapshot | null {
  const bundle = cards.find((card) => card.id === bundleId);
  if (!isBundle(bundle)) return null;
  return {
    name: bundle.name,
    title: bundle.title,
    palette: bundle.palette?.slots ?? null,
    tags: bundle.tags,
    designIds: bundle.designs.map((design) => design.templateId),
  };
}

/** Plain-text brief used by every "Copy" affordance and the delivered library item. */
export function formatSnapshot(snapshot: BriefSnapshot, label: string): string {
  const lines = [`${label || "Design"} design brief`];
  if (snapshot.name) lines.push(`Name: ${snapshot.name}`);
  lines.push(`Title: ${snapshot.title ?? "(none)"}`);
  lines.push(
    `Palette: ${snapshot.palette?.map((slot) => slot.hex).join(" ") ?? "(none)"}`,
  );
  lines.push(`Tags: ${snapshot.tags?.join(", ") ?? "(none)"}`);
  if (snapshot.designIds.length) lines.push(`Inspiration: ${snapshot.designIds.join(", ")}`);
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Migration + rehydration                                             */
/* ------------------------------------------------------------------ */

interface LegacyEdge {
  source: string;
  target: string;
  targetHandle?: string;
}

interface LegacyFinalCard {
  id: string;
  kind: "final";
  x: number;
  y: number;
  name: string;
}

export interface LegacyDraft {
  id: string;
  query: string;
  label: string;
  templates: number;
  cards: (BriefCard | LegacyFinalCard)[];
  edges?: LegacyEdge[];
  seed?: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Rewrite a wired draft (final nodes + edges) into plugged brief cards.
 *
 * Everything wired to a final folds into one bundle at that final's position; leaves that
 * were never wired stay loose. Title -> palette edges only ever meant "these belong
 * together", so they are simply dropped.
 */
export function migrateLegacyDraft(draft: LegacyDraft): BriefDraft {
  const cards = draft.cards;
  const finals = cards.filter((card): card is LegacyFinalCard => card.kind === "final");
  const edges = draft.edges ?? [];
  const base = {
    id: draft.id,
    query: draft.query,
    label: draft.label,
    templates: draft.templates,
    seed: draft.seed,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  };
  if (!finals.length) return { ...base, cards: cards.filter((card) => card.kind !== "final") as BriefCard[] };

  const consumed = new Set<string>();
  const bundles = finals.map((final) => {
    let bundle: BriefBundleCard = {
      id: final.id,
      kind: "brief",
      x: final.x,
      y: final.y,
      name: final.name ?? "",
      title: null,
      palette: null,
      tags: null,
      designs: [],
    };
    // Edges are in creation order, so a later one wins exactly as it did before.
    for (const edge of edges) {
      if (edge.target !== final.id) continue;
      const card = cards.find((candidate) => candidate.id === edge.source);
      if (!card || card.kind === "final") continue;
      const merged = mergeInto(bundle, card, { x: bundle.x, y: bundle.y });
      bundle = merged.bundle;
      consumed.add(card.id);
    }
    return bundle;
  });

  const loose = cards.filter(
    (card) => card.kind !== "final" && !consumed.has(card.id),
  ) as BriefCard[];
  return { ...base, cards: [...loose, ...bundles] };
}

/** Saved briefs satisfy this shape, so rebuilding a draft never needs the store type. */
export interface SavedBriefLike {
  name: string;
  label: string;
  title: string | null;
  palette: BriefSlot[] | null;
  tags: string[] | null;
  designIds: string[];
}

/** Rebuild a saved brief as one plugged card (used when its draft is gone). */
export function bundleFromSaved(item: SavedBriefLike, x = 0, y = 0): BriefBundleCard {
  return {
    ...emptyBundle(x, y, item.name),
    title: item.title,
    palette: item.palette
      ? {
          slots: item.palette,
          anchor: { name: item.label, share: 0 },
          label: `${item.label} palette`,
          variation: false,
        }
      : null,
    tags: item.tags,
    designs: item.designIds.map((templateId) => ({
      id: makeId("design"),
      kind: "design" as const,
      x,
      y,
      templateId,
      title: "Saved inspiration",
      image: "",
      palette: [],
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Edits                                                               */
/* ------------------------------------------------------------------ */

export function patchCard<T extends BriefCard>(
  cards: BriefCard[],
  id: string,
  fn: (card: T) => T,
): BriefCard[] {
  return cards.map((card) => (card.id === id ? fn(card as T) : card));
}

export function moveCard(cards: BriefCard[], id: string, x: number, y: number): BriefCard[] {
  return cards.map((card) => (card.id === id ? { ...card, x, y } : card));
}

/** Replace one palette slot without disturbing the others. */
export function replaceSlot(card: PaletteCard, index: number, slot: BriefSlot): PaletteCard {
  if (index < 0 || index >= card.slots.length) return card;
  return { ...card, slots: card.slots.map((current, i) => (i === index ? slot : current)) };
}

export function moveSlot(card: PaletteCard, from: number, to: number): PaletteCard {
  if (from === to || from < 0 || to < 0 || from >= card.slots.length || to >= card.slots.length) {
    return card;
  }
  const slots = [...card.slots];
  const [moved] = slots.splice(from, 1);
  slots.splice(to, 0, moved);
  return { ...card, slots };
}

/**
 * Apply a dragged colour to a slot list:
 *
 * - dragged within the same card -> reorder;
 * - the colour already exists in this card -> swap the two slots (no duplicates);
 * - otherwise the target slot is replaced and the source card is left untouched.
 */
export function dropColorInto(
  slots: BriefSlot[],
  targetIndex: number,
  color: BriefSlot,
  sourceKey: string,
  sourceIndex: number,
  targetKey: string,
): BriefSlot[] {
  if (targetIndex < 0 || targetIndex >= slots.length) return slots;
  if (sourceKey === targetKey) {
    if (sourceIndex === targetIndex || sourceIndex < 0 || sourceIndex >= slots.length) return slots;
    const next = [...slots];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    return next;
  }
  const existing = slots.findIndex((slot) => slot.hex === color.hex);
  if (existing >= 0) {
    const next = [...slots];
    next[existing] = slots[targetIndex];
    next[targetIndex] = slots[existing];
    return next;
  }
  return slots.map((slot, index) => (index === targetIndex ? { hex: color.hex, name: color.name } : slot));
}

/** Palette-card form of `dropColorInto`, kept for the loose palette node and its tests. */
export function dropColor(
  card: PaletteCard,
  targetIndex: number,
  color: BriefSlot,
  sourceCardId: string,
  sourceIndex: number,
): PaletteCard {
  const slots = dropColorInto(card.slots, targetIndex, color, sourceCardId, sourceIndex, card.id);
  return slots === card.slots ? card : { ...card, slots };
}

/** Where a colour edit lands: a loose palette card or the palette inside a brief. */
export const paletteSlots = (card: BriefCard | undefined): BriefSlot[] | null => {
  if (!card) return null;
  if (card.kind === "palette") return card.slots;
  return card.kind === "brief" ? (card.palette?.slots ?? null) : null;
};

/** A palette slot selected for editing (on a loose palette or inside a brief). */
export interface ArmedSlot {
  cardId: string;
  index: number;
}

/**
 * Write one colour into a palette slot, on a loose palette card or inside a brief.
 *
 * Shared by every manual path (spectrum, hex field, named swatch) and by the eyedropper, so
 * they can never disagree about naming, ordering or which card they hit. Unknown ids and
 * out-of-range indexes return the list untouched, which keeps live-preview writes cheap.
 */
export function setSlot(cards: BriefCard[], cardId: string, index: number, hex: string): BriefCard[] {
  const clean = normalizeHex(hex);
  if (!clean) return cards;
  const target = cards.find((card) => card.id === cardId);
  const slots = paletteSlots(target);
  if (!slots || index < 0 || index >= slots.length) return cards;
  const slot: BriefSlot = { hex: clean, name: nearestColorName(clean) };

  return cards.map((card) => {
    if (card.id !== cardId || !paletteSlots(card)) return card;
    if (card.kind === "palette") {
      return { ...card, slots: card.slots.map((current, i) => (i === index ? slot : current)) };
    }
    if (card.kind === "brief" && card.palette) {
      return {
        ...card,
        palette: {
          ...card.palette,
          slots: card.palette.slots.map((current, i) => (i === index ? slot : current)),
        },
      };
    }
    return card;
  });
}

/** Toggle a tag on or off, refusing to grow past the cap. */
export function toggleTag(tags: string[], tag: string): string[] {
  const key = tag.trim();
  if (!key) return tags;
  const has = tags.some((current) => current.toLowerCase() === key.toLowerCase());
  if (has) return tags.filter((t) => t.toLowerCase() !== key.toLowerCase());
  if (tags.length >= TAGS_LIMIT) return tags;
  return [...tags, key];
}

/** Add a user-typed tag (normalised, deduped, capped). Returns null when nothing changes. */
export function addCustomTag(tags: string[], raw: string): string[] | null {
  const tag = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!tag) return null;
  if (tags.some((current) => current.toLowerCase() === tag)) return null;
  if (tags.length >= TAGS_LIMIT) return null;
  return [...tags, tag];
}

/** Cards get a palette from the generator or from a design, so both are drag sources. */
export function dragPayload(
  hex: string,
  name: string,
  cardId: string,
  index: number,
): string {
  return JSON.stringify({ hex, name, cardId, index });
}

export function readDragPayload(raw: string): {
  hex: string;
  name: string;
  cardId: string;
  index: number;
} | null {
  try {
    const parsed = JSON.parse(raw) as Partial<BriefSlot & { cardId: string; index: number }>;
    if (typeof parsed.hex !== "string" || typeof parsed.cardId !== "string") return null;
    return {
      hex: parsed.hex,
      name: typeof parsed.name === "string" ? parsed.name : "",
      cardId: parsed.cardId,
      index: typeof parsed.index === "number" ? parsed.index : 0,
    };
  } catch {
    return null;
  }
}

/** A section header being dragged out of a bundle. */
export function sectionPayload(cardId: string, section: BundleSection): string {
  return JSON.stringify({ cardId, section });
}

export function readSectionPayload(raw: string): {
  cardId: string;
  section: BundleSection;
} | null {
  try {
    const parsed = JSON.parse(raw) as { cardId?: unknown; section?: unknown };
    if (typeof parsed.cardId !== "string") return null;
    if (!BUNDLE_SECTIONS.includes(parsed.section as BundleSection)) return null;
    return { cardId: parsed.cardId, section: parsed.section as BundleSection };
  } catch {
    return null;
  }
}

/** A design dragged out of the inspiration panel. */
export const INSPO_MIME = "text/brief-inspo";

export function inspoPayload(templateId: string): string {
  return JSON.stringify({ templateId });
}

export function readInspoPayload(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as { templateId?: unknown };
    return typeof parsed.templateId === "string" && parsed.templateId ? parsed.templateId : null;
  } catch {
    return null;
  }
}

/**
 * Land an inspiration design on the board.
 *
 * Dropping it on a brief appends it to that brief's Inspiration section; anywhere else it
 * becomes a loose inspiration card at `x`/`y`. A design already on the board is moved (and
 * plugged in) rather than duplicated, so dropping the same tile twice cannot create twins.
 */
export function addInspiration(
  cards: BriefCard[],
  design: DesignCard,
  targetId: string | null,
  x: number,
  y: number,
): BriefCard[] {
  const moved: DesignCard = { ...design, x, y };

  const loose = cards.find(
    (card): card is DesignCard => card.kind === "design" && card.templateId === design.templateId,
  );
  const owner = cards.find(
    (card): card is BriefBundleCard =>
      card.kind === "brief" && card.designs.some((d) => d.templateId === design.templateId),
  );

  // Already inside a brief: stay put, move between briefs, or pop back out loose.
  if (owner) {
    if (owner.id === targetId) return cards;
    const stripped = cards.map((card) =>
      card.id === owner.id && card.kind === "brief"
        ? { ...card, designs: card.designs.filter((d) => d.templateId !== design.templateId) }
        : card,
    );
    const card: DesignCard = { ...moved, id: design.id };
    return targetId ? plugInto([...stripped, card], card.id, targetId) : [...stripped, card];
  }

  // Already loose on the board: reuse that card so dropping the same tile cannot twin it.
  if (loose) {
    const next = cards.map((card) => (card.id === loose.id ? { ...moved, id: loose.id } : card));
    return targetId ? plugInto(next, loose.id, targetId) : next;
  }

  const next = [...cards, moved];
  if (!targetId) return next;
  const plugged = plugInto(next, moved.id, targetId);
  // Dropping onto a card that cannot host it falls back to a loose inspiration card.
  return plugged === next ? next : plugged;
}

