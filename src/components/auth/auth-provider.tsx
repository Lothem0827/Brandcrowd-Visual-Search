"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { clearLocalBoards, getLocalBoardsSnapshot, SAVED_BOARD_ID, setBoardStore } from "@/lib/boards";
import { SupabaseBoardStore } from "@/lib/boards-supabase";
import { markMigrated, migrateLocalToCloud } from "@/lib/auth/migrate-local";
import { EMPTY_AUTH, type AuthState } from "@/lib/auth/session";
import { clearLocalMoodboards, getLocalMoodboardsSnapshot, setMoodboardStore } from "@/lib/moodboards";
import { SupabaseMoodboardStore } from "@/lib/moodboards-supabase";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/supabase/database.types";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  getGridSettingsSnapshot,
  pullCloudGridSettings,
  pushGridSettingsToCloud,
  setGridCloudUser,
} from "@/components/explorer/use-grid-settings";

type AuthContextValue = AuthState & {
  configured: boolean;
  signInWithGoogle: (next?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadProfile(userId: string): Promise<Profile | null> {
  const supabase = createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  return data;
}

async function activateCloud(user: User) {
  const supabase = createClient();
  const snapshot = () => ({
    boards: getLocalBoardsSnapshot(),
    moodboards: getLocalMoodboardsSnapshot().saved,
    draft: getLocalMoodboardsSnapshot().draft,
    grid: getGridSettingsSnapshot(),
  });

  await migrateLocalToCloud(supabase, user.id, snapshot());

  const boardStore = new SupabaseBoardStore(supabase, user.id);
  await boardStore.load();
  setBoardStore(boardStore);

  const mbStore = new SupabaseMoodboardStore(supabase, user.id);
  await mbStore.load();
  setMoodboardStore(mbStore);

  await pullCloudGridSettings(user.id);

  // Saves that landed in localStorage while we were swapping to the cloud store.
  const leftover = getLocalBoardsSnapshot();
  for (const board of leftover) {
    if (board.id === SAVED_BOARD_ID) {
      for (const id of board.templateIds) boardStore.add(SAVED_BOARD_ID, id);
      continue;
    }
    const existing = boardStore.list().find(
      (b) => b.id !== SAVED_BOARD_ID && b.name.toLowerCase() === board.name.toLowerCase(),
    );
    if (existing) {
      for (const id of board.templateIds) boardStore.add(existing.id, id);
    }
  }
  await migrateLocalToCloud(supabase, user.id, snapshot());
  await boardStore.flush();
  markMigrated(user.id);
  clearLocalBoards();
  clearLocalMoodboards();
}

function deactivateCloud() {
  setBoardStore(null);
  setMoodboardStore(null);
  setGridCloudUser(null);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [state, setState] = useState<AuthState>(EMPTY_AUTH);

  const refreshProfile = useCallback(async () => {
    if (!state.user) return;
    const profile = await loadProfile(state.user.id);
    setState((s) => ({ ...s, profile }));
  }, [state.user]);

  useEffect(() => {
    if (!configured) {
      setState({ ready: true, user: null, profile: null });
      return;
    }

    const supabase = createClient();
    let cancelled = false;
    let activeUserId: string | null = null;

    const applySession = async (user: User | null, force = false) => {
      if (cancelled) return;
      if (!user) {
        activeUserId = null;
        deactivateCloud();
        setState({ ready: true, user: null, profile: null });
        return;
      }
      if (!force && user.id === activeUserId) {
        setState((s) =>
          s.ready && s.user?.id === user.id && s.user.updated_at === user.updated_at ? s : { ...s, ready: true, user },
        );
        return;
      }
      activeUserId = user.id;
      try {
        await activateCloud(user);
        const profile = await loadProfile(user.id);
        if (!cancelled) setState({ ready: true, user, profile });
      } catch (err) {
        console.error("Failed to activate cloud stores", err);
        activeUserId = null;
        if (!cancelled) setState({ ready: true, user, profile: null });
      }
    };

    supabase.auth.getSession().then(({ data }) => applySession(data.session?.user ?? null, true));

    // supabase-js re-emits SIGNED_IN whenever the tab becomes visible again, so the event
    // alone doesn't mean a new sign-in: only a different user reloads the cloud stores.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED") return;
      void applySession(session?.user ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [configured]);

  const signInWithGoogle = useCallback(async (next = "/") => {
    if (!configured) return;
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
  }, [configured]);

  const signOut = useCallback(async () => {
    if (!configured) return;
    // Push latest grid before leaving cloud
    if (state.user) {
      try {
        await pushGridSettingsToCloud(state.user.id);
      } catch {
        /* ignore */
      }
    }
    const supabase = createClient();
    await supabase.auth.signOut();
    deactivateCloud();
    setState({ ready: true, user: null, profile: null });
  }, [configured, state.user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      configured,
      signInWithGoogle,
      signOut,
      refreshProfile,
    }),
    [state, configured, signInWithGoogle, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    return {
      ...EMPTY_AUTH,
      ready: true,
      configured: false,
      signInWithGoogle: async () => {},
      signOut: async () => {},
      refreshProfile: async () => {},
    };
  }
  return ctx;
}
