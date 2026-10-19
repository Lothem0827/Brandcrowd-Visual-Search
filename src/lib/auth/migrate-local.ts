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

/** Push guest local boards / moodboards / grid into the signed-in account once. */
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
  if (wasMigrated(userId)) return;

  const { data: existingBoards } = await supabase.from("boards").select("id, kind, slug, name").eq("owner_id", userId);
  const boards = existingBoards ?? [];
  const saved = boards.find((b) => b.kind === "saved");
  const usedSlugs = new Set(boards.map((b) => b.slug));

  // Merge "Saved" template ids
  const localSaved = opts.boards.find((b) => b.id === SAVED_BOARD_ID);
  if (saved && localSaved?.templateIds.length) {
    const { data: items } = await supabase.from("board_items").select("template_id").eq("board_id", saved.id);
    const have = new Set((items ?? []).map((i) => i.template_id));
    const rows = localSaved.templateIds
      .filter((id) => !have.has(id))
      .map((template_id, i) => ({ board_id: saved.id, template_id, position: i }));
    if (rows.length) await supabase.from("board_items").upsert(rows);
  }

  // Custom boards (skip empty duplicates of existing names)
  const existingNames = new Set(boards.map((b) => b.name.toLowerCase()));
  for (const board of opts.boards) {
    if (board.id === SAVED_BOARD_ID) continue;
    if (!board.templateIds.length && existingNames.has(board.name.toLowerCase())) continue;
    if (existingNames.has(board.name.toLowerCase()) && board.templateIds.length === 0) continue;

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
    if (error || !created) continue;
    existingNames.add(board.name.toLowerCase());
    if (board.templateIds.length) {
      await supabase.from("board_items").insert(
        board.templateIds.map((template_id, position) => ({
          board_id: created.id,
          template_id,
          position,
        })),
      );
    }
  }

  // Moodboards
  const { data: existingMb } = await supabase.from("moodboards").select("id").eq("owner_id", userId);
  const haveMb = new Set((existingMb ?? []).map((m) => m.id));
  const mbUsed = new Set<string>();

  const upsertMb = async (draft: MoodboardDraft, isDraft: boolean) => {
    if (haveMb.has(draft.id)) return;
    const slug = uniqueSlug(draft.query || draft.id, mbUsed);
    await supabase.from("moodboards").upsert({
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
    haveMb.add(draft.id);
  };

  for (const mb of opts.moodboards) await upsertMb(mb, false);
  if (opts.draft) await upsertMb(opts.draft, true);

  // Grid settings — push local only if cloud still has defaults / empty timestamp handling: prefer local on first migrate
  await supabase.from("user_settings").upsert({
    user_id: userId,
    grid: opts.grid as unknown as Json,
    updated_at: new Date().toISOString(),
  });

  markMigrated(userId);
}
