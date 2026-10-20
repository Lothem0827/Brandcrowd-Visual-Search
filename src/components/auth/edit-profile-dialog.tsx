"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clearLocalBoards } from "@/lib/boards";
import { clearLocalMoodboards } from "@/lib/moodboards";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "./auth-provider";
import { ProfileAvatar } from "./profile-avatar";

export function EditProfileDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const hydrateKey = open ? (profile?.id ?? "open") : "closed";
  const [hydratedFor, setHydratedFor] = useState(hydrateKey);
  if (hydratedFor !== hydrateKey) {
    setHydratedFor(hydrateKey);
    setName(profile?.display_name ?? "");
    setBio(profile?.bio ?? "");
    setError(null);
    setConfirmDelete(false);
    setDeleteTyped("");
  }

  const save = async () => {
    if (!user) return;
    const display_name = name.trim();
    if (!display_name) {
      setError("Enter a display name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ display_name, bio: bio.trim() })
        .eq("id", user.id);
      if (updateError) {
        setError("Couldn’t save your profile. Try again.");
        return;
      }
      await refreshProfile();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/account", { method: "POST" });
      if (!res.ok) {
        setError("Couldn’t delete this account. Try again.");
        return;
      }
      clearLocalBoards();
      clearLocalMoodboards();
      try {
        await signOut();
      } catch {
        /* session may already be gone */
      }
      onOpenChange(false);
      router.replace("/");
    } finally {
      setDeleting(false);
    }
  };

  const handleOk = profile?.handle && deleteTyped.trim().toLowerCase() === profile.handle.toLowerCase();

  return (
    <>
      <Dialog open={open && !confirmDelete} onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={false} data-testid="edit-profile-dialog">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <DialogHeader>
              <DialogTitle>Edit profile</DialogTitle>
            </DialogHeader>
            <div className="flex items-center gap-3">
              <ProfileAvatar src={profile?.avatar_url} name={profile?.display_name} size="md" />
              <div className="min-w-0">
                <div className="text-sm font-medium">From Google</div>
                <div className="truncate text-xs text-muted-foreground">
                  {user?.email ?? "Signed in with Google"}
                </div>
              </div>
            </div>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Display name</span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="Display name"
                data-testid="edit-profile-name"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Handle</span>
              <Input value={profile?.handle ? `@${profile.handle}` : ""} readOnly aria-label="Handle" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Bio</span>
              <Textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="A line about your work"
                aria-label="Bio"
                rows={3}
                maxLength={160}
                data-testid="edit-profile-bio"
              />
            </label>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <button
              type="button"
              className="justify-self-start text-sm text-destructive hover:underline"
              onClick={() => setConfirmDelete(true)}
              data-testid="edit-profile-delete"
            >
              Delete account
            </button>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
              <Button type="submit" disabled={saving || !name.trim()} data-testid="edit-profile-save">
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={(next) => !next && setConfirmDelete(false)}>
        <DialogContent showCloseButton={false} role="alertdialog" data-testid="delete-account-dialog">
          <DialogHeader>
            <DialogTitle>Delete account?</DialogTitle>
            <DialogDescription>
              This removes your Google-synced profile, public boards, follows, and cloud saves. It
              cannot be undone. Type <span className="font-medium text-foreground">{profile?.handle}</span>{" "}
              to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={deleteTyped}
            onChange={(e) => setDeleteTyped(e.target.value)}
            aria-label="Type your handle to confirm"
            data-testid="delete-account-confirm"
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              type="button"
              disabled={!handleOk || deleting}
              onClick={() => void deleteAccount()}
              data-testid="delete-account-submit"
            >
              {deleting ? "Deleting…" : "Delete account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
