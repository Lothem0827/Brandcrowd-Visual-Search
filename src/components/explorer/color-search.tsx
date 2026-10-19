"use client";
import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { CheckIcon, PaletteIcon, PlusIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import {
  COLOR_MATCH_MODES,
  NAMED_SWATCHES,
  hexToHsv,
  hsvToHex,
  normalizeHex,
  type ColorMatchMode,
} from "@/lib/color";
import { useIsCompact } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { useExplorer } from "./context";
import { HueSlider, SpectrumSquare } from "./color-spectrum";

const MODE_LABEL: Record<ColorMatchMode, string> = {
  background: "Background",
  primary: "Primary",
  accent: "Accent",
  any: "Any",
};

type Hsv = { h: number; s: number; v: number };

type PickerBodyProps = {
  selected: string[];
  mode: ColorMatchMode;
  hsv: Hsv;
  setHsv: Dispatch<SetStateAction<Hsv>>;
  hexInput: string;
  setHexInput: (v: string) => void;
  commit: (colors: string[], m?: ColorMatchMode) => void;
  toggle: (hex: string) => void;
  current: string;
  addCurrent: () => void;
  /** Compact dialog uses DialogTitle; hide the duplicate inline title when false. */
  showTitle?: boolean;
};

function ColorPickerBody({
  selected,
  mode,
  hsv,
  setHsv,
  hexInput,
  setHexInput,
  commit,
  toggle,
  current,
  addCurrent,
  showTitle = true,
}: PickerBodyProps) {
  return (
    <>
      {showTitle ? (
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Search by colour</span>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => commit([])}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
      ) : (
        selected.length > 0 && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => commit([])}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Clear
            </button>
          </div>
        )
      )}

      <div>
        <div className="mb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          Main colours
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {NAMED_SWATCHES.map((s) => {
            const on = selected.includes(s.hex);
            return (
              <button
                key={s.name}
                type="button"
                title={s.name}
                aria-label={s.name}
                aria-pressed={on}
                onClick={() => toggle(s.hex)}
                className={cn(
                  "relative h-7 rounded-md ring-1 ring-black/10 transition-transform hover:scale-105",
                  on && "ring-2 ring-foreground ring-offset-2 ring-offset-popover",
                )}
                style={{ background: s.hex }}
              >
                {on && (
                  <CheckIcon className="absolute inset-0 m-auto size-3.5 text-white mix-blend-difference" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          Spectrum
        </div>
        <SpectrumSquare hsv={hsv} onChange={(s, v) => setHsv((p) => ({ ...p, s, v }))} />
        <HueSlider hue={hsv.h} onChange={(h) => setHsv((p) => ({ ...p, h }))} />
        <div className="flex items-center gap-2">
          <span
            className="size-7 shrink-0 rounded-md ring-1 ring-black/10"
            style={{ background: current }}
          />
          <form
            className="flex flex-1 items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const h = normalizeHex(hexInput);
              if (h) {
                setHsv(hexToHsv(h));
                if (!selected.includes(h)) commit([...selected, h]);
                setHexInput("");
              }
            }}
          >
            <Input
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              onBlur={() => {
                const h = normalizeHex(hexInput);
                if (h) setHsv(hexToHsv(h));
              }}
              placeholder={current}
              aria-label="Custom hex"
              className="h-8 font-mono text-xs"
            />
            <button
              type="submit"
              className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-panel px-2.5 text-xs font-medium hover:bg-muted"
              aria-label="Use this hex"
            >
              Hex
            </button>
          </form>
          <button
            type="button"
            onClick={addCurrent}
            className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-foreground px-2.5 text-xs font-medium text-background"
          >
            <PlusIcon className="size-3.5" /> Add
          </button>
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          Match against {selected.length ? `(${selected.length})` : ""}
        </div>
        <div
          className="flex gap-0.5 rounded-lg bg-muted p-0.5 text-xs"
          role="radiogroup"
          aria-label="Colour match mode"
        >
          {COLOR_MATCH_MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              disabled={!selected.length}
              onClick={() => commit(selected, m)}
              className={cn(
                // basis-auto (not flex-1, which is basis-0) so each segment sizes to its label
                // — "Background" needs more room than "Any" — while still filling the row.
                "h-7 min-w-0 grow shrink basis-auto truncate rounded-md px-2 transition-colors disabled:opacity-40",
                mode === m
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2.5">
          {selected.map((hex) => (
            <button
              key={hex}
              type="button"
              onClick={() => toggle(hex)}
              aria-label={`Remove ${hex}`}
              className="group inline-flex h-7 items-center gap-1.5 rounded-full bg-panel pr-2 pl-1.5 text-xs"
            >
              <span
                className="size-4 rounded-full ring-1 ring-black/15"
                style={{ background: hex }}
              />
              <span className="font-mono">{hex}</span>
              <span className="text-muted-foreground group-hover:text-foreground">×</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/** Bottom-center dock button: multi-colour search (centered modal on compact, popover on desktop). */
export function ColorSearchButton() {
  const { filters, setFilters } = useExplorer();
  const isCompact = useIsCompact();
  const colorFilter = filters.color;
  const selected = useMemo(() => colorFilter?.colors ?? [], [colorFilter]);
  const mode: ColorMatchMode = colorFilter?.mode ?? "background";
  const [hsv, setHsv] = useState(() => hexToHsv("#F07B22"));
  const [hexInput, setHexInput] = useState("");
  const [open, setOpen] = useState(false);

  const commit = useCallback(
    (colors: string[], m: ColorMatchMode = mode) => {
      const uniq = Array.from(
        new Set(colors.map((c) => normalizeHex(c)).filter((h): h is string => !!h)),
      );
      setFilters((f) => ({ ...f, color: uniq.length ? { colors: uniq, mode: m } : null }));
    },
    [mode, setFilters],
  );
  const toggle = useCallback(
    (hex: string) =>
      commit(selected.includes(hex) ? selected.filter((c) => c !== hex) : [...selected, hex]),
    [commit, selected],
  );

  const current = hsvToHex(hsv.h, hsv.s, hsv.v);
  const addCurrent = () => {
    if (!selected.includes(current)) commit([...selected, current]);
  };

  const body = (
    <ColorPickerBody
      selected={selected}
      mode={mode}
      hsv={hsv}
      setHsv={setHsv}
      hexInput={hexInput}
      setHexInput={setHexInput}
      commit={commit}
      toggle={toggle}
      current={current}
      addCurrent={addCurrent}
      showTitle={!isCompact}
    />
  );

  const triggerClass = cn(
    "relative grid size-10 shrink-0 place-items-center rounded-full transition-colors hover:bg-muted",
    selected.length ? "text-foreground" : "text-muted-foreground",
  );

  const triggerInner: ReactNode = (
    <>
      <PaletteIcon className="size-[18px]" />
      {selected.length > 0 && (
        <span className="absolute top-1 right-1 flex -space-x-1">
          {selected.slice(0, 3).map((hex) => (
            <span
              key={hex}
              className="size-2.5 rounded-full ring-1 ring-background"
              style={{ background: hex }}
            />
          ))}
        </span>
      )}
    </>
  );

  if (isCompact) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          aria-label="Search by colour"
          title="Search by colour"
          className={triggerClass}
        >
          {triggerInner}
        </DialogTrigger>
        <DialogContent
          showCloseButton
          className={cn(
            // Override default compact bottom-sheet → centered modal.
            "inset-auto top-1/2 left-1/2 bottom-auto max-h-[min(92dvh,40rem)] w-[min(100%-2rem,300px)] max-w-[min(100%-2rem,300px)] -translate-x-1/2 -translate-y-1/2 gap-3 overflow-y-auto rounded-xl p-3.5 pb-3.5",
            "max-lg:data-open:slide-in-from-bottom-0 max-lg:data-closed:slide-out-to-bottom-0",
            "data-open:zoom-in-95 data-closed:zoom-out-95",
          )}
        >
          <DialogTitle className="pr-8 text-sm font-semibold">Search by colour</DialogTitle>
          {body}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Search by colour"
        title="Search by colour"
        className={triggerClass}
      >
        {triggerInner}
      </PopoverTrigger>
      <PopoverContent side="top" align="center" className="w-[300px] gap-3 p-3.5">
        {body}
      </PopoverContent>
    </Popover>
  );
}
