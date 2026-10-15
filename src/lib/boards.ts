/**
 * Board storage boundary. v1 persists to localStorage; v2 can provide a
 * Supabase-backed BoardStore (accounts, sharing) with the same interface.
 */
export interface Board {
  id: string;
  name: string;
  templateIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface BoardStore {
  list(): Board[];
  create(name: string): Board;
  rename(id: string, name: string): void;
  remove(id: string): void;
  add(boardId: string, templateId: string): void;
  removeItem(boardId: string, templateId: string): void;
  toggle(boardId: string, templateId: string): boolean;
  subscribe(cb: () => void): () => void;
}

export const SAVED_BOARD_ID = "saved";
const KEY = "template-taxonomy:boards:v1";

function now() {
  return Date.now();
}

function defaultBoards(): Board[] {
  return [{ id: SAVED_BOARD_ID, name: "Saved", templateIds: [], createdAt: 0, updatedAt: 0 }];
}

/** In-memory store, optionally persisted through a Storage-like object. */
export class LocalBoardStore implements BoardStore {
  private boards: Board[];
  private listeners = new Set<() => void>();
  constructor(private storage: Pick<Storage, "getItem" | "setItem"> | null) {
    this.boards = this.load();
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
  private commit(next: Board[]) {
    this.boards = next;
    try {
      this.storage?.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage full / unavailable */
    }
    this.listeners.forEach((l) => l());
  }
  private patch(id: string, fn: (b: Board) => Board) {
    this.commit(this.boards.map((b) => (b.id === id ? { ...fn(b), updatedAt: now() } : b)));
  }
  list() {
    return this.boards;
  }
  create(name: string) {
    const clean = name.trim() || "Untitled board";
    const b: Board = { id: `b_${now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, name: clean, templateIds: [], createdAt: now(), updatedAt: now() };
    this.commit([...this.boards, b]);
    return b;
  }
  rename(id: string, name: string) {
    this.patch(id, (b) => ({ ...b, name: name.trim() || b.name }));
  }
  remove(id: string) {
    if (id === SAVED_BOARD_ID) return;
    this.commit(this.boards.filter((b) => b.id !== id));
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
