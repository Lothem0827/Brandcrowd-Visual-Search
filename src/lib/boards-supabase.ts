import type { SupabaseClient } from "@supabase/supabase-js";
import { slugify } from "@/lib/slug";
import type { Database } from "@/lib/supabase/database.types";
import { type Board, type BoardStore, SAVED_BOARD_ID } from "./boards";

type Client = SupabaseClient<Database>;

function toMs(iso: string) {
  return new Date(iso).getTime();
}

export class SupabaseBoardStore implements BoardStore {
  private boards: Board[] = [];
  private activeId: string = SAVED_BOARD_ID;
  private pinnedId: string | null = null;
  private listeners = new Set<() => void>();
  private savedCloudId: string | null = null;
  /** Map local-facing id → cloud uuid (Saved uses SAVED_BOARD_ID locally). */
  private idMap = new Map<string, string>();

  constructor(
    private supabase: Client,
    private userId: string,
  ) {}

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private cloudId(localId: string): string | null {
    if (localId === SAVED_BOARD_ID) return this.savedCloudId;
    return this.idMap.get(localId) ?? (this.boards.some((b) => b.id === localId) ? localId : null);
  }

  private localId(rowId: string, kind: string): string {
    if (kind === "saved") {
      this.savedCloudId = rowId;
      this.idMap.set(SAVED_BOARD_ID, rowId);
      return SAVED_BOARD_ID;
    }
    this.idMap.set(rowId, rowId);
    return rowId;
  }

  async load() {
    const { data: rows, error } = await this.supabase
      .from("boards")
      .select("*, board_items(template_id, position)")
      .eq("owner_id", this.userId)
      .order("updated_at", { ascending: false });
    if (error) throw error;

    type BoardJoin = Database["public"]["Tables"]["boards"]["Row"] & {
      board_items: { template_id: string; position: number }[] | null;
    };
    this.boards = ((rows ?? []) as unknown as BoardJoin[]).map((row) => {
      const items = row.board_items ?? [];
      items.sort((a, b) => a.position - b.position);
      const id = this.localId(row.id, row.kind);
      return {
        id,
        name: row.name,
        description: row.description ?? undefined,
        templateIds: items.map((i) => i.template_id),
        createdAt: toMs(row.created_at),
        updatedAt: toMs(row.updated_at),
        isPublic: row.is_public,
        slug: row.slug,
        ownerId: row.owner_id,
        kind: row.kind,
      } satisfies Board;
    });

    // Ensure Saved exists in the list (trigger should have created it)
    if (!this.boards.some((b) => b.id === SAVED_BOARD_ID)) {
      this.boards.unshift({
        id: SAVED_BOARD_ID,
        name: "Saved",
        templateIds: [],
        createdAt: 0,
        updatedAt: 0,
        kind: "saved",
        isPublic: false,
        slug: "saved",
        ownerId: this.userId,
      });
    }

    const { data: settings } = await this.supabase
      .from("user_settings")
      .select("last_used_board_id")
      .eq("user_id", this.userId)
      .maybeSingle();
    if (settings?.last_used_board_id) {
      const local = [...this.idMap.entries()].find(([, cloud]) => cloud === settings.last_used_board_id)?.[0];
      if (local && this.boards.some((b) => b.id === local)) this.activeId = local;
      else if (settings.last_used_board_id === this.savedCloudId) this.activeId = SAVED_BOARD_ID;
    }

    this.emit();
  }

  list() {
    return this.boards;
  }

  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  lastUsedBoardId() {
    return this.activeId;
  }

  setLastUsedBoard(id: string) {
    if (id === this.activeId) return;
    if (!this.boards.some((b) => b.id === id)) return;
    this.activeId = id;
    const cloud = this.cloudId(id);
    if (cloud) {
      void this.supabase.from("user_settings").upsert({
        user_id: this.userId,
        last_used_board_id: cloud,
        updated_at: new Date().toISOString(),
      });
    }
    this.emit();
  }

  pinnedBoardId() {
    return this.pinnedId;
  }

  pin(boardId: string) {
    if (!this.boards.some((b) => b.id === boardId)) return;
    this.pinnedId = boardId;
    this.emit();
  }

  unpin() {
    if (this.pinnedId === null) return;
    this.pinnedId = null;
    this.emit();
  }

  private patchLocal(id: string, fn: (b: Board) => Board) {
    this.boards = this.boards.map((b) => (b.id === id ? { ...fn(b), updatedAt: Date.now() } : b));
    this.emit();
  }

  create(name: string, description?: string) {
    const clean = name.trim() || "Untitled board";
    const desc = description?.trim() || undefined;
    const tempId = `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const slug = slugify(clean);
    const board: Board = {
      id: tempId,
      name: clean,
      description: desc,
      templateIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isPublic: false,
      slug,
      ownerId: this.userId,
      kind: "custom",
    };
    this.boards = [...this.boards, board];
    this.setLastUsedBoard(tempId);
    this.emit();

    void (async () => {
      const { data, error } = await this.supabase
        .from("boards")
        .insert({
          owner_id: this.userId,
          name: clean,
          description: desc ?? null,
          slug: `${slug}-${tempId.slice(-5)}`,
          kind: "custom",
        })
        .select("*")
        .single();
      if (error || !data) return;
      this.idMap.delete(tempId);
      this.idMap.set(data.id, data.id);
      this.boards = this.boards.map((b) =>
        b.id === tempId
          ? { ...b, id: data.id, slug: data.slug, createdAt: toMs(data.created_at), updatedAt: toMs(data.updated_at) }
          : b,
      );
      if (this.activeId === tempId) this.activeId = data.id;
      if (this.pinnedId === tempId) this.pinnedId = data.id;
      this.emit();
    })();

    return board;
  }

  rename(id: string, name: string) {
    const clean = name.trim();
    if (!clean) return;
    this.patchLocal(id, (b) => ({ ...b, name: clean }));
    const cloud = this.cloudId(id);
    if (cloud) void this.supabase.from("boards").update({ name: clean }).eq("id", cloud);
  }

  remove(id: string) {
    if (id === SAVED_BOARD_ID) return;
    const cloud = this.cloudId(id);
    this.boards = this.boards.filter((b) => b.id !== id);
    this.idMap.delete(id);
    if (this.activeId === id) this.activeId = SAVED_BOARD_ID;
    if (this.pinnedId === id) this.pinnedId = null;
    this.emit();
    if (cloud) void this.supabase.from("boards").delete().eq("id", cloud);
  }

  add(boardId: string, templateId: string) {
    const b = this.boards.find((x) => x.id === boardId);
    if (!b || b.templateIds.includes(templateId)) return;
    this.patchLocal(boardId, (board) => ({ ...board, templateIds: [templateId, ...board.templateIds] }));
    const cloud = this.cloudId(boardId);
    if (cloud) {
      void this.supabase.from("board_items").upsert({
        board_id: cloud,
        template_id: templateId,
        position: 0,
      });
    }
  }

  removeItem(boardId: string, templateId: string) {
    this.patchLocal(boardId, (b) => ({ ...b, templateIds: b.templateIds.filter((x) => x !== templateId) }));
    const cloud = this.cloudId(boardId);
    if (cloud) {
      void this.supabase.from("board_items").delete().eq("board_id", cloud).eq("template_id", templateId);
    }
  }

  toggle(boardId: string, templateId: string) {
    const b = this.boards.find((x) => x.id === boardId);
    const has = !!b?.templateIds.includes(templateId);
    if (has) this.removeItem(boardId, templateId);
    else this.add(boardId, templateId);
    return !has;
  }

  async setPublic(id: string, isPublic: boolean) {
    this.patchLocal(id, (b) => ({ ...b, isPublic }));
    const cloud = this.cloudId(id);
    if (cloud) await this.supabase.from("boards").update({ is_public: isPublic }).eq("id", cloud);
  }
}
