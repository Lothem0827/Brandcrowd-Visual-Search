/**
 * Board storage boundary. v1 persists to localStorage; v2 can provide a
 * Supabase-backed BoardStore (accounts, sharing) with the same interface.
 */
export interface Board {
  id: string;
  name: string;
  /** Optional blurb shown in place of the design count in the boards panel. */
  description?: string;
  templateIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface BoardStore {
  list(): Board[];
  create(name: string, description?: string): Board;
  rename(id: string, name: string): void;
  remove(id: string): void;
  add(boardId: string, templateId: string): void;
  removeItem(boardId: string, templateId: string): void;
  toggle(boardId: string, templateId: string): boolean;
  /** Board that quick-save targets; defaults to "Saved". */
  lastUsedBoardId(): string;
  setLastUsedBoard(id: string): void;
  subscribe(cb: () => void): () => void;
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
  private listeners = new Set<() => void>();
  constructor(private storage: Pick<Storage, "getItem" | "setItem"> | null) {
    this.boards = this.load();
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
  remove(id: string) {
    if (id === SAVED_BOARD_ID) return;
    this.commit(this.boards.filter((b) => b.id !== id));
    // Never leave quick-save pointing at a board that no longer exists.
    if (this.activeId === id) this.setLastUsedBoard(SAVED_BOARD_ID);
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
  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}

let singleton: BoardStore | null = null;
export function getBoardStore(): BoardStore {
  if (!singleton) singleton = new LocalBoardStore(typeof window !== "undefined" ? window.localStorage : null);
  return singleton;
}
