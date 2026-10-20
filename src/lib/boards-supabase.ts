import type { SupabaseClient } from "@supabase/supabase-js";
import { slugify } from "@/lib/slug";
import type { Database } from "@/lib/supabase/database.types";
import { uniqueTemplateCount, type Board, type BoardStore, SAVED_BOARD_ID } from "./boards";

type Client = SupabaseClient<Database>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(id: string) {
  return UUID_RE.test(id);
}

function toMs(iso: string) {
  return new Date(iso).getTime();
}

export class SupabaseBoardStore implements BoardStore {
  private boards: Board[] = [];
  private uniqueSaved = 0;
  private activeId: string = SAVED_BOARD_ID;
  private pinnedId: string | null = null;
  private listeners = new Set<() => void>();
  private savedCloudId: string | null = null;
  /** Map local-facing id → cloud uuid (Saved uses SAVED_BOARD_ID locally). */
  private idMap = new Map<string, string>();
  /** In-flight board inserts keyed by the temporary local id. */
  private creating = new Map<string, Promise<string | null>>();
  private pending = new Set<Promise<void>>();

  constructor(
    private supabase: Client,
    private userId: string,
  ) {}

  private emit() {
    this.listeners.forEach((l) => l());
  }

  /** Replace the board list and refresh the cached distinct-save count. */
  private setBoards(next: Board[]) {
    this.boards = next;
    this.uniqueSaved = uniqueTemplateCount(next);
  }

  private cloudId(localId: string): string | null {
    if (localId === SAVED_BOARD_ID) return this.savedCloudId;
    const mapped = this.idMap.get(localId);
    if (mapped) return mapped;
    return isUuid(localId) && this.boards.some((b) => b.id === localId) ? localId : null;
  }

  /** Current in-memory board id, even after a temp id is replaced with the cloud uuid. */
  private localBoardId(id: string): string | null {
    if (this.boards.some((b) => b.id === id)) return id;
    const mapped = this.idMap.get(id);
    if (mapped && this.boards.some((b) => b.id === mapped)) return mapped;
    return null;
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

  private track(work: Promise<void>) {
    this.pending.add(work);
    void work.finally(() => this.pending.delete(work));
  }

  /** Wait until in-flight cloud writes finish. Used by tests and sign-in leftover merge. */
  async flush() {
    while (this.pending.size) {
      await Promise.allSettled([...this.pending]);
    }
  }

  private async resolveCloudId(localId: string): Promise<string | null> {
    const existing = this.cloudId(localId);
    if (existing) return existing;
    if (localId === SAVED_BOARD_ID) return this.ensureSavedBoard();
    const pendingCreate = this.creating.get(localId);
    if (pendingCreate) return pendingCreate;
    return this.cloudId(this.localBoardId(localId) ?? localId);
  }

  private async ensureSavedBoard(): Promise<string | null> {
    if (this.savedCloudId) return this.savedCloudId;

    const { data, error } = await this.supabase
      .from("boards")
      .insert({
        owner_id: this.userId,
        name: "Saved",
        slug: "saved",
        kind: "saved",
      })
      .select("id")
      .single();

    if (data?.id) {
      this.savedCloudId = data.id;
      this.idMap.set(SAVED_BOARD_ID, data.id);
      return data.id;
    }

    const { data: existing } = await this.supabase
      .from("boards")
      .select("id")
      .eq("owner_id", this.userId)
      .eq("kind", "saved")
      .maybeSingle();
    if (existing?.id) {
      this.savedCloudId = existing.id;
      this.idMap.set(SAVED_BOARD_ID, existing.id);
      return existing.id;
    }

    console.error("Failed to ensure Saved board", error);
    return null;
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
    this.setBoards(((rows ?? []) as unknown as BoardJoin[]).map((row) => {
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
    }));

    if (!this.savedCloudId) {
      const cloudId = await this.ensureSavedBoard();
      if (cloudId && !this.boards.some((b) => b.id === SAVED_BOARD_ID)) {
        this.setBoards([
          {
            id: SAVED_BOARD_ID,
            name: "Saved",
            templateIds: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            kind: "saved",
            isPublic: false,
            slug: "saved",
            ownerId: this.userId,
          },
          ...this.boards,
        ]);
      }
    } else if (!this.boards.some((b) => b.id === SAVED_BOARD_ID)) {
      this.setBoards([
        {
          id: SAVED_BOARD_ID,
          name: "Saved",
          templateIds: [],
          createdAt: 0,
          updatedAt: 0,
          kind: "saved",
          isPublic: false,
          slug: "saved",
          ownerId: this.userId,
        },
        ...this.boards,
      ]);
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

  savedCount() {
    return this.uniqueSaved;
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
    this.emit();
    this.track(this.persistLastUsed(id));
  }

  private async persistLastUsed(id: string) {
    const cloud = await this.resolveCloudId(id);
    if (!cloud) return;
    const { error } = await this.supabase.from("user_settings").upsert({
      user_id: this.userId,
      last_used_board_id: cloud,
      updated_at: new Date().toISOString(),
    });
    if (error) console.error("Failed to persist last-used board", error);
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
    const localId = this.localBoardId(id) ?? id;
    this.setBoards(this.boards.map((b) => (b.id === localId ? { ...fn(b), updatedAt: Date.now() } : b)));
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
    this.setBoards([...this.boards, board]);
    const pending = this.insertCreated(tempId, clean, desc, slug);
    this.creating.set(tempId, pending);
    this.track(pending.then(() => undefined));
    void pending.finally(() => this.creating.delete(tempId));
    this.setLastUsedBoard(tempId);
    this.emit();

    return board;
  }

  private async insertCreated(
    tempId: string,
    clean: string,
    desc: string | undefined,
    slug: string,
  ): Promise<string | null> {
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
    if (error || !data) {
      console.error("Failed to create board", error);
      this.setBoards(this.boards.filter((b) => b.id !== tempId));
      if (this.activeId === tempId) this.activeId = SAVED_BOARD_ID;
      if (this.pinnedId === tempId) this.pinnedId = null;
      this.emit();
      return null;
    }
    this.idMap.set(tempId, data.id);
    this.idMap.set(data.id, data.id);
    this.setBoards(
      this.boards.map((b) =>
        b.id === tempId
          ? { ...b, id: data.id, slug: data.slug, createdAt: toMs(data.created_at), updatedAt: toMs(data.updated_at) }
          : b,
      ),
    );
    if (this.activeId === tempId) this.activeId = data.id;
    if (this.pinnedId === tempId) this.pinnedId = data.id;
    this.emit();
    return data.id;
  }

  rename(id: string, name: string) {
    const clean = name.trim();
    if (!clean) return;
    this.patchLocal(id, (b) => ({ ...b, name: clean }));
    this.track(this.persistBoardUpdate(id, { name: clean }));
  }

  setDescription(id: string, description: string) {
    const desc = description.trim() || undefined;
    this.patchLocal(id, (b) => ({ ...b, description: desc }));
    this.track(this.persistBoardUpdate(id, { description: desc ?? null }));
  }

  private async persistBoardUpdate(id: string, patch: { name?: string; description?: string | null; is_public?: boolean }) {
    const cloud = await this.resolveCloudId(id);
    if (!cloud) return;
    const { error } = await this.supabase.from("boards").update(patch).eq("id", cloud);
    if (error) console.error("Failed to update board", error);
  }

  remove(id: string) {
    if (id === SAVED_BOARD_ID) return;
    const cloud = this.cloudId(id);
    this.setBoards(this.boards.filter((b) => b.id !== id && this.idMap.get(id) !== b.id));
    this.idMap.delete(id);
    if (this.activeId === id) this.activeId = SAVED_BOARD_ID;
    if (this.pinnedId === id) this.pinnedId = null;
    this.emit();
    if (cloud) {
      this.track(
        Promise.resolve(
          this.supabase.from("boards").delete().eq("id", cloud),
        ).then(({ error }) => {
          if (error) console.error("Failed to delete board", error);
        }),
      );
    } else {
      const pendingCreate = this.creating.get(id);
      if (pendingCreate) {
        this.track(
          pendingCreate.then((created) => {
            if (!created) return;
            return Promise.resolve(this.supabase.from("boards").delete().eq("id", created)).then(({ error }) => {
              if (error) console.error("Failed to delete board", error);
            });
          }),
        );
      }
    }
  }

  add(boardId: string, templateId: string) {
    const localId = this.localBoardId(boardId) ?? boardId;
    const b = this.boards.find((x) => x.id === localId);
    if (!b || b.templateIds.includes(templateId)) return;
    this.patchLocal(localId, (board) => ({ ...board, templateIds: [templateId, ...board.templateIds] }));
    this.track(this.persistAdd(localId, templateId));
  }

  private async persistAdd(boardId: string, templateId: string) {
    const cloud = await this.resolveCloudId(boardId);
    const localId = this.localBoardId(boardId);
    const board = this.boards.find((b) => b.id === localId);
    if (!cloud) {
      console.error("Failed to save board item: no cloud board id", boardId);
      this.rollbackAdd(boardId, templateId);
      return;
    }
    // User unsaved while we waited for the board uuid — don't resurrect it.
    if (!board?.templateIds.includes(templateId)) return;
    const { error } = await this.supabase.from("board_items").upsert(
      {
        board_id: cloud,
        template_id: templateId,
        position: 0,
      },
      { onConflict: "board_id,template_id" },
    );
    if (error) {
      console.error("Failed to save board item", error);
      this.rollbackAdd(boardId, templateId);
    }
  }

  private rollbackAdd(boardId: string, templateId: string) {
    this.patchLocal(boardId, (b) => ({
      ...b,
      templateIds: b.templateIds.filter((id) => id !== templateId),
    }));
  }

  removeItem(boardId: string, templateId: string) {
    this.patchLocal(boardId, (b) => ({ ...b, templateIds: b.templateIds.filter((x) => x !== templateId) }));
    this.track(this.persistRemove(boardId, templateId));
  }

  private async persistRemove(boardId: string, templateId: string) {
    const cloud = await this.resolveCloudId(boardId);
    if (!cloud) return;
    const localId = this.localBoardId(boardId);
    const board = this.boards.find((b) => b.id === localId);
    // Re-saved while we waited — leave the cloud row alone.
    if (board?.templateIds.includes(templateId)) return;
    const { error } = await this.supabase
      .from("board_items")
      .delete()
      .eq("board_id", cloud)
      .eq("template_id", templateId);
    if (!error) return;
    console.error("Failed to remove board item", error);
    this.patchLocal(boardId, (b) =>
      b.templateIds.includes(templateId) ? b : { ...b, templateIds: [templateId, ...b.templateIds] },
    );
  }

  toggle(boardId: string, templateId: string) {
    const localId = this.localBoardId(boardId) ?? boardId;
    const b = this.boards.find((x) => x.id === localId);
    const has = !!b?.templateIds.includes(templateId);
    if (has) this.removeItem(localId, templateId);
    else this.add(localId, templateId);
    return !has;
  }

  async setPublic(id: string, isPublic: boolean) {
    this.patchLocal(id, (b) => ({ ...b, isPublic }));
    const cloud = await this.resolveCloudId(id);
    if (!cloud) {
      this.patchLocal(id, (b) => ({ ...b, isPublic: !isPublic }));
      throw new Error("Board is not on the server yet");
    }
    const { error } = await this.supabase.from("boards").update({ is_public: isPublic }).eq("id", cloud);
    if (error) {
      this.patchLocal(id, (b) => ({ ...b, isPublic: !isPublic }));
      throw error;
    }
  }
}
