import type { SupabaseClient } from "@supabase/supabase-js";
import { slugify } from "@/lib/slug";
import type { Database, Json } from "@/lib/supabase/database.types";
import { runQuery } from "@/lib/supabase/run-query";
import {
  EMPTY_MOODBOARD_STATE,
  type GeneratedMoodboard,
  type MoodboardDraft,
  type MoodboardState,
  type MoodboardStore,
} from "./moodboards";
import type { HarmonyId } from "./harmony";
import { HARMONIES } from "./harmony";
import { normalizeHex } from "./color";

type Client = SupabaseClient<Database>;

const HARMONY_IDS = new Set(HARMONIES.map((h) => h.id));

function now() {
  return Date.now();
}

function createId() {
  return `mb_${now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function rowToDraft(row: Database["public"]["Tables"]["moodboards"]["Row"]): MoodboardDraft {
  return {
    id: row.id,
    query: row.query,
    titles: (row.titles as unknown as string[]) ?? [],
    tags: (row.tags as unknown as string[]) ?? [],
    colors: (row.colors as unknown as MoodboardDraft["colors"]) ?? [],
    selected: row.selected,
    harmony: (HARMONY_IDS.has(row.harmony as HarmonyId) ? row.harmony : "analogous") as HarmonyId,
    overrides: (row.overrides as unknown as Record<string, string>) ?? {},
    inspoIds: (row.inspo_ids as unknown as string[]) ?? [],
    updatedAt: new Date(row.updated_at).getTime(),
    isPublic: row.is_public,
    slug: row.slug,
    ownerId: row.owner_id,
  };
}

function draftPayload(draft: MoodboardDraft, userId: string, isDraft: boolean) {
  return {
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
    slug: draft.slug ?? slugify(draft.query || draft.id),
    is_draft: isDraft,
    is_public: draft.isPublic ?? false,
    updated_at: new Date(draft.updatedAt || Date.now()).toISOString(),
  };
}

export class SupabaseMoodboardStore implements MoodboardStore {
  private state: MoodboardState = { ...EMPTY_MOODBOARD_STATE };
  private generation = 0;
  private listeners = new Set<() => void>();

  constructor(
    private supabase: Client,
    private userId: string,
  ) {}

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private commit(next: MoodboardState) {
    this.state = next;
    this.emit();
  }

  async load() {
    const { data, error } = await this.supabase.from("moodboards").select("*").eq("owner_id", this.userId);
    if (error) throw error;
    const rows = data ?? [];
    const draftRow = rows.find((r) => r.is_draft);
    const saved = rows.filter((r) => !r.is_draft).map(rowToDraft);
    this.commit({
      ...EMPTY_MOODBOARD_STATE,
      draft: draftRow ? rowToDraft(draftRow) : null,
      saved,
    });
  }

  getState() {
    return this.state;
  }

  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private persistDraft(draft: MoodboardDraft | null) {
    if (!draft) {
      void runQuery(
        this.supabase.from("moodboards").delete().eq("owner_id", this.userId).eq("is_draft", true),
        (error) => console.error("Failed to clear moodboard draft", error),
      );
      return;
    }
    void runQuery(
      this.supabase.from("moodboards").upsert(draftPayload(draft, this.userId, true)),
      (error) => console.error("Failed to save moodboard draft", error),
    );
  }

  private persistSaved(draft: MoodboardDraft) {
    void runQuery(
      this.supabase.from("moodboards").upsert(
        draftPayload({ ...draft, isPublic: draft.isPublic ?? false }, this.userId, false),
      ),
      (error) => console.error("Failed to save moodboard", error),
    );
  }

  applyGenerated(input: GeneratedMoodboard): number {
    this.generation += 1;
    const prev = this.state.draft;
    const draft: MoodboardDraft = {
      id: prev?.id ?? createId(),
      query: input.query.trim().slice(0, 80),
      titles: [],
      tags: input.tags.slice(0, 12),
      colors: input.colors.slice(0, 6),
      selected: 0,
      harmony: "analogous",
      overrides: {},
      inspoIds: prev?.inspoIds ?? [],
      updatedAt: now(),
      slug: slugify(input.query),
      ownerId: this.userId,
    };
    this.commit({
      ...this.state,
      draft,
      titlesPending: true,
      miss: false,
      attempt: null,
      formEpoch: this.state.formEpoch + 1,
    });
    this.persistDraft(draft);
    return this.generation;
  }

  setTitles(token: number, titles: string[]) {
    if (token !== this.generation || !this.state.draft) return;
    const draft = { ...this.state.draft, titles: titles.slice(0, 6), updatedAt: now() };
    this.commit({ ...this.state, titlesPending: false, draft });
    this.persistDraft(draft);
  }

  miss(query: string) {
    this.generation += 1;
    this.commit({
      ...this.state,
      draft: null,
      titlesPending: false,
      miss: true,
      pinned: false,
      attempt: query.trim().slice(0, 80),
      formEpoch: this.state.formEpoch + 1,
    });
    this.persistDraft(null);
  }

  private patchDraft(fn: (d: MoodboardDraft) => MoodboardDraft) {
    if (!this.state.draft) return;
    const draft = { ...fn(this.state.draft), updatedAt: now() };
    this.commit({ ...this.state, draft });
    this.persistDraft(draft);
  }

  setSelected(index: number) {
    this.patchDraft((d) => ({
      ...d,
      selected: d.colors.length ? Math.min(Math.max(0, index), d.colors.length - 1) : 0,
    }));
  }

  setHarmony(harmony: HarmonyId) {
    if (!HARMONY_IDS.has(harmony)) return;
    this.patchDraft((d) => ({ ...d, harmony }));
  }

  setOverride(index: number, hex: string) {
    const next = normalizeHex(hex);
    if (!next) return;
    this.patchDraft((d) => ({ ...d, overrides: { ...d.overrides, [String(index)]: next } }));
  }

  addInspo(templateId: string) {
    this.patchDraft((d) =>
      d.inspoIds.includes(templateId) || d.inspoIds.length >= 60 ? d : { ...d, inspoIds: [...d.inspoIds, templateId] },
    );
  }

  removeInspo(templateId: string) {
    this.patchDraft((d) => ({ ...d, inspoIds: d.inspoIds.filter((id) => id !== templateId) }));
  }

  save() {
    const draft = this.state.draft;
    if (!draft?.query.trim()) return null;
    const next: MoodboardDraft = {
      ...draft,
      query: draft.query.trim(),
      updatedAt: now(),
      slug: draft.slug ?? slugify(draft.query),
      isPublic: draft.isPublic ?? false,
    };
    const saved = this.state.saved.some((item) => item.id === next.id)
      ? this.state.saved.map((item) => (item.id === next.id ? next : item))
      : [next, ...this.state.saved];
    this.commit({ ...this.state, draft: next, saved });
    this.persistSaved(next);
    // Keep draft row in sync too
    this.persistDraft(next);
    return next;
  }

  createNew() {
    this.generation += 1;
    this.commit({
      ...this.state,
      draft: null,
      pinned: false,
      titlesPending: false,
      miss: false,
      attempt: null,
      formEpoch: this.state.formEpoch + 1,
    });
    this.persistDraft(null);
  }

  open(id: string) {
    const found = this.state.saved.find((item) => item.id === id);
    if (!found) return;
    this.generation += 1;
    const draft = { ...found, titles: [...found.titles], tags: [...found.tags], colors: found.colors.map((c) => ({ ...c })), overrides: { ...found.overrides }, inspoIds: [...found.inspoIds] };
    this.commit({
      ...this.state,
      draft,
      pinned: false,
      titlesPending: false,
      miss: false,
      attempt: null,
      formEpoch: this.state.formEpoch + 1,
    });
    this.persistDraft(draft);
  }

  removeSaved(id: string) {
    const removed = this.state.saved.find((item) => item.id === id);
    this.commit({ ...this.state, saved: this.state.saved.filter((item) => item.id !== id) });
    void runQuery(
      this.supabase.from("moodboards").delete().eq("id", id).eq("owner_id", this.userId),
      (error) => {
        console.error("Failed to delete moodboard", error);
        if (!removed) return;
        if (this.state.saved.some((item) => item.id === id)) return;
        this.commit({ ...this.state, saved: [removed, ...this.state.saved] });
      },
    );
  }

  pin() {
    if (!this.state.draft || this.state.pinned) return;
    this.commit({ ...this.state, pinned: true });
  }

  unpin() {
    if (!this.state.pinned) return;
    this.commit({ ...this.state, pinned: false });
  }

  async setPublic(id: string, isPublic: boolean) {
    const prevSaved = this.state.saved;
    const prevDraft = this.state.draft;
    const saved = this.state.saved.map((item) => (item.id === id ? { ...item, isPublic } : item));
    const draft = this.state.draft?.id === id ? { ...this.state.draft, isPublic } : this.state.draft;
    this.commit({ ...this.state, saved, draft });
    const { error } = await this.supabase
      .from("moodboards")
      .update({ is_public: isPublic, is_draft: false })
      .eq("id", id)
      .eq("owner_id", this.userId);
    if (error) {
      this.commit({ ...this.state, saved: prevSaved, draft: prevDraft });
      throw error;
    }
  }
}
