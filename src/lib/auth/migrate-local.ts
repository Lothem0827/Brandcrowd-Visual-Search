import type { SupabaseClient } from "@supabase/supabase-js";
import { SAVED_BOARD_ID, type Board } from "@/lib/boards";
import type { MoodboardDraft } from "@/lib/moodboards";
import type { GridSettings } from "@/components/explorer/use-grid-settings";
import type { Database, Json } from "@/lib/supabase/database.types";
import { slugify } from "@/lib/slug";

const MIGRATED_PREFIX = "template-taxonomy:migrated:v1:";

export function wasMigrated(userId: string): boolean {
  try {
    return typeof window !== "undefined" && localStorage.getItem(MIGRATED_PREFIX + userId) === "1";
  } catch {
    return false;
  }
}

export function markMigrated(userId: string) {
  try {
    localStorage.setItem(MIGRATED_PREFIX + userId, "1");
  } catch {
    /* ignore */
  }
}

function uniqueSlug(base: string, used: Set<string>): string {
  let s = slugify(base) || "board";
  if (!used.has(s)) {
    used.add(s);
    return s;
  }
  let n = 2;
  while (used.has(`${s}-${n}`)) n += 1;
  const next = `${s}-${n}`;
  used.add(next);
  return next;
}

/**
 * Copy guest boards (incl. "Saved") into the account.
 * Runs on every sign-in, not just the first: it's a no-op when there's nothing
 * local, and a set-difference merge so it never duplicates. Throws on failure
 * so the local copy is kept for the next attempt instead of being lost.
 * Does not clear localStorage — AuthProvider does that after the cloud store is live.
 */
async function migrateLocalBoards(supabase: SupabaseClient<Database>, userId: string, localBoards: Board[]) {
  const hasData = localBoards.some((b) => b.templateIds.length > 0 || b.id !== SAVED_BOARD_ID);
  if (!hasData) return;

  const { data: existingBoards, error: listErr } = await supabase
    .from("boards")
    .select("id, kind, slug, name")
    .eq("owner_id", userId);
  if (listErr) throw listErr;
  const boards = existingBoards ?? [];
  const saved = boards.find((b) => b.kind === "saved");
  const usedSlugs = new Set(boards.map((b) => b.slug));

  // Merge "Saved" template ids
  const localSaved = localBoards.find((b) => b.id === SAVED_BOARD_ID);
  if (localSaved?.templateIds.length) {
    if (!saved) throw new Error("Cloud Saved board missing; keeping local saves for next sign-in");
    const { data: items, error } = await supabase.from("board_items").select("template_id").eq("board_id", saved.id);
    if (error) throw error;
    const have = new Set((items ?? []).map((i) => i.template_id));
    const rows = localSaved.templateIds
      .filter((id) => !have.has(id))
      .map((template_id, i) => ({ board_id: saved.id, template_id, position: i }));
    if (rows.length) {
      const { error: upErr } = await supabase.from("board_items").upsert(rows, { onConflict: "board_id,template_id" });
      if (upErr) throw upErr;
    }
  }

  // Custom boards: merge into an existing same-name board, otherwise insert.
  const byName = new Map(
    boards.filter((b) => b.kind !== "saved").map((b) => [b.name.toLowerCase(), b] as const),
  );
  for (const board of localBoards) {
    if (board.id === SAVED_BOARD_ID) continue;

    const existing = byName.get(board.name.toLowerCase());
    if (existing) {
      if (!board.templateIds.length) continue;
      const { data: items, error } = await supabase
        .from("board_items")
        .select("template_id")
        .eq("board_id", existing.id);
      if (error) throw error;
      const have = new Set((items ?? []).map((i) => i.template_id));
      const rows = board.templateIds
        .filter((id) => !have.has(id))
        .map((template_id, position) => ({ board_id: existing.id, template_id, position }));
      if (rows.length) {
        const { error: itemsErr } = await supabase
          .from("board_items")
          .upsert(rows, { onConflict: "board_id,template_id" });
        if (itemsErr) throw itemsErr;
      }
      continue;
    }

    const slug = uniqueSlug(board.name, usedSlugs);
    const { data: created, error } = await supabase
      .from("boards")
      .insert({
        owner_id: userId,
        name: board.name,
        description: board.description ?? null,
        slug,
        kind: "custom",
        is_public: false,
      })
      .select("id")
      .single();
    if (error || !created) throw error ?? new Error("Board insert failed");
    byName.set(board.name.toLowerCase(), { ...created, kind: "custom", slug, name: board.name });
    if (board.templateIds.length) {
      const { error: itemsErr } = await supabase.from("board_items").insert(
        board.templateIds.map((template_id, position) => ({
          board_id: created.id,
          template_id,
          position,
        })),
      );
      if (itemsErr) throw itemsErr;
    }
  }
}

/** Push guest local data into the signed-in account. */
export async function migrateLocalToCloud(
  supabase: SupabaseClient<Database>,
  userId: string,
  opts: {
    boards: Board[];
    moodboards: MoodboardDraft[];
    draft: MoodboardDraft | null;
    grid: GridSettings;
  },
): Promise<void> {
  await migrateLocalBoards(supabase, userId, opts.boards);

  // Moodboards: every sign-in, skip ids that already exist so cloud edits are never overwritten.
  const { data: existingMb } = await supabase.from("moodboards").select("id").eq("owner_id", userId);
  const haveMb = new Set((existingMb ?? []).map((m) => m.id));
  const mbUsed = new Set<string>();

  const upsertMb = async (draft: MoodboardDraft, isDraft: boolean) => {
    if (haveMb.has(draft.id)) return;
    const slug = uniqueSlug(draft.query || draft.id, mbUsed);
    const { error } = await supabase.from("moodboards").upsert({
      id: draft.id,
      owner_id: userId,
      query: draft.query,
      titles: draft.titles as unknown as Json,
      tags: draft.tags as unknown as Json,
      colors: draft.colors as unknown as Json,
      selected: draft.selected,
      harmony: draft.harmony,
      overrides: draft.overrides as unknown as Json,
      inspo_ids: draft.inspoIds as unknown as Json,
      slug,
      is_draft: isDraft,
      is_public: false,
      updated_at: new Date(draft.updatedAt || Date.now()).toISOString(),
    });
    if (error) throw error;
    haveMb.add(draft.id);
  };

  for (const mb of opts.moodboards) await upsertMb(mb, false);
  if (opts.draft) await upsertMb(opts.draft, true);

  // Grid: first sign-in only so later cloud prefs are not clobbered by leftover local.
  if (wasMigrated(userId)) return;

  const { error: gridErr } = await supabase.from("user_settings").upsert({
    user_id: userId,
    grid: opts.grid as unknown as Json,
    updated_at: new Date().toISOString(),
  });
  if (gridErr) throw gridErr;
}
