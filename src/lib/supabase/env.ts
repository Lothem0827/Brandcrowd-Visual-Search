/**
 * Public Supabase credentials.
 * Reference each NEXT_PUBLIC_* name as a direct property so Next/Turbopack inlines them
 * into the client bundle (dynamic process.env[name] is not replaced).
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Public browser key: classic anon JWT or newer `sb_publishable_…` key. */
export function supabasePublicKey(): string | undefined {
  const key = SUPABASE_PUBLISHABLE_KEY || SUPABASE_ANON_KEY;
  return key || undefined;
}

/** True when public Supabase env is configured (catalogue/auth can talk to the cloud). */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && supabasePublicKey());
}

export function supabaseUrl(): string {
  if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  return SUPABASE_URL;
}

/** Alias used by createBrowserClient / createServerClient. */
export function supabaseAnonKey(): string {
  const key = supabasePublicKey();
  if (!key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
  }
  return key;
}

export function supabaseServiceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || undefined;
}
