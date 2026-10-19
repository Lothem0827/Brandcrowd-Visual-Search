"use client";

import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/lib/supabase/database.types";

export type AuthState = {
  ready: boolean;
  user: User | null;
  profile: Profile | null;
};

export const EMPTY_AUTH: AuthState = { ready: false, user: null, profile: null };
