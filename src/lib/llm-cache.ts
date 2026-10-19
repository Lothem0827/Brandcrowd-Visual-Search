import type { AiInterpretation } from "./llm";
import { createAdminClient } from "./supabase/admin";
import { isSupabaseConfigured } from "./supabase/env";

/** L2 durable cache for interpret results. No-ops when service role is unset. */
export async function getInterpretCache(cacheKey: string): Promise<AiInterpretation | null> {
  if (!isSupabaseConfigured()) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("llm_interpret_cache").select("result").eq("cache_key", cacheKey).maybeSingle();
  if (!data?.result || typeof data.result !== "object") return null;
  return data.result as unknown as AiInterpretation;
}

export async function setInterpretCache(cacheKey: string, result: AiInterpretation): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("llm_interpret_cache").upsert({
    cache_key: cacheKey,
    result: result as unknown as import("./supabase/database.types").Json,
  });
}

export async function getMoodboardTitlesCache(cacheKey: string): Promise<string[] | null> {
  if (!isSupabaseConfigured()) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("llm_moodboard_titles_cache").select("titles").eq("cache_key", cacheKey).maybeSingle();
  if (!data?.titles || !Array.isArray(data.titles)) return null;
  return data.titles as string[];
}

export async function setMoodboardTitlesCache(cacheKey: string, titles: string[]): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("llm_moodboard_titles_cache").upsert({
    cache_key: cacheKey,
    titles,
  });
}
