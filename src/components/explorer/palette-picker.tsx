"use client";
import { PaletteIcon, PipetteIcon, PlusIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SLOT_LABELS, type ArmedSlot, type BriefSlot } from "@/lib/brief-board";
import { cn } from "@/lib/utils";
import { HEADER_CONTROL, HEADER_CONTROL_IDLE, HEADER_CONTROL_ON } from "./header";
import { SpectrumPicker } from "./color-spectrum";

export interface PaletteTarget {
  cardId: string;
  label: string;
  slots: BriefSlot[];
}

/**
 * Colour picker control: a popover with the board's palettes, the manual picker and the
 * eyedropper.
 *
 * Controlled by the page so clicking a palette slot on the canvas can open it with that slot
 * armed. Every manual adjustment and the eyedropper write through the page's `onHexChange`,
 * which means the two paths always target the same slot.
 */
export function PalettePicker({
  open,
  onOpenChange,
  targets,
  armed,
  onArm,
  hex,
  onHexChange,
  onPickScreen,
  supported,
  onAddPalette,
  triggerClassName,
  triggerLabel,
  side = "bottom",
  align = "end",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targets: PaletteTarget[];
  armed: ArmedSlot | null;
  onArm: (cardId: string, index: number) => void;
  /** Colour currently shown by the manual picker (the armed slot's hex, or a seed). */
  hex: string;
  onHexChange: (hex: string) => void;
  onPickScreen: () => void;
  supported: boolean;
  onAddPalette: () => void;
  /** Overrides the 40px header-square trigger, e.g. for the floating dock chips. */
  triggerClassName?: string;
  /** Word shown beside the pipette (dock chips read "Pick colour"). */
  triggerLabel?: string;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        aria-label="Colour picker"
        title="Colour picker (I)"
        aria-pressed={open}
        className={
          triggerClassName ??
          cn(HEADER_CONTROL, open ? HEADER_CONTROL_ON : HEADER_CONTROL_IDLE)
        }
      >
        <PipetteIcon className="size-4" />
        {triggerLabel ? <span>{triggerLabel}</span> : null}
      </PopoverTrigger>
      <PopoverContent side={side} align={align} className="w-[310px] gap-3 p-3.5" data-testid="palette-picker">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Colour picker</span>
          {armed ? <span className="text-[11px] text-muted-foreground">Slot armed</span> : null}
        </div>

        {targets.length === 0 ? (
          <div className="space-y-2 rounded-lg bg-panel/60 p-3 text-center">
            <p className="text-xs text-muted-foreground">Add a palette first.</p>
            <button
              type="button"
              onClick={onAddPalette}
              className="mx-auto flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-medium text-background"
            >
              <PlusIcon className="size-3.5" /> Add palette
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                Palettes
              </div>
              <div className="thin-scroll max-h-40 space-y-2 overflow-y-auto pr-0.5">
                {targets.map((target) => (
                  <div key={target.cardId}>
                    <div className="mb-1 truncate text-[11px] font-medium text-muted-foreground">
                      {target.label}
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {target.slots.map((slot, index) => {
                        const on = armed?.cardId === target.cardId && armed.index === index;
                        return (
                          <button
                            key={`${index}-${slot.hex}`}
                            type="button"
                            aria-label={`Edit ${SLOT_LABELS[index]} ${slot.hex}`}
                            aria-pressed={on}
                            title={`${SLOT_LABELS[index]} · ${slot.hex}`}
                            onClick={() => onArm(target.cardId, index)}
                            className={cn(
                              "h-7 rounded-md ring-1 ring-black/10 transition-transform hover:scale-105",
                              on && "ring-2 ring-foreground ring-offset-2 ring-offset-popover",
                            )}
                            style={{ background: slot.hex }}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                {armed ? "Adjust the armed colour" : "Pick a colour"}
              </div>
              <SpectrumPicker hex={hex} onChange={onHexChange} />
            </div>

            {supported ? (
              <button
                type="button"
                onClick={onPickScreen}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-foreground text-xs font-semibold text-background transition-opacity hover:opacity-90"
              >
                <PipetteIcon className="size-4" /> Pick from screen
                <kbd className="rounded bg-background/20 px-1.5 py-0.5 font-mono text-[10px]">I</kbd>
              </button>
            ) : (
              <p className="rounded-lg bg-panel/60 px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
                Screen picking needs Chrome or Edge. Use the picker above, or click a swatch on a
                design in the Inspiration panel.
              </p>
            )}
          </>
        )}

        <p className="border-t border-border/60 pt-2 text-[11px] leading-snug text-muted-foreground">
          {targets.length === 0 ? (
            <span className="flex items-center gap-1">
              <PaletteIcon className="size-3" /> Palettes appear here once generated.
            </span>
          ) : (
            "Click a slot, adjust it here, or press I to sample a colour."
          )}
        </p>
      </PopoverContent>
    </Popover>
  );
}
