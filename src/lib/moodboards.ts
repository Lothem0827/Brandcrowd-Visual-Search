/**
 * Moodboard storage. The working draft and the saved list live in localStorage so the
 * Moodboard page and the pinned Explore panel share one draft. Pin state stays in memory.
 */
import { normalizeHex } from "./color";
import { HARMONIES, type HarmonyId } from "./harmony";
import {
  readTemplateDrag,
  TEMPLATE_DRAG_TYPE,
  writeTemplateDrag,
} from "./template-drag";

/** @deprecated Prefer TEMPLATE_DRAG_TYPE — kept for existing imports/tests. */
export const MOODBOARD_DRAG_TYPE = TEMPLATE_DRAG_TYPE;

const KEY = "template-taxonomy:moodboards:v1";
const TEMPLATE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const HARMONY_IDS = new Set<string>(HARMONIES.map((item) => item.id));

export interface MoodboardColor {
  hex: string;
  name: string;
  /** share of the coloured weight in this slice, 0..1 */
  share: number;
}

export interface MoodboardDraft {
  id: string;
  /** Typed subject. Also the name shown in the saved list. */
  query: string;
  titles: string[];
  tags: string[];
  colors: MoodboardColor[];
  selected: number;
  harmony: HarmonyId;
  /** Per-swatch hex edits, keyed by popular-colour index. */
  overrides: Record<string, string>;
  inspoIds: string[];
  updatedAt: number;
}

export interface MoodboardState {
  draft: MoodboardDraft | null;
  saved: MoodboardDraft[];
  pinned: boolean;
  titlesPending: boolean;
  /** The last generate found nothing in the catalogue. */
  miss: boolean;
  /** Text to keep in the field after a generate that matched nothing. Not saved. */
  attempt: string | null;
  /** Bumps when the field should remount from the draft. Not saved. */
  formEpoch: number;
}

export interface GeneratedMoodboard {
  query: string;
  tags: string[];
  colors: MoodboardColor[];
}

export const EMPTY_MOODBOARD_STATE: MoodboardState = {
  draft: null,
  saved: [],
  pinned: false,
  titlesPending: false,
  miss: false,
  attempt: null,
  formEpoch: 0,
};

function now() {
  return Date.now();
}

function createId() {
  return `mb_${now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  return text.slice(0, max);
}

function cleanList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  const list: string[] = [];
  for (const item of value) {
    const text = cleanText(item, maxLength);
    if (!text || list.includes(text)) continue;
    list.push(text);
    if (list.length >= maxItems) break;
  }
  return list;
}

/** Drop anything that is not a catalogue template id. */
export function cleanTemplateId(value: unknown): string | null {
  return typeof value === "string" && TEMPLATE_ID.test(value) ? value : null;
}

function normalizeDraft(value: unknown): MoodboardDraft | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<MoodboardDraft>;
  const id = cleanText(raw.id, 80);
  if (!id || !/^mb_[A-Za-z0-9_-]{1,76}$/.test(id)) return null;
  const query = cleanText(raw.query, 80);
  if (!query) return null;
  const colors: MoodboardColor[] = [];
  if (Array.isArray(raw.colors)) {
    for (const color of raw.colors) {
      if (!color || typeof color !== "object") continue;
      const hex = normalizeHex((color as MoodboardColor).hex);
      const name = cleanText((color as MoodboardColor).name, 40);
      const share = (color as MoodboardColor).share;
      if (!hex || !name || typeof share !== "number" || Number.isNaN(share)) continue;
      colors.push({ hex, name, share });
      if (colors.length >= 6) break;
    }
  }
  const overrides: Record<string, string> = {};
  if (raw.overrides && typeof raw.overrides === "object") {
    for (const [key, hex] of Object.entries(raw.overrides)) {
      if (!/^\d+$/.test(key)) continue;
      const next = normalizeHex(hex);
      if (next) overrides[key] = next;
    }
  }
  const inspoIds: string[] = [];
  if (Array.isArray(raw.inspoIds)) {
    for (const item of raw.inspoIds) {
      const templateId = cleanTemplateId(item);
      if (!templateId || inspoIds.includes(templateId)) continue;
      inspoIds.push(templateId);
      if (inspoIds.length >= 60) break;
    }
  }
  const harmony = typeof raw.harmony === "string" && HARMONY_IDS.has(raw.harmony) ? (raw.harmony as HarmonyId) : "analogous";
  const selected = typeof raw.selected === "number" && raw.selected >= 0 ? Math.floor(raw.selected) : 0;
  return {
    id,
    query,
    titles: cleanList(raw.titles, 6, 80),
    tags: cleanList(raw.tags, 12, 40),
    colors,
    selected: colors.length ? Math.min(selected, colors.length - 1) : 0,
    harmony,
    overrides,
    inspoIds,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
  };
}

function cloneDraft(draft: MoodboardDraft): MoodboardDraft {
  return {
    ...draft,
    titles: [...draft.titles],
    tags: [...draft.tags],
    colors: draft.colors.map((color) => ({ ...color })),
    overrides: { ...draft.overrides },
    inspoIds: [...draft.inspoIds],
  };
}

/** Read a design id written by a grid tile or the focused image. */
export function readMoodboardDrag(data: DataTransfer): string | null {
  return readTemplateDrag(data);
}

export function writeMoodboardDrag(data: DataTransfer, templateId: string) {
  writeTemplateDrag(data, templateId);
}

export class LocalMoodboardStore {
  private state: MoodboardState;
  private generation = 0;
  private listeners = new Set<() => void>();

  constructor(private storage: Pick<Storage, "getItem" | "setItem"> | null) {
    this.state = this.load();
  }

  private load(): MoodboardState {
    try {
      const raw = this.storage?.getItem(KEY);
      if (!raw) return { ...EMPTY_MOODBOARD_STATE };
      const parsed = JSON.parse(raw) as { draft?: unknown; saved?: unknown };
      const saved = Array.isArray(parsed.saved) ? parsed.saved.map(normalizeDraft).filter((item): item is MoodboardDraft => !!item) : [];
      return { ...EMPTY_MOODBOARD_STATE, draft: normalizeDraft(parsed.draft), saved };
    } catch {
      return { ...EMPTY_MOODBOARD_STATE };
    }
  }

  private emit() {
    this.listeners.forEach((listener) => listener());
  }

  private persist() {
    try {
      this.storage?.setItem(KEY, JSON.stringify({ draft: this.state.draft, saved: this.state.saved }));
    } catch {
      /* storage full or unavailable */
    }
  }

  private commit(next: MoodboardState, persist: boolean) {
    this.state = next;
    if (persist) this.persist();
    this.emit();
  }

  private patchDraft(fn: (draft: MoodboardDraft) => MoodboardDraft) {
    const draft = this.state.draft;
    if (!draft) return;
    this.commit({ ...this.state, draft: { ...fn(draft), updatedAt: now() } }, true);
  }

  getState() {
    return this.state;
  }

  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Replace the working colours and tags. Keeps the draft id and any inspiration already dropped. */
  applyGenerated(input: GeneratedMoodboard): number {
    this.generation += 1;
    const prev = this.state.draft;
    const draft: MoodboardDraft = {
      id: prev?.id ?? createId(),
      query: input.query.trim().slice(0, 80),
      titles: [],
      tags: cleanList(input.tags, 12, 40),
      colors: input.colors
        .map((color) => {
          const hex = normalizeHex(color.hex);
          const name = cleanText(color.name, 40);
          if (!hex || !name || typeof color.share !== "number") return null;
          return { hex, name, share: color.share };
        })
        .filter((color): color is MoodboardColor => !!color)
        .slice(0, 6),
      selected: 0,
      harmony: "analogous",
      overrides: {},
      inspoIds: prev?.inspoIds ?? [],
      updatedAt: now(),
    };
    this.commit(
      { ...this.state, draft, titlesPending: true, miss: false, attempt: null, formEpoch: this.state.formEpoch + 1 },
      true,
    );
    return this.generation;
  }

  setTitles(token: number, titles: string[]) {
    if (token !== this.generation || !this.state.draft) return;
    const next = cleanList(titles, 6, 80);
    this.commit(
      { ...this.state, titlesPending: false, draft: { ...this.state.draft, titles: next, updatedAt: now() } },
      true,
    );
  }

  /** The last generate matched nothing. The saved list stays, and the field keeps what was typed. */
  miss(query: string) {
    this.generation += 1;
    this.commit(
      {
        ...this.state,
        draft: null,
        titlesPending: false,
        miss: true,
        pinned: false,
        attempt: query.trim().slice(0, 80),
        formEpoch: this.state.formEpoch + 1,
      },
      true,
    );
  }

  setSelected(index: number) {
    this.patchDraft((draft) => ({
      ...draft,
      selected: draft.colors.length ? Math.min(Math.max(0, index), draft.colors.length - 1) : 0,
    }));
  }

  setHarmony(harmony: HarmonyId) {
    if (!HARMONY_IDS.has(harmony)) return;
    this.patchDraft((draft) => ({ ...draft, harmony }));
  }

  setOverride(index: number, hex: string) {
    const next = normalizeHex(hex);
    if (!next) return;
    this.patchDraft((draft) => ({ ...draft, overrides: { ...draft.overrides, [String(index)]: next } }));
  }

  addInspo(templateId: string) {
    const id = cleanTemplateId(templateId);
    const draft = this.state.draft;
    if (!id || !draft || draft.inspoIds.includes(id) || draft.inspoIds.length >= 60) return;
    this.patchDraft((current) => ({ ...current, inspoIds: [...current.inspoIds, id] }));
  }

  removeInspo(templateId: string) {
    this.patchDraft((draft) => ({ ...draft, inspoIds: draft.inspoIds.filter((id) => id !== templateId) }));
  }

  /** Write the working draft into the saved list. Saving again updates that same moodboard. */
  save(): MoodboardDraft | null {
    const draft = this.state.draft;
    if (!draft?.query.trim()) return null;
    const next = cloneDraft({ ...draft, query: draft.query.trim(), updatedAt: now() });
    const saved = this.state.saved.some((item) => item.id === next.id)
      ? this.state.saved.map((item) => (item.id === next.id ? next : item))
      : [next, ...this.state.saved];
    this.commit({ ...this.state, draft: next, saved }, true);
    return next;
  }

  /** Drop the working draft. A copy already saved stays in the list. */
  createNew() {
    this.generation += 1;
    this.commit(
      { ...this.state, draft: null, pinned: false, titlesPending: false, miss: false, attempt: null, formEpoch: this.state.formEpoch + 1 },
      true,
    );
  }

  open(id: string) {
    const found = this.state.saved.find((item) => item.id === id);
    if (!found) return;
    this.generation += 1;
    this.commit(
      { ...this.state, draft: cloneDraft(found), pinned: false, titlesPending: false, miss: false, attempt: null, formEpoch: this.state.formEpoch + 1 },
      true,
    );
  }

  removeSaved(id: string) {
    this.commit({ ...this.state, saved: this.state.saved.filter((item) => item.id !== id) }, true);
  }

  pin() {
    if (!this.state.draft || this.state.pinned) return;
    this.commit({ ...this.state, pinned: true }, false);
  }

  unpin() {
    if (!this.state.pinned) return;
    this.commit({ ...this.state, pinned: false }, false);
  }
}

let singleton: LocalMoodboardStore | null = null;

export function getMoodboardStore(): LocalMoodboardStore {
  if (!singleton) singleton = new LocalMoodboardStore(typeof window !== "undefined" ? window.localStorage : null);
  return singleton;
}
