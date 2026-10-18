import {
  migrateLegacyDraft,
  snapshotOfBundle,
  type BriefCard,
  type BriefDraft,
  type BriefSlot,
  type LegacyDraft,
} from "./brief-board";

/**
 * Brief storage boundary. Drafts are the editable canvases; saved briefs are immutable
 * snapshots of one Final node, so naming or editing a draft later never rewrites a
 * deliverable that was already handed over.
 *
 * v1 persists to localStorage (like boards); a v2 BriefStore could be Supabase-backed.
 */

export interface SavedBrief {
  id: string;
  name: string;
  draftId: string;
  /** the plugged brief card this snapshot came from */
  finalId: string;
  label: string;
  query: string;
  title: string | null;
  palette: BriefSlot[] | null;
  tags: string[] | null;
  designIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface NewDraft {
  query: string;
  label: string;
  templates: number;
}

export interface BriefDraftPatch {
  query?: string;
  label?: string;
  templates?: number;
  cards?: BriefCard[];
  seed?: number;
}

export interface BriefStore {
  listDrafts(): BriefDraft[];
  getDraft(id: string): BriefDraft | undefined;
  createDraft(seed: NewDraft): BriefDraft;
  patchDraft(id: string, patch: BriefDraftPatch | ((draft: BriefDraft) => BriefDraft)): void;
  removeDraft(id: string): void;
  listSaved(): SavedBrief[];
  saveSnapshot(draftId: string, finalId: string, name: string): SavedBrief | null;
  renameSaved(id: string, name: string): void;
  removeSaved(id: string): void;
  activeDraftId(): string;
  setActiveDraft(id: string): void;
  subscribe(cb: () => void): () => void;
}

const KEY = "template-taxonomy:briefs:v1";
export const SAVED_KEY = "template-taxonomy:briefs:saved:v1";
const ACTIVE_KEY = "template-taxonomy:briefs:active:v1";

const now = () => Date.now();

let draftCounter = 0;
function draftId(): string {
  draftCounter = (draftCounter + 1) % 100_000;
  return `d_${now().toString(36)}_${draftCounter.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function savedId(): string {
  return `sb_${now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

const isCard = (value: unknown): value is BriefCard => {
  const card = value as Partial<BriefCard> | null;
  return (
    !!card &&
    typeof card.id === "string" &&
    typeof card.kind === "string" &&
    typeof card.x === "number" &&
    typeof card.y === "number"
  );
};

const isDraft = (value: unknown): value is LegacyDraft => {
  const draft = value as Partial<LegacyDraft> | null;
  return (
    !!draft &&
    typeof draft.id === "string" &&
    typeof draft.label === "string" &&
    typeof draft.query === "string" &&
    typeof draft.templates === "number" &&
    Array.isArray(draft.cards)
  );
};

const isSaved = (value: unknown): value is SavedBrief => {
  const saved = value as Partial<SavedBrief> | null;
  return !!saved && typeof saved.id === "string" && typeof saved.name === "string";
};

/** In-memory store, optionally persisted through a Storage-like object. */
export class LocalBriefStore implements BriefStore {
  private drafts: BriefDraft[];
  private saved: SavedBrief[];
  private activeId: string;
  private listeners = new Set<() => void>();

  constructor(private storage: Pick<Storage, "getItem" | "setItem"> | null) {
    this.drafts = this.loadDrafts();
    this.saved = this.loadSaved();
    this.activeId = this.loadActive();
  }

  private read<T>(key: string): T[] {
    try {
      const raw = this.storage?.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      /* ignore corrupt storage */
      return [];
    }
  }

  private loadDrafts(): BriefDraft[] {
    // Drafts written before plugging existed still carry `edges` and `final` cards;
    // migration folds those into plugged brief cards on read.
    return this.read<unknown>(KEY).filter(isDraft).map((draft) =>
      migrateLegacyDraft({
        ...draft,
        cards: draft.cards.filter(isCard),
      }),
    );
  }

  private loadSaved(): SavedBrief[] {
    return this.read<unknown>(SAVED_KEY).filter(isSaved);
  }

  private loadActive(): string {
    try {
      const id = this.storage?.getItem(ACTIVE_KEY);
      if (id && this.drafts.some((draft) => draft.id === id)) return id;
    } catch {
      /* ignore corrupt storage */
    }
    return this.drafts.at(-1)?.id ?? "";
  }

  private write(key: string, value: unknown) {
    try {
      this.storage?.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full / unavailable: keep working in memory */
    }
  }

  private emit() {
    this.listeners.forEach((listener) => listener());
  }

  private commitDrafts(next: BriefDraft[]) {
    this.drafts = next;
    this.write(KEY, next);
    this.emit();
  }

  private commitSaved(next: SavedBrief[]) {
    this.saved = next;
    this.write(SAVED_KEY, next);
    this.emit();
  }

  listDrafts() {
    return this.drafts;
  }

  getDraft(id: string) {
    return this.drafts.find((draft) => draft.id === id);
  }

  createDraft(seed: NewDraft): BriefDraft {
    const stamp = now();
    const draft: BriefDraft = {
      id: draftId(),
      query: seed.query.trim(),
      label: seed.label.trim() || seed.query.trim() || "Untitled",
      templates: seed.templates,
      cards: [],
      seed: 0,
      createdAt: stamp,
      updatedAt: stamp,
    };
    this.commitDrafts([...this.drafts, draft]);
    this.setActiveDraft(draft.id);
    return draft;
  }

  patchDraft(id: string, patch: BriefDraftPatch | ((draft: BriefDraft) => BriefDraft)) {
    const current = this.getDraft(id);
    if (!current) return;
    const next =
      typeof patch === "function"
        ? { ...patch(current), id: current.id, updatedAt: now() }
        : { ...current, ...patch, id: current.id, updatedAt: now() };
    this.commitDrafts(this.drafts.map((draft) => (draft.id === id ? next : draft)));
  }

  removeDraft(id: string) {
    this.commitDrafts(this.drafts.filter((draft) => draft.id !== id));
    if (this.activeId === id) {
      const fallback = this.drafts.at(-1)?.id ?? "";
      this.activeId = fallback;
      this.write(ACTIVE_KEY, fallback);
      this.emit();
    }
  }

  listSaved() {
    return this.saved;
  }

  saveSnapshot(draftId: string, finalId: string, name: string): SavedBrief | null {
    const draft = this.getDraft(draftId);
    if (!draft) return null;
    const snapshot = snapshotOfBundle(draft.cards, finalId);
    if (!snapshot) return null;
    const clean = name.trim();
    const title = snapshot.title?.trim() || "";
    const finalName = clean || snapshot.name.trim() || title || draft.label || "Untitled brief";
    const existing = this.saved.find(
      (item) => item.draftId === draftId && item.finalId === finalId,
    );
    const stamp = now();
    const saved: SavedBrief = {
      id: existing?.id ?? savedId(),
      name: finalName,
      draftId,
      finalId,
      label: draft.label,
      query: draft.query,
      title: snapshot.title,
      palette: snapshot.palette,
      tags: snapshot.tags,
      designIds: snapshot.designIds,
      createdAt: existing?.createdAt ?? stamp,
      updatedAt: stamp,
    };
    this.commitSaved(
      existing ? this.saved.map((item) => (item.id === existing.id ? saved : item)) : [saved, ...this.saved],
    );
    return saved;
  }

  renameSaved(id: string, name: string) {
    const clean = name.trim();
    if (!clean) return;
    this.commitSaved(
      this.saved.map((item) => (item.id === id ? { ...item, name: clean, updatedAt: now() } : item)),
    );
  }

  removeSaved(id: string) {
    this.commitSaved(this.saved.filter((item) => item.id !== id));
  }

  activeDraftId() {
    return this.activeId;
  }

  setActiveDraft(id: string) {
    if (!this.drafts.some((draft) => draft.id === id)) return;
    if (id === this.activeId) return;
    this.activeId = id;
    this.write(ACTIVE_KEY, id);
    this.emit();
  }

  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}

let singleton: BriefStore | null = null;
export function getBriefStore(): BriefStore {
  if (!singleton) {
    singleton = new LocalBriefStore(typeof window !== "undefined" ? window.localStorage : null);
  }
  return singleton;
}

/** Test seam: replace the process-wide store with an isolated one. */
export function setBriefStore(store: BriefStore | null) {
  singleton = store;
}
