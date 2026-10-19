"use client";
import { useCallback, useMemo, useState } from "react";
import { BookmarkIcon, PaletteIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SAVED_BOARD_ID, type Board } from "@/lib/boards";
import type { MoodboardDraft } from "@/lib/moodboards";
import type { Template } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { BackButton } from "./back-button";
import { BoardCover } from "./board-cover";
import { useExplorer } from "./context";
import { GridView } from "./grid-view";
import { HEADER_ROW, HEADER_TITLE } from "./header";
import { MoodboardCover, moodboardCardTitle } from "./moodboard-cover";
import { useBoards } from "./use-boards";
import { useMoodboards } from "./use-moodboards";

type BoardsTab = "boards" | "saves" | "moodboards";

/**
 * Full-page boards index (rail "Boards"): a Boards tab of board cards with a dashed
 * "New board" placeholder kept last, a Saves tab that flattens every board's designs
 * into one grid, and a Moodboards tab of saved moodboards. Boards are still local-only,
 * so there's no profile chrome here yet.
 */
export function BoardsPage() {
  const { base, byId, setView, setDetailOpen, setPage } = useExplorer();
  const { boards, store } = useBoards();
  const { saved, store: moodboards } = useMoodboards();
  const [tab, setTab] = useState<BoardsTab>("boards");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  // The page is the scroller; the Saves grid windows against it (like the focused lightbox).
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const scrollRef = useCallback(
    (el: HTMLDivElement | null) => setScrollEl(el),
    [],
  );

  const closeCreate = () => {
    setCreating(false);
    setNewName("");
    setNewDescription("");
  };

  const savedCount = useMemo(
    () => new Set(boards.flatMap((b) => b.templateIds)).size,
    [boards],
  );

  // Every saved design once, most recently touched board first.
  const saves = useMemo(() => {
    const seen = new Set<string>();
    const out: Template[] = [];
    for (const b of [...boards].sort((x, y) => y.updatedAt - x.updatedAt)) {
      for (const id of b.templateIds) {
        if (seen.has(id)) continue;
        seen.add(id);
        const t = byId(id);
        if (t) out.push(t);
      }
    }
    return out;
  }, [boards, byId]);

  const titles = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of saved) {
      if (!map.has(item.query)) map.set(item.query, moodboardCardTitle(base, item.query));
    }
    return map;
  }, [saved, base]);

  const openBoard = (b: Board) => {
    // Page first: changing page clears the view, so the board view must be set after it.
    setPage("boards");
    setView({ kind: "board", boardId: b.id });
    setDetailOpen(false);
  };

  const openMoodboard = (item: MoodboardDraft) => {
    moodboards.open(item.id);
    setPage("brief");
  };

  return (
    <div
      ref={scrollRef}
      className="thin-scroll h-full overflow-y-auto"
      data-testid="boards-page"
    >
      <div className="mx-auto w-full pb-28">
        <div className={HEADER_ROW}>
          <BackButton label="Back" onClick={() => setPage("explore")} />
          <h1 className={HEADER_TITLE}>Boards</h1>
          {/* Tabs center in the space right of the title; the underline track matches the
              detail panel's tab pattern (border-b + -mb-px indicator). */}
          <div className="flex min-w-0 flex-1 justify-center">
            <div
              className="flex items-stretch border-b border-border/60"
              role="tablist"
              aria-label="Boards views"
            >
              {(
                [
                  ["boards", `Boards ${boards.length}`],
                  ["saves", `Saves ${savedCount}`],
                  ["moodboards", `Moodboards ${saved.length}`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={cn(
                    "-mb-px h-10 border-b-2 px-4 text-[13px] font-medium whitespace-nowrap transition-colors",
                    tab === id
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {tab === "boards" ? (
          <div className="grid grid-cols-2 gap-x-5 gap-y-7 px-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {boards.map((b) => (
              <div key={b.id} className="group relative text-left">
                <button
                  type="button"
                  onClick={() => openBoard(b)}
                  className="flex w-full flex-col gap-2 text-left"
                  data-testid="board-card"
                >
                  <BoardCover
                    items={b.templateIds
                      .map((id) => byId(id))
                      .filter((t): t is Template => !!t)}
                    className="aspect-[3/2] w-full"
                  />
                  <div className="min-w-0 px-0.5">
                    <div className="truncate text-sm font-semibold">
                      {b.name}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {b.description ||
                        `${b.templateIds.length} design${b.templateIds.length === 1 ? "" : "s"}`}
                    </div>
                  </div>
                </button>
                {b.id !== SAVED_BOARD_ID && (
                  <button
                    type="button"
                    aria-label={`Delete board ${b.name}`}
                    onClick={() => setPendingDelete({ id: b.id, name: b.name })}
                    className="absolute top-2 right-2 grid size-8 place-items-center rounded-lg bg-background/80 text-muted-foreground backdrop-blur transition-opacity hover:bg-background hover:text-foreground [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
            {/* New board placeholder rides last so it reads as "add another". */}
            <button
              type="button"
              onClick={() => setCreating(true)}
              data-testid="new-board-placeholder"
              className="group flex aspect-[3/2] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-panel hover:text-foreground"
            >
              <PlusIcon className="size-5 transition-transform group-hover:scale-110" />
              New board
            </button>
          </div>
        ) : tab === "saves" ? (
          saves.length ? (
            <GridView items={saves} hideSave scrollContainer={scrollEl} />
          ) : (
            <div className="flex flex-col items-center gap-1.5 px-4 py-24 text-center">
              <BookmarkIcon className="size-7 text-muted-foreground" />
              <div className="text-sm font-semibold">No saves yet</div>
              <div className="text-xs text-muted-foreground">
                Save a design and it&apos;ll show up here.
              </div>
            </div>
          )
        ) : saved.length ? (
          <div className="grid grid-cols-2 gap-x-5 gap-y-7 px-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {saved.map((item) => {
              const title = titles.get(item.query) ?? item.query;
              const designs = item.inspoIds
                .map((id) => byId(id))
                .filter((template): template is Template => !!template);
              return (
                <div key={item.id} className="group relative text-left">
                  <button
                    type="button"
                    onClick={() => openMoodboard(item)}
                    className="flex w-full flex-col gap-2 text-left"
                    data-testid="moodboard-card"
                  >
                    <MoodboardCover draft={item} designs={designs} className="aspect-[3/2] w-full" />
                    <div className="min-w-0 px-0.5">
                      <div className="truncate text-sm font-semibold">{title}</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${title}`}
                    onClick={() => moodboards.removeSaved(item.id)}
                    className="absolute top-2 right-2 grid size-8 place-items-center rounded-lg bg-background/80 text-muted-foreground backdrop-blur transition-opacity hover:bg-background hover:text-foreground [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 px-4 py-24 text-center" data-testid="moodboards-empty">
            <PaletteIcon className="size-7 text-muted-foreground" />
            <div className="text-sm font-semibold">No moodboards yet</div>
            <div className="text-xs text-muted-foreground">
              Save a moodboard and it&apos;ll show up here.
            </div>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setPage("brief")}>
              Open moodboard
            </Button>
          </div>
        )}
      </div>

      <Dialog open={creating} onOpenChange={(open) => !open && closeCreate()}>
        <DialogContent showCloseButton={false} data-testid="new-board-dialog">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newName.trim()) return;
              store.create(newName, newDescription);
              closeCreate();
            }}
          >
            <DialogHeader>
              <DialogTitle>New board</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Board name
                </span>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Client pitches"
                  aria-label="Board name"
                  data-testid="new-board-name"
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Description
                </span>
                <Textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="What's this board for? (optional)"
                  aria-label="Description"
                  rows={3}
                  data-testid="new-board-description"
                />
              </label>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>
                Cancel
              </DialogClose>
              <Button
                type="submit"
                disabled={!newName.trim()}
                data-testid="create-board"
              >
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent
          showCloseButton={false}
          role="alertdialog"
          data-testid="delete-board-dialog"
        >
          <DialogHeader>
            <DialogTitle>Delete board “{pendingDelete?.name}”?</DialogTitle>
            <DialogDescription>
              Designs in it stay in your other boards. This can&apos;t be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingDelete) store.remove(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Delete board
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
