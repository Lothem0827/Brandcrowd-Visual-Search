"use client";
import { useRef, useState } from "react";
import { BookmarkCheckIcon, BookmarkIcon, CheckIcon, ChevronDownIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { SAVED_BOARD_ID } from "@/lib/boards";
import { cn } from "@/lib/utils";
import { useBoards } from "./use-boards";

/** Click = quick-save to "Saved". Chevron or press-and-hold = board picker with "+ New board". */
export function SaveButton({ templateId, className }: { templateId: string; className?: string }) {
  const { boards, store } = useBoards();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const inBoards = boards.filter((b) => b.templateIds.includes(templateId));
  const saved = inBoards.length > 0;

  const quickSave = () => {
    const nowSaved = store.toggle(SAVED_BOARD_ID, templateId);
    toast(nowSaved ? "Saved" : "Removed from Saved", {
      description: nowSaved ? "Use the ▾ button next to Save to add it to other boards." : undefined,
      action: nowSaved ? { label: "Choose boards", onClick: () => setOpen(true) } : undefined,
    });
  };
  const create = () => {
    const name = newName.trim();
    if (!name) return;
    const b = store.create(name);
    store.add(b.id, templateId);
    setNewName("");
    toast.success(`Saved to “${b.name}”`);
  };

  return (
    <div className={cn("flex h-10 items-stretch overflow-hidden rounded-xl bg-panel", className)}>
      <button
        type="button"
        aria-pressed={saved}
        data-testid="save-button"
        title={saved ? `In: ${inBoards.map((b) => b.name).join(", ")}. Click to toggle “Saved”, hold to pick boards.` : "Click to save, press and hold to pick a board"}
        className={cn("flex flex-1 items-center justify-center gap-2 px-3 text-sm font-medium transition-colors hover:bg-muted", saved && "text-[#E5484D]")}
        onPointerDown={() => {
          held.current = false;
          holdTimer.current = setTimeout(() => {
            held.current = true;
            setOpen(true);
          }, 450);
        }}
        onPointerUp={() => holdTimer.current && clearTimeout(holdTimer.current)}
        onPointerLeave={() => holdTimer.current && clearTimeout(holdTimer.current)}
        onClick={() => {
          if (held.current) return;
          quickSave();
        }}
      >
        {saved ? <BookmarkCheckIcon className="size-4" /> : <BookmarkIcon className="size-4" />}
        <span className="truncate">{saved ? (inBoards.length > 1 ? `Saved · ${inBoards.length}` : "Saved") : "Save"}</span>
      </button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-label="Choose boards"
          data-testid="board-picker"
          className="grid w-10 place-items-center bg-muted/40 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronDownIcon className="size-4" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 gap-1 p-1.5">
          <div className="px-2 pt-1 pb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Save to board</div>
          <div className="thin-scroll max-h-56 overflow-y-auto">
            {boards.map((b) => {
              const on = b.templateIds.includes(templateId);
              return (
                <button
                  key={b.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={on}
                  onClick={() => store.toggle(b.id, templateId)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span className={cn("grid size-4 place-items-center rounded bg-panel", on && "bg-foreground text-background")}>
                    {on && <CheckIcon className="size-3" />}
                  </span>
                  <span className="flex-1 truncate">{b.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{b.templateIds.length}</span>
                </button>
              );
            })}
          </div>
          <form
            className="mt-2 flex items-center gap-1.5 px-1 pb-1"
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New board name"
              aria-label="New board name"
              className="h-8 text-sm"
              data-testid="new-board-input"
            />
            <button
              type="submit"
              disabled={!newName.trim()}
              className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-foreground px-2.5 text-xs font-medium text-background disabled:opacity-40"
            >
              <PlusIcon className="size-3.5" /> New board
            </button>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
}
