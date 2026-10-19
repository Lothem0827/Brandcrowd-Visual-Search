"use client";

import { LogOutIcon } from "lucide-react";
import { useAuth } from "./auth-provider";

/** Account block for the bottom of the Settings panel. */
export function SettingsAccount() {
  const { ready, configured, user, profile, signInWithGoogle, signOut } = useAuth();

  if (!configured) {
    return (
      <section className="space-y-2 border-t border-border pt-4">
        <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Account</div>
        <p className="text-xs text-muted-foreground">
          Add Supabase env keys to enable Google sync.
        </p>
      </section>
    );
  }

  if (!ready) {
    return (
      <section className="space-y-2 border-t border-border pt-4">
        <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Account</div>
        <p className="text-xs text-muted-foreground">Loading…</p>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="space-y-3 border-t border-border pt-4">
        <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Account</div>
        <p className="text-xs text-muted-foreground">
          Sync boards online and open them on any device.
        </p>
        <button
          type="button"
          onClick={() => void signInWithGoogle()}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <GoogleMark />
          Sync with Google
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-3 border-t border-border pt-4">
      <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Account</div>
      <div className="flex items-center gap-3">
        {profile?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt=""
            className="size-9 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="flex size-9 items-center justify-center rounded-full bg-muted text-xs font-medium">
            {(profile?.display_name || user.email || "?").slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{profile?.display_name || "Signed in"}</div>
          <div className="truncate text-xs text-muted-foreground">
            {profile?.handle ? `@${profile.handle}` : user.email}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void signOut()}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <LogOutIcon className="size-3.5" />
        Sign out
      </button>
    </section>
  );
}

function GoogleMark() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        opacity=".9"
      />
      <path
        fill="currentColor"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        opacity=".7"
      />
      <path
        fill="currentColor"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        opacity=".8"
      />
      <path
        fill="currentColor"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        opacity=".85"
      />
    </svg>
  );
}
