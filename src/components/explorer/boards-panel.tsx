"use client";
import { useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { SAVED_BOARD_ID } from "@/lib/boards";
import { useExplorer } from "./context";
import { useBoards } from "./use-boards";
import { ThumbImage } from "./thumb-image";

export function BoardsPanel() {
  const { boardsOpen, setBoardsOpen, byId, setView, setDetailOpen } = useExplorer();
  const { boards, store } = useBoards();
  const [name, setName] = useState("");
  return (
    <Sheet open={boardsOpen} onOpenChange={setBoardsOpen}>
      <SheetContent side="right" className="w-[400px]! max-w-[90vw]! gap-0" data-testid="boards-panel">
        <SheetHeader>
          <SheetTitle>Boards</SheetTitle>
          <SheetDescription>Saved on this device. Sign-in and shared boards are coming in v2.</SheetDescription>
        </SheetHeader>
        <div className="thin-scroll flex-1 space-y-2 overflow-y-auto p-4">
          {boards.map((b) => {
            const found = b.templateIds.map((id) => byId(id)).filter(Boolean);
            const items = found.length >= 4 ? found.slice(0, 4) : found.slice(0, 1);
            return (
              <div key={b.id} className="group relative">
                <button
                  type="button"
                  onClick={() => {
                    setView({ kind: "board", boardId: b.id });
                    setDetailOpen(false);
                    setBoardsOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl bg-panel p-2.5 text-left transition-colors hover:bg-muted"
                  data-testid="board-item"
                >
                  <div className={`grid size-14 shrink-0 gap-0.5 overflow-hidden rounded-lg bg-muted ${items.length >= 4 ? "grid-cols-2" : "grid-cols-1"}`}>
                    {items.map((t) => (
                      <ThumbImage key={t!.templateId} src={t!.thumbnailImage} alt="" className="size-full object-cover" />
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{b.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {b.templateIds.length} design{b.templateIds.length === 1 ? "" : "s"}
                    </div>
                  </div>
                </button>
                {b.id !== SAVED_BOARD_ID && (
                  <button
                    type="button"
                    aria-label={`Delete board ${b.name}`}
                    onClick={() => {
                      if (confirm(`Delete board “${b.name}”? Designs stay in your other boards.`)) store.remove(b.id);
                    }}
                    className="absolute top-1/2 right-3 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <form
          className="flex gap-2 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            store.create(name);
            setName("");
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New board name" aria-label="New board name" className="h-9" />
          <button type="submit" disabled={!name.trim()} className="flex h-9 shrink-0 items-center gap-1 rounded-lg bg-foreground px-3 text-sm font-medium text-background disabled:opacity-40">
            <PlusIcon className="size-4" /> Create
          </button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
