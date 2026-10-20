"use client";

import { useState } from "react";
import { LockIcon, MoreHorizontalIcon, PencilIcon, ShareIcon } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { SAVED_BOARD_ID, type Board } from "@/lib/boards";
import { useBoards } from "./use-boards";

export function BoardMenu({
  board,
  onDeleted,
}: {
  board: Board;
  onDeleted: () => void;
}) {
  const { user, profile, signInWithGoogle } = useAuth();
  const { store } = useBoards();
  const [sharePrompt, setSharePrompt] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(board.name);
  const [description, setDescription] = useState(board.description ?? "");
  const [isPrivate, setIsPrivate] = useState(!board.isPublic);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const copyLink = async (slug = board.slug) => {
    if (!profile?.handle || !slug) return;
    const url = `${window.location.origin}/u/${profile.handle}/b/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.success("Link ready to copy", { description: url });
    }
  };

  const makePublicAndCopy = async () => {
    setBusy(true);
    try {
      await store.setPublic?.(board.id, true);
      await copyLink();
      setSharePrompt(false);
    } catch {
      toast.error("Couldn’t make this board public.");
    } finally {
      setBusy(false);
    }
  };

  const onShare = async () => {
    if (!user || !profile?.handle) {
      await signInWithGoogle("/boards");
      return;
    }
    if (!board.isPublic) {
      setSharePrompt(true);
      return;
    }
    await copyLink();
  };

  const setPrivate = async (nextPrivate: boolean) => {
    if (!user) {
      await signInWithGoogle("/boards");
      return;
    }
    try {
      await store.setPublic?.(board.id, !nextPrivate);
    } catch {
      toast.error("Couldn’t update board visibility.");
    }
  };

  const openEdit = () => {
    setName(board.name);
    setDescription(board.description ?? "");
    setIsPrivate(!board.isPublic);
    setPendingDelete(false);
    setEditing(true);
  };

  const saveEdit = async () => {
    const clean = name.trim();
    if (!clean) return;
    store.rename(board.id, clean);
    store.setDescription(board.id, description);
    if (user && !isPrivate !== !!board.isPublic) {
      try {
        await store.setPublic?.(board.id, !isPrivate);
      } catch {
        toast.error("Couldn’t update board visibility.");
        return;
      }
    } else if (!user && !isPrivate) {
      await signInWithGoogle("/boards");
      return;
    }
    setEditing(false);
  };

  return (
    <>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-full px-3 active:scale-[0.97]"
          onClick={() => void onShare()}
          data-testid="board-share"
        >
          <ShareIcon className="size-3.5" />
          Share
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="rounded-full active:scale-[0.97]"
                aria-label="Board menu"
                data-testid="board-kebab"
              />
            }
          >
            <MoreHorizontalIcon className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuItem onClick={openEdit}>
              <PencilIcon />
              Edit
            </DropdownMenuItem>
            <div
              className="flex items-center justify-between gap-3 rounded-md px-1.5 py-1 text-sm"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <span className="flex items-center gap-1.5">
                <LockIcon className="size-4 text-muted-foreground" />
                Private
              </span>
              <Switch
                size="sm"
                checked={!board.isPublic}
                onCheckedChange={(checked) => void setPrivate(checked)}
                aria-label="Private board"
              />
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={sharePrompt} onOpenChange={setSharePrompt}>
        <DialogContent showCloseButton={false} data-testid="share-private-dialog">
          <DialogHeader>
            <DialogTitle>This board is private</DialogTitle>
            <DialogDescription>
              Make it public to copy a share link. Anyone with the link will be able to view it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void makePublicAndCopy()}
              data-testid="share-make-public"
            >
              Make public
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editing} onOpenChange={(open) => !open && setEditing(false)}>
        <DialogContent showCloseButton={false} data-testid="edit-board-dialog">
          {pendingDelete ? (
            <>
              <DialogHeader>
                <DialogTitle>Delete board “{board.name}”?</DialogTitle>
                <DialogDescription>
                  Designs in it stay in your other boards. This can&apos;t be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setPendingDelete(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  type="button"
                  onClick={() => {
                    store.remove(board.id);
                    setEditing(false);
                    onDeleted();
                  }}
                >
                  Delete board
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void saveEdit();
              }}
            >
              <DialogHeader>
                <DialogTitle>Edit board</DialogTitle>
              </DialogHeader>
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Board name</span>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-label="Board name"
                  data-testid="edit-board-name"
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Description</span>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What’s this board for? (optional)"
                  aria-label="Description"
                  rows={3}
                  data-testid="edit-board-description"
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Private</span>
                <Switch
                  checked={isPrivate}
                  onCheckedChange={(checked) => {
                    if (!user && !checked) {
                      void signInWithGoogle("/boards");
                      return;
                    }
                    setIsPrivate(checked);
                  }}
                  aria-label="Private board"
                />
              </label>
              {board.id !== SAVED_BOARD_ID ? (
                <button
                  type="button"
                  className="justify-self-start text-sm text-destructive hover:underline"
                  onClick={() => setPendingDelete(true)}
                  data-testid="edit-board-delete"
                >
                  Delete board
                </button>
              ) : null}
              <DialogFooter>
                <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
                <Button type="submit" disabled={!name.trim()} data-testid="edit-board-save">
                  Save
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
