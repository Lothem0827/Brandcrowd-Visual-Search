import { describe, expect, it, vi } from "vitest";
import { SAVED_BOARD_ID } from "./boards";
import { SupabaseBoardStore } from "./boards-supabase";

type Row = Record<string, unknown>;

function seedSaved(db: FakeDb, ownerId: string, savedId = "11111111-1111-4111-8111-111111111111") {
  db.boards.push({
    id: savedId,
    owner_id: ownerId,
    name: "Saved",
    description: null,
    is_public: false,
    slug: "saved",
    kind: "saved",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  });
  return savedId;
}

class FakeDb {
  boards: Row[] = [];
  board_items: Row[] = [];
  user_settings: Row[] = [];
  failUpsert = false;
  upserts: Row[] = [];
}

class FakeQuery implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private method: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private payload: unknown;
  private filters: { col: string; val: unknown }[] = [];
  private wantSingle: "none" | "maybe" | "one" = "none";

  constructor(
    private db: FakeDb,
    private table: keyof Pick<FakeDb, "boards" | "board_items" | "user_settings">,
  ) {}

  select() {
    return this;
  }
  insert(payload: unknown) {
    this.method = "insert";
    this.payload = payload;
    return this;
  }
  upsert(payload: unknown) {
    this.method = "upsert";
    this.payload = payload;
    return this;
  }
  update(payload: unknown) {
    this.method = "update";
    this.payload = payload;
    return this;
  }
  delete() {
    this.method = "delete";
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push({ col, val });
    return this;
  }
  order() {
    return this;
  }
  maybeSingle() {
    this.wantSingle = "maybe";
    return this;
  }
  single() {
    this.wantSingle = "one";
    return this;
  }

  then<TResult1 = { data: unknown; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve().then(() => this.execute()).then(onfulfilled, onrejected);
  }

  private rows(): Row[] {
    return this.db[this.table];
  }

  private execute() {
    if (this.method === "insert") {
      const incoming = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      const inserted = incoming.map((row) => ({
        id: row.id ?? crypto.randomUUID(),
        created_at: "2026-01-02T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
        is_public: false,
        description: null,
        ...row,
      }));
      this.db[this.table].push(...inserted);
      const data = this.wantSingle === "none" ? inserted : inserted[0];
      return { data, error: null };
    }

    if (this.method === "upsert") {
      if (this.table === "board_items" && this.db.failUpsert) {
        return { data: null, error: { message: "upsert failed" } };
      }
      const incoming = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      for (const row of incoming) {
        this.db.upserts.push(row);
        if (this.table === "board_items") {
          const idx = this.db.board_items.findIndex(
            (item) => item.board_id === row.board_id && item.template_id === row.template_id,
          );
          if (idx >= 0) this.db.board_items[idx] = { ...this.db.board_items[idx], ...row };
          else this.db.board_items.push({ position: 0, created_at: "2026-01-02T00:00:00.000Z", ...row });
        } else if (this.table === "user_settings") {
          const idx = this.db.user_settings.findIndex((item) => item.user_id === row.user_id);
          if (idx >= 0) this.db.user_settings[idx] = { ...this.db.user_settings[idx], ...row };
          else this.db.user_settings.push({ ...row });
        }
      }
      return { data: this.wantSingle === "none" ? incoming : incoming[0], error: null };
    }

    if (this.method === "update") {
      const patch = this.payload as Row;
      this.db[this.table] = this.rows().map((row) =>
        this.filters.every((f) => row[f.col] === f.val) ? { ...row, ...patch } : row,
      );
      return { data: null, error: null };
    }

    if (this.method === "delete") {
      this.db[this.table] = this.rows().filter((row) => !this.filters.every((f) => row[f.col] === f.val));
      return { data: null, error: null };
    }

    let rows = this.rows();
    for (const f of this.filters) rows = rows.filter((row) => row[f.col] === f.val);
    if (this.table === "boards") {
      rows = rows.map((board) => ({
        ...board,
        board_items: this.db.board_items
          .filter((item) => item.board_id === board.id)
          .map((item) => ({ template_id: item.template_id, position: item.position })),
      }));
    }
    if (this.wantSingle === "maybe") return { data: rows[0] ?? null, error: null };
    if (this.wantSingle === "one") {
      return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: "not found" } };
    }
    return { data: rows, error: null };
  }
}

function fakeClient(db: FakeDb) {
  return {
    from(table: "boards" | "board_items" | "user_settings") {
      return new FakeQuery(db, table);
    },
  };
}

const USER = "user-1";

describe("SupabaseBoardStore save persistence", () => {
  it("writes board_items when saving, even without awaiting add()", async () => {
    const db = new FakeDb();
    const savedId = seedSaved(db, USER);
    const store = new SupabaseBoardStore(fakeClient(db) as never, USER);
    await store.load();

    store.add(SAVED_BOARD_ID, "tmpl-1");
    expect(store.list().find((b) => b.id === SAVED_BOARD_ID)?.templateIds).toEqual(["tmpl-1"]);

    await store.flush();
    expect(db.board_items).toEqual([
      expect.objectContaining({ board_id: savedId, template_id: "tmpl-1" }),
    ]);
    expect(db.upserts).toHaveLength(1);
  });

  it("creates a Saved board in the cloud when load finds none, then persists saves to it", async () => {
    const db = new FakeDb();
    const store = new SupabaseBoardStore(fakeClient(db) as never, USER);
    await store.load();

    const saved = db.boards.find((b) => b.kind === "saved");
    expect(saved).toBeTruthy();

    store.add(SAVED_BOARD_ID, "tmpl-2");
    await store.flush();
    expect(db.board_items).toEqual([
      expect.objectContaining({ board_id: saved!.id, template_id: "tmpl-2" }),
    ]);
  });

  it("waits for a new board's uuid before writing items, not the temp local id", async () => {
    const db = new FakeDb();
    seedSaved(db, USER);
    const store = new SupabaseBoardStore(fakeClient(db) as never, USER);
    await store.load();

    const created = store.create("Pitches");
    expect(created.id.startsWith("b_")).toBe(true);
    store.add(created.id, "tmpl-3");
    await store.flush();

    const cloudBoard = db.boards.find((b) => b.name === "Pitches");
    expect(cloudBoard).toBeTruthy();
    expect(isUuid(String(cloudBoard!.id))).toBe(true);
    expect(db.board_items).toEqual([
      expect.objectContaining({ board_id: cloudBoard!.id, template_id: "tmpl-3" }),
    ]);
    expect(db.board_items.some((item) => String(item.board_id).startsWith("b_"))).toBe(false);
  });

  it("rolls the UI back when the board_items upsert fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const db = new FakeDb();
    seedSaved(db, USER);
    db.failUpsert = true;
    const store = new SupabaseBoardStore(fakeClient(db) as never, USER);
    await store.load();

    store.add(SAVED_BOARD_ID, "tmpl-4");
    expect(store.list().find((b) => b.id === SAVED_BOARD_ID)?.templateIds).toEqual(["tmpl-4"]);
    await store.flush();
    expect(store.list().find((b) => b.id === SAVED_BOARD_ID)?.templateIds).toEqual([]);
    expect(db.board_items).toEqual([]);
  });
});

function isUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
