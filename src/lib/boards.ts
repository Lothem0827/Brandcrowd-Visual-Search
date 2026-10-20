/**
 * Board storage boundary. Guests use LocalBoardStore (localStorage);
 * signed-in users swap in a Supabase-backed BoardStore via setBoardStore().
 */
export interface Board {
  id: string;
  name: string;
  /** Optional blurb shown in place of the design count in the boards panel. */
  description?: string;
  templateIds: string[];
  createdAt: number;
  updatedAt: number;
  /** Cloud-only: whether the board is publicly viewable. */
  isPublic?: boolean;
  /** Cloud-only: public URL slug under /u/[handle]/b/[slug]. */
  slug?: string;
  ownerId?: string;
  kind?: "saved" | "custom";
}

export interface BoardStore {
  list(): Board[];
  create(name: string, description?: string): Board;
  rename(id: string, name: string): void;
  setDescription(id: string, description: string): void;
  remove(id: string): void;
  add(boardId: string, templateId: string): void;
  removeItem(boardId: string, templateId: string): void;
  toggle(boardId: string, templateId: string): boolean;
  /** Board that quick-save targets; defaults to "Saved". */
  lastUsedBoardId(): string;
  setLastUsedBoard(id: string): void;
  /** Board docked beside Explore during "Find more design". In-memory only. */
  pinnedBoardId(): string | null;
  pin(boardId: string): void;
  unpin(): void;
  subscribe(cb: () => void): () => void;
  /**
   * Distinct designs saved on any board. Cached and refreshed when items change,
   * so a render can read it without walking every saved id.
   */
  savedCount(): number;
  /** Optional: toggle public visibility (cloud stores). */
  setPublic?(id: string, isPublic: boolean): void | Promise<void>;
}

/** How many distinct template ids appear across these boards. */
export function uniqueTemplateCount(boards: readonly { templateIds: readonly string[] }[]): number {
  const ids = new Set<string>();
  for (const b of boards) for (const id of b.templateIds) ids.add(id);
  return ids.size;
}

export const SAVED_BOARD_ID = "saved";
const KEY = "template-taxonomy:boards:v1";
/** Kept separate from KEY so adding it doesn't invalidate the boards payload. */
const ACTIVE_KEY = "template-taxonomy:boards:active:v1";

function now() {
  return Date.now();
}

function defaultBoards(): Board[] {
  return [{ id: SAVED_BOARD_ID, name: "Saved", templateIds: [], createdAt: 0, updatedAt: 0 }];
}

/** In-memory store, optionally persisted through a Storage-like object. */
export class LocalBoardStore implements BoardStore {
  private boards: Board[];
  private activeId: string;
  /** Distinct template ids across `boards`, refreshed in `commit`. */
  private uniqueSaved: number;
  /** Session-only: which board is docked beside Explore. */
  private pinnedId: string | null = null;
  private listeners = new Set<() => void>();
  constructor(private storage: Pick<Storage, "getItem" | "setItem"> | null) {
    this.boards = this.load();
    this.uniqueSaved = uniqueTemplateCount(this.boards);
    this.activeId = this.loadActive();
  }
  private load(): Board[] {
    try {
      const raw = this.storage?.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Board[];
        if (Array.isArray(parsed)) {
          const list = parsed.filter((b) => b && typeof b.id === "string" && Array.isArray(b.templateIds));
          if (!list.some((b) => b.id === SAVED_BOARD_ID)) list.unshift(defaultBoards()[0]);
          return list;
        }
      }
    } catch {
      /* ignore corrupt storage */
    }
    return defaultBoards();
  }
  /** The persisted active board, validated against the loaded boards. */
  private loadActive(): string {
    try {
      const id = this.storage?.getItem(ACTIVE_KEY);
      if (id && this.boards.some((b) => b.id === id)) return id;
    } catch {
      /* ignore corrupt storage */
    }
    return SAVED_BOARD_ID;
  }
  private emit() {
    this.listeners.forEach((l) => l());
  }
  private commit(next: Board[]) {
    this.boards = next;
    this.uniqueSaved = uniqueTemplateCount(next);
    try {
      this.storage?.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage full / unavailable */
    }
    this.emit();
  }
  private patch(id: string, fn: (b: Board) => Board) {
    this.commit(this.boards.map((b) => (b.id === id ? { ...fn(b), updatedAt: now() } : b)));
  }
  list() {
    return this.boards;
  }
  savedCount() {
    return this.uniqueSaved;
  }
  create(name: string, description?: string) {
    const clean = name.trim() || "Untitled board";
    const desc = description?.trim() || undefined;
    const b: Board = { id: `b_${now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, name: clean, description: desc, templateIds: [], createdAt: now(), updatedAt: now() };
    this.commit([...this.boards, b]);
    // A board created just now is almost certainly where the next save should go.
    this.setLastUsedBoard(b.id);
    return b;
  }
  rename(id: string, name: string) {
    this.patch(id, (b) => ({ ...b, name: name.trim() || b.name }));
  }
  setDescription(id: string, description: string) {
    const desc = description.trim() || undefined;
    this.patch(id, (b) => ({ ...b, description: desc }));
  }
  remove(id: string) {
    if (id === SAVED_BOARD_ID) return;
    this.commit(this.boards.filter((b) => b.id !== id));
    // Never leave quick-save pointing at a board that no longer exists.
    if (this.activeId === id) this.setLastUsedBoard(SAVED_BOARD_ID);
    if (this.pinnedId === id) {
      this.pinnedId = null;
      this.emit();
    }
  }
  add(boardId: string, templateId: string) {
    this.patch(boardId, (b) => (b.templateIds.includes(templateId) ? b : { ...b, templateIds: [templateId, ...b.templateIds] }));
  }
  removeItem(boardId: string, templateId: string) {
    this.patch(boardId, (b) => ({ ...b, templateIds: b.templateIds.filter((x) => x !== templateId) }));
  }
  toggle(boardId: string, templateId: string) {
    const b = this.boards.find((x) => x.id === boardId);
    const has = !!b?.templateIds.includes(templateId);
    if (has) this.removeItem(boardId, templateId);
    else this.add(boardId, templateId);
    return !has;
  }
  lastUsedBoardId() {
    return this.activeId;
  }
  setLastUsedBoard(id: string) {
    if (id === this.activeId) return;
    if (!this.boards.some((b) => b.id === id)) return;
    this.activeId = id;
    try {
      this.storage?.setItem(ACTIVE_KEY, id);
    } catch {
      /* storage full / unavailable */
    }
    this.emit();
  }
  pinnedBoardId() {
    return this.pinnedId;
  }
  pin(boardId: string) {
    if (!this.boards.some((b) => b.id === boardId)) return;
    // Always assign + emit so React subscribers refresh even when re-pinning the same board.
    this.pinnedId = boardId;
    this.emit();
  }
  unpin() {
    if (this.pinnedId === null) return;
    this.pinnedId = null;
    this.emit();
  }
  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  /** Drop all guest boards/saves (after they've been copied to the account). */
  reset() {
    this.pinnedId = null;
    this.activeId = SAVED_BOARD_ID;
    try {
      this.storage?.setItem(ACTIVE_KEY, SAVED_BOARD_ID);
    } catch {
      /* storage full / unavailable */
    }
    this.commit(defaultBoards());
  }
}

let localSingleton: LocalBoardStore | null = null;

function getLocalBoardStore(): LocalBoardStore {
  if (!localSingleton) {
    localSingleton = new LocalBoardStore(typeof window !== "undefined" ? window.localStorage : null);
  }
  return localSingleton;
}

/** Stable facade so React subscribers survive guest ↔ cloud swaps. */
class BoardStoreFacade implements BoardStore {
  private inner: BoardStore = getLocalBoardStore();
  private unsub: (() => void) | null = null;
  private listeners = new Set<() => void>();

  constructor() {
    this.bind(this.inner);
  }

  private bind(store: BoardStore) {
    this.unsub?.();
    this.inner = store;
    this.unsub = store.subscribe(() => this.emit());
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  /** Use cloud store while signed in; null restores guest localStorage. */
  use(store: BoardStore | null) {
    this.bind(store ?? getLocalBoardStore());
    this.emit();
  }

  list() {
    return this.inner.list();
  }
  savedCount() {
    return this.inner.savedCount();
  }
  create(name: string, description?: string) {
    return this.inner.create(name, description);
  }
  rename(id: string, name: string) {
    this.inner.rename(id, name);
  }
  setDescription(id: string, description: string) {
    this.inner.setDescription(id, description);
  }
  remove(id: string) {
    this.inner.remove(id);
  }
  add(boardId: string, templateId: string) {
    this.inner.add(boardId, templateId);
  }
  removeItem(boardId: string, templateId: string) {
    this.inner.removeItem(boardId, templateId);
  }
  toggle(boardId: string, templateId: string) {
    return this.inner.toggle(boardId, templateId);
  }
  lastUsedBoardId() {
    return this.inner.lastUsedBoardId();
  }
  setLastUsedBoard(id: string) {
    this.inner.setLastUsedBoard(id);
  }
  pinnedBoardId() {
    return this.inner.pinnedBoardId();
  }
  pin(boardId: string) {
    this.inner.pin(boardId);
  }
  unpin() {
    this.inner.unpin();
  }
  setPublic(id: string, isPublic: boolean) {
    return this.inner.setPublic?.(id, isPublic);
  }
  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}

let facade: BoardStoreFacade | null = null;

export function getBoardStore(): BoardStore {
  if (!facade) facade = new BoardStoreFacade();
  return facade;
}

/** Snapshot of guest boards for merge-on-login (always from localStorage). */
export function getLocalBoardsSnapshot(): Board[] {
  return getLocalBoardStore().list().map((b) => ({
    ...b,
    templateIds: [...b.templateIds],
  }));
}

/** True when the guest store holds anything worth syncing to an account. */
export function hasLocalBoardData(): boolean {
  return getLocalBoardStore()
    .list()
    .some((b) => b.templateIds.length > 0 || b.id !== SAVED_BOARD_ID);
}

/**
 * Empty the guest store once its contents live in the account. Without this the
 * guest copy lingers in localStorage and can resurrect items the user later
 * removes while signed in (shown on reload before the cloud store loads, and
 * merged back into the account on the next sign-in).
 */
export function clearLocalBoards() {
  getLocalBoardStore().reset();
}

/** Swap in a cloud store while signed in; pass null to return to guest local. */
export function setBoardStore(store: BoardStore | null) {
  if (!facade) facade = new BoardStoreFacade();
  facade.use(store);
}
