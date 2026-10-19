import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { isSupabaseConfigured, supabaseServiceRoleKey, supabaseUrl } from "./env";

/** Service-role client for server-only writes (LLM cache upsert, seed). Returns null if unset. */
export function createAdminClient() {
  const key = supabaseServiceRoleKey();
  if (!isSupabaseConfigured() || !key) return null;
  return createClient<Database>(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
