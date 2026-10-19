import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createPublicClient } from "@/lib/supabase/public";
import type { BoardRow, MoodboardRow, Profile } from "@/lib/supabase/database.types";

export async function getProfileByHandle(handle: string): Promise<Profile | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createPublicClient();
  const { data } = await supabase.from("profiles").select("*").eq("handle", handle.toLowerCase()).maybeSingle();
  return data;
}

export async function getPublicBoards(ownerId: string): Promise<(BoardRow & { template_ids: string[] })[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("boards")
    .select("*, board_items(template_id, position)")
    .eq("owner_id", ownerId)
    .eq("is_public", true)
    .order("updated_at", { ascending: false });
  type BoardJoin = BoardRow & { board_items: { template_id: string; position: number }[] | null };
  return ((data ?? []) as unknown as BoardJoin[]).map((row) => {
    const items = row.board_items ?? [];
    items.sort((a, b) => a.position - b.position);
    const { board_items: _, ...board } = row;
    return { ...board, template_ids: items.map((i) => i.template_id) };
  });
}

export async function getPublicBoard(ownerId: string, slug: string) {
  if (!isSupabaseConfigured()) return null;
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("boards")
    .select("*, board_items(template_id, position)")
    .eq("owner_id", ownerId)
    .eq("slug", slug)
    .eq("is_public", true)
    .maybeSingle();
  if (!data) return null;
  type BoardJoin = BoardRow & { board_items: { template_id: string; position: number }[] | null };
  const row = data as unknown as BoardJoin;
  const items = row.board_items ?? [];
  items.sort((a, b) => a.position - b.position);
  const { board_items: _, ...board } = row;
  return { ...board, template_ids: items.map((i) => i.template_id) };
}

export async function getPublicMoodboards(ownerId: string): Promise<MoodboardRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("moodboards")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("is_public", true)
    .eq("is_draft", false)
    .order("updated_at", { ascending: false });
  return data ?? [];
}

export async function getPublicMoodboard(ownerId: string, slug: string): Promise<MoodboardRow | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("moodboards")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("slug", slug)
    .eq("is_public", true)
    .eq("is_draft", false)
    .maybeSingle();
  return data;
}

export async function getFollowCounts(userId: string): Promise<{ followers: number; following: number }> {
  if (!isSupabaseConfigured()) return { followers: 0, following: 0 };
  const supabase = createPublicClient();
  const [{ count: followers }, { count: following }] = await Promise.all([
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", userId),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", userId),
  ]);
  return { followers: followers ?? 0, following: following ?? 0 };
}

export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("follower_id", followerId)
    .eq("following_id", followingId)
    .maybeSingle();
  return !!data;
}

export async function getFollowingFeed(userId: string, limit = 40) {
  if (!isSupabaseConfigured()) return [];
  const supabase = createPublicClient();
  const { data: follows } = await supabase.from("follows").select("following_id").eq("follower_id", userId);
  const ids = (follows ?? []).map((f) => f.following_id);
  if (!ids.length) return [];
  const { data: boards } = await supabase
    .from("boards")
    .select("*")
    .in("owner_id", ids)
    .eq("is_public", true)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (!boards?.length) return [];
  const { data: profiles } = await supabase.from("profiles").select("id, handle, display_name, avatar_url").in("id", ids);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  return boards.map((b) => ({ ...b, profile: byId.get(b.owner_id) ?? null }));
}
