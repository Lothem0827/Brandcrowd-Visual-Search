"use client";
import { useId, useMemo, useRef, useState, type RefObject } from "react";
import { useTheme } from "next-themes";
import { BookmarkIcon, ImagePlusIcon, MoonIcon, SearchIcon, SunIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { completeQuery, suggest, facetLabel, type Suggestion } from "@/lib/query";
import { paletteFromFile } from "@/lib/image-search";
import { cn } from "@/lib/utils";
import { useExplorer } from "./context";
import { useBoards } from "./use-boards";

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div
        aria-hidden
        className="grid size-8 place-items-center rounded-[10px] shadow-sm"
        style={{ background: "conic-gradient(from 200deg, #F0812F, #E5484D, #9B6BE8, #4C7DF0, #22A06B, #D49B0B, #F0812F)" }}
      >
        <div className="size-3 rounded-full bg-white/95" />
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight">Template Taxonomy</div>
        <div className="text-[11px] text-muted-foreground">Inspiration from design.com</div>
      </div>
    </div>
  );
}

export async function runImageSearch(file: File, setImageQuery: ReturnType<typeof useExplorer>["setImageQuery"]) {
  if (!file.type.startsWith("image/")) {
    toast.error("Please drop an image file");
    return;
  }
  try {
    const { url, palette } = await paletteFromFile(file);
    setImageQuery({ url, palette, name: file.name });
    toast.success("Searching by image colors");
  } catch {
    toast.error("Couldn't read that image");
  }
}

function SearchBox({ inputRef }: { inputRef: RefObject<HTMLInputElement | null> }) {
  const { query, setQuery, vocab, tagCounts, addFacet, imageQuery, setImageQuery } = useExplorer();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const suggestions = useMemo(() => (open ? suggest(query, vocab, tagCounts, 8) : []), [open, query, vocab, tagCounts]);
  const showList = open && suggestions.length > 0 && !/\s$/.test(query);

  const pick = (s: Suggestion) => {
    if (s.kind === "tag") {
      addFacet("tag", s.value);
      const words = query.trim().split(/\s+/);
      words.pop();
      setQuery(words.join(" ") + (words.length ? " " : ""));
    } else {
      setQuery(completeQuery(query, s.label));
    }
    setActive(0);
    inputRef.current?.focus();
  };

  return (
    <div className="relative w-full max-w-[560px]">
      <div
        className={cn(
          "flex h-11 items-center gap-2 rounded-xl border bg-panel pr-1.5 pl-3 shadow-sm transition-shadow",
          "focus-within:border-foreground/40 focus-within:ring-3 focus-within:ring-ring/30",
        )}
      >
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        {imageQuery && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-lg border bg-muted/60 py-0.5 pr-1 pl-0.5 text-xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageQuery.url} alt="" className="size-6 rounded object-cover" />
            <span className="flex gap-0.5">
              {imageQuery.palette.map((c) => (
                <span key={c.hex} className="size-2.5 rounded-full ring-1 ring-black/10" style={{ background: c.hex }} />
              ))}
            </span>
            <button
              type="button"
              aria-label="Clear image search"
              className="rounded p-0.5 hover:bg-background"
              onClick={() => setImageQuery(null)}
            >
              <XIcon className="size-3" />
            </button>
          </span>
        )}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (showList && e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % suggestions.length);
            } else if (showList && e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
            } else if (showList && (e.key === "Enter" || e.key === "Tab")) {
              e.preventDefault();
              pick(suggestions[active]);
            } else if (e.key === "Enter") {
              setOpen(false);
            } else if (e.key === "Escape") {
              if (showList) setOpen(false);
              else inputRef.current?.blur();
            }
          }}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
          aria-label="Search templates by style, layout, color, content…"
          placeholder="Search style, layout, color, content…"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground"
          spellCheck={false}
          autoComplete="off"
        />
        {query && (
          <button type="button" aria-label="Clear search" className="rounded-md p-1 text-muted-foreground hover:bg-muted" onClick={() => setQuery("")}>
            <XIcon className="size-3.5" />
          </button>
        )}
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Search by image"
          title="Search by image (or drop an image anywhere)"
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlusIcon />
        </Button>
        <kbd className="hidden h-6 min-w-6 items-center justify-center rounded-md border bg-muted/60 px-1.5 font-mono text-[11px] text-muted-foreground sm:flex">
          /
        </kbd>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          data-testid="image-upload"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void runImageSearch(f, setImageQuery);
            e.target.value = "";
          }}
        />
      </div>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-12 right-0 left-0 z-50 overflow-hidden rounded-xl border bg-popover p-1 text-sm shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={`${s.facet}:${s.value}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5", i === active && "bg-muted")}
            >
              <span className="w-24 shrink-0 text-[11px] tracking-wide text-muted-foreground uppercase">{facetLabel(s.facet)}</span>
              <span className="flex-1 truncate font-medium">{s.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{s.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <div className="flex items-center rounded-xl border bg-panel p-0.5" role="group" aria-label="Color theme">
      <button
        type="button"
        aria-label="Light mode"
        aria-pressed={!dark}
        onClick={() => setTheme("light")}
        className={cn("grid size-8 place-items-center rounded-lg transition-colors", !dark ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
      >
        <SunIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Dark mode"
        aria-pressed={dark}
        onClick={() => setTheme("dark")}
        className={cn("grid size-8 place-items-center rounded-lg transition-colors", dark ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
      >
        <MoonIcon className="size-4" />
      </button>
    </div>
  );
}

export function TopBar({ inputRef }: { inputRef: RefObject<HTMLInputElement | null> }) {
  const { categories, category, setCategory, setBoardsOpen } = useExplorer();
  const { boards } = useBoards();
  const savedCount = new Set(boards.flatMap((b) => b.templateIds)).size;
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 px-5">
      <div className="w-[230px] shrink-0">
        <Logo />
      </div>
      <div className="flex flex-1 items-center justify-center gap-3">
        <SearchBox inputRef={inputRef} />
        <Select value={category} onValueChange={(v) => v && setCategory(String(v))}>
          <SelectTrigger className="h-11! rounded-xl bg-panel px-3 shadow-sm" aria-label="Category">
            <span className="text-xs text-muted-foreground">Category</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex w-[230px] shrink-0 items-center justify-end gap-2">
        <Button variant="outline" className="h-9 rounded-xl bg-panel" onClick={() => setBoardsOpen(true)} aria-label="Open boards">
          <BookmarkIcon />
          Boards
          {savedCount > 0 && <span className="rounded-full bg-foreground px-1.5 text-[10px] text-background tabular-nums">{savedCount}</span>}
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
