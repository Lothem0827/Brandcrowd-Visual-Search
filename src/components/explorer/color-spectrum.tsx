"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { NAMED_SWATCHES, hexToHsv, hsvToHex, normalizeHex, type Hsv } from "@/lib/color";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Saturation/value square for the current hue. Drag anywhere inside to pick. */
export function SpectrumSquare({ hsv, onChange }: { hsv: Hsv; onChange: (s: number, v: number) => void }) {
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
export function HueSlider({ hue, onChange }: { hue: number; onChange: (h: number) => void }) {
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

/**
 * Hex input that commits on submit/blur.
 *
 * Kept as text while typing so partial values ("#12") are allowed; the last valid hex is the
 * placeholder, and committing an invalid value restores it.
 */
export function HexField({
  value,
  onCommit,
  className,
}: {
  value: string;
  onCommit: (hex: string) => void;
  className?: string;
}) {
  const [text, setText] = useState("");
  const commit = () => {
    const hex = normalizeHex(text);
    if (hex) onCommit(hex);
    setText("");
  };
  return (
    <form
      className={cn("flex flex-1 items-center gap-1.5", className)}
      onSubmit={(event) => {
        event.preventDefault();
        commit();
      }}
    >
      <Input
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        placeholder={value}
        aria-label="Hex colour"
        maxLength={7}
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
  );
}

/**
 * Spectrum square + hue slider + hex field + named swatches.
 *
 * `hsv` is local so dragging keeps the hue while saturation/value change (a hex round-trip
 * would lose it at black and white). External changes — the eyedropper, or arming another
 * slot — sync back through `hex`, without fighting the value this picker just emitted.
 */
export function SpectrumPicker({
  hex,
  onChange,
  showSwatches = true,
}: {
  hex: string;
  onChange: (hex: string) => void;
  showSwatches?: boolean;
}) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(hex));
  const [seen, setSeen] = useState(hex);
  if (seen !== hex) {
    setSeen(hex);
    setHsv(hexToHsv(hex));
  }

  const emit = (next: Hsv) => {
    setHsv(next);
    const value = hsvToHex(next.h, next.s, next.v);
    // Remember what we sent so the parent echoing it back does not reset the hue.
    setSeen(value);
    onChange(value);
  };

  return (
    <div className="space-y-2">
      <SpectrumSquare hsv={hsv} onChange={(s, v) => emit({ ...hsv, s, v })} />
      <HueSlider hue={hsv.h} onChange={(h) => emit({ ...hsv, h })} />
      <div className="flex items-center gap-2">
        <span className="size-7 shrink-0 rounded-md ring-1 ring-black/10" style={{ background: hex }} />
        <HexField value={hex} onCommit={(next) => emit(hexToHsv(next))} />
      </div>
      {showSwatches && (
        <div className="grid grid-cols-7 gap-1.5">
          {NAMED_SWATCHES.map((swatch) => (
            <button
              key={swatch.name}
              type="button"
              title={swatch.name}
              aria-label={swatch.name}
              aria-pressed={swatch.hex === hex}
              onClick={() => emit(hexToHsv(swatch.hex))}
              className={cn(
                "h-6 rounded-md ring-1 ring-black/10 transition-transform hover:scale-105",
                swatch.hex === hex && "ring-2 ring-foreground ring-offset-2 ring-offset-popover",
              )}
              style={{ background: swatch.hex }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
