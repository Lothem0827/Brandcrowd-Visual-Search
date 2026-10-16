"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, PaletteIcon, PlusIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { COLOR_MATCH_MODES, NAMED_SWATCHES, hexToHsv, hsvToHex, normalizeHex, type ColorMatchMode } from "@/lib/color";
import { cn } from "@/lib/utils";
import { useExplorer } from "./context";

const MODE_LABEL: Record<ColorMatchMode, string> = {
  background: "Background",
  primary: "Primary",
  accent: "Accent",
  any: "Any",
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Saturation/value square for the current hue. Drag anywhere inside to pick. */
function SpectrumSquare({ hsv, onChange }: { hsv: { h: number; s: number; v: number }; onChange: (s: number, v: number) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const update = useCallback(
    (clientX: number, clientY: number) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      onChange(clamp01((clientX - r.left) / r.width), 1 - clamp01((clientY - r.top) / r.height));
    },
    [onChange],
  );
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => update(e.clientX, e.clientY);
    const up = () => setDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, update]);
  return (
    <div
      ref={ref}
      role="slider"
      aria-label="Saturation and brightness"
      aria-valuenow={Math.round(hsv.v * 100)}
      aria-valuetext={`${Math.round(hsv.s * 100)}% saturation, ${Math.round(hsv.v * 100)}% brightness`}
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault();
        setDragging(true);
        update(e.clientX, e.clientY);
      }}
      className="relative h-36 w-full cursor-crosshair touch-none rounded-lg ring-1 ring-foreground/10"
      style={{
        background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))`,
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
        style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hsvToHex(hsv.h, hsv.s, hsv.v) }}
      />
    </div>
  );
}

/** Rainbow hue slider. Drag to change hue. */
function HueSlider({ hue, onChange }: { hue: number; onChange: (h: number) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const update = useCallback(
    (clientX: number) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      onChange(clamp01((clientX - r.left) / r.width) * 360);
    },
    [onChange],
  );
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => update(e.clientX);
    const up = () => setDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, update]);
  return (
    <div
      ref={ref}
      role="slider"
      aria-label="Hue"
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round(hue)}
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault();
        setDragging(true);
        update(e.clientX);
      }}
      className="relative h-3 w-full cursor-pointer touch-none rounded-full ring-1 ring-foreground/10"
      style={{ background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
        style={{ left: `${(hue / 360) * 100}%`, background: hsvToHex(hue, 1, 1) }}
      />
    </div>
  );
}

/** Bottom-center dock button: multi-colour search popover (swatches + spectrum + hex). */
export function ColorSearchButton() {
  const { filters, setFilters } = useExplorer();
  const colorFilter = filters.color;
  const selected = useMemo(() => colorFilter?.colors ?? [], [colorFilter]);
  const mode: ColorMatchMode = colorFilter?.mode ?? "background";
  const [hsv, setHsv] = useState(() => hexToHsv("#F07B22"));
  const [hexInput, setHexInput] = useState("");

  const commit = useCallback(
    (colors: string[], m: ColorMatchMode = mode) => {
      const uniq = Array.from(new Set(colors.map((c) => normalizeHex(c)).filter((h): h is string => !!h)));
      setFilters((f) => ({ ...f, color: uniq.length ? { colors: uniq, mode: m } : null }));
    },
    [mode, setFilters],
  );
  const toggle = useCallback(
    (hex: string) => commit(selected.includes(hex) ? selected.filter((c) => c !== hex) : [...selected, hex]),
    [commit, selected],
  );

  const current = hsvToHex(hsv.h, hsv.s, hsv.v);
  const addCurrent = () => {
    if (!selected.includes(current)) commit([...selected, current]);
  };

  return (
    <Popover>
      <PopoverTrigger
        aria-label="Search by colour"
        title="Search by colour"
        className={cn(
          "relative grid size-10 shrink-0 place-items-center rounded-full transition-colors hover:bg-muted",
          selected.length ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <PaletteIcon className="size-[18px]" />
        {selected.length > 0 && (
          <span className="absolute top-1 right-1 flex -space-x-1">
            {selected.slice(0, 3).map((hex) => (
              <span key={hex} className="size-2.5 rounded-full ring-1 ring-background" style={{ background: hex }} />
            ))}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent side="top" align="center" className="w-[300px] gap-3 p-3.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Search by colour</span>
          {selected.length > 0 && (
            <button type="button" onClick={() => commit([])} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
              Clear
            </button>
          )}
        </div>

        <div>
          <div className="mb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Main colours</div>
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
                  {on && <CheckIcon className="absolute inset-0 m-auto size-3.5 text-white mix-blend-difference" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Spectrum</div>
          <SpectrumSquare hsv={hsv} onChange={(s, v) => setHsv((p) => ({ ...p, s, v }))} />
          <HueSlider hue={hsv.h} onChange={(h) => setHsv((p) => ({ ...p, h }))} />
          <div className="flex items-center gap-2">
            <span className="size-7 shrink-0 rounded-md ring-1 ring-black/10" style={{ background: current }} />
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
              <button type="submit" className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-panel px-2.5 text-xs font-medium hover:bg-muted" aria-label="Use this hex">
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
          <div className="flex gap-0.5 rounded-lg bg-muted p-0.5 text-xs" role="radiogroup" aria-label="Colour match mode">
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
                  mode === m ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
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
                <span className="size-4 rounded-full ring-1 ring-black/15" style={{ background: hex }} />
                <span className="font-mono">{hex}</span>
                <span className="text-muted-foreground group-hover:text-foreground">×</span>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
