"use client";
import { memo, useMemo, useState, type ReactNode } from "react";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  activeFilterCount,
  facetOptions,
  type FacetKey,
} from "@/lib/facets";
import { COLOR_MATCH_MODES, NAMED_SWATCHES, normalizeHex, type ColorMatchMode } from "@/lib/color";
import { cn } from "@/lib/utils";
import { useExplorer } from "./context";
import { ImageIcon, LayoutIcon } from "./icons";

type IconKind = "layout" | "image";

const COLOR_MODE_LABEL: Record<ColorMatchMode, string> = {
  background: "Background",
  primary: "Primary",
  accent: "Accent",
  any: "Any colour",
};

export const OptionList = memo(function OptionList({
  facet,
  tiles,
  icon,
  limit,
  filterText,
}: {
  facet: FacetKey;
  tiles?: boolean;
  icon?: IconKind;
  limit?: number;
  filterText?: string;
}) {
  const { base, effective, toggleFacet } = useExplorer();
  const selected = effective.facets[facet] ?? [];
  // `facetOptions` is memoized by (base, effective); the derivation is re-run only when the
  // props or the active filter state actually change.
  const opts = useMemo(() => {
    const all = facetOptions(base, facet, effective, {
      limit: filterText ? undefined : limit,
    });
    // Hide zero-count chips; keep selected so they can be cleared.
    const active = effective.facets[facet] ?? [];
    const visible = all.filter((o) => o.count > 0 || active.includes(o.value));
    if (!filterText) return visible;
    const needle = filterText.toLowerCase();
    return visible
      .filter((o) => o.label.toLowerCase().includes(needle))
      .slice(0, limit ?? 50);
  }, [base, facet, effective, filterText, limit]);
  if (!opts.length)
    return (
      <p className="px-1 py-2 text-xs text-muted-foreground">
        No values in this dataset yet.
      </p>
    );
  return (
    <div
      className={cn(
        tiles ? "grid grid-cols-3 gap-1.5" : "flex flex-wrap gap-1.5",
      )}
    >
      {opts.map((o) => {
        const on = selected.includes(o.value);
        const zero = o.count === 0 && !on;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={zero}
            onClick={() => toggleFacet(facet, o.value)}
            title={zero ? "No results with the current filters" : undefined}
            className={cn(
              "group flex items-center gap-1.5 rounded-lg text-left text-[13px] transition-colors",
              tiles ? "flex-col items-start gap-1 p-2" : "h-7 px-2.5",
              on ? "bg-foreground text-background" : "bg-panel hover:bg-muted",
              zero && "cursor-not-allowed opacity-40",
            )}
            {...(facet === "aesthetic" && o === opts[0] ? { "data-onboarding": "filter-chip" } : {})}
          >
            {icon === "layout" && (
              <LayoutIcon value={o.value} className="size-6" />
            )}
            {icon === "image" && (
              <ImageIcon value={o.value} className="size-6" />
            )}
            <span className="flex w-full items-center gap-1.5">
              <span className="truncate">{o.label}</span>
              <span
                className={cn(
                  "ml-auto text-[11px] tabular-nums",
                  on ? "text-background/70" : "text-muted-foreground",
                )}
              >
                {o.count}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
});

export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {title}
      </div>
      {children}
    </div>
  );
}

export function FilterGroup({
  title,
  facets,
  children,
  defaultOpen = false,
}: {
  title: string;
  facets: FacetKey[];
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const { effective } = useExplorer();
  const n = activeFilterCount(effective, facets);
  // Controlled so the group can expand when it becomes relevant (e.g. a colour is picked) without
  // Base UI warning about changing an uncontrolled Collapsible's `defaultOpen` after init.
  // `manual` is null until the user toggles, so before that the group just follows `defaultOpen`.
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? defaultOpen;
  return (
    <Collapsible open={open} onOpenChange={setManual}>
      <CollapsibleTrigger className="group flex w-full items-center justify-between py-3 text-left text-sm font-medium">
        <span className="flex items-center gap-2">
          {title}
          {n > 0 && (
            <span className="rounded-full bg-foreground px-1.5 text-[10px] text-background">
              {n}
            </span>
          )}
        </span>
        <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pb-6">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ColorFilterBody() {
  const { filters, setFilters } = useExplorer();
  const color = filters.color;
  const selected = color?.colors ?? [];
  const mode: ColorMatchMode = color?.mode ?? "background";
  const [hexInput, setHexInput] = useState("");

  const commit = (colors: string[], m: ColorMatchMode = mode) => {
    const uniq = Array.from(
      new Set(colors.map((c) => normalizeHex(c)).filter((h): h is string => !!h)),
    );
    setFilters((f) => ({ ...f, color: uniq.length ? { colors: uniq, mode: m } : null }));
  };
  const toggleHex = (hex: string) =>
    commit(selected.includes(hex) ? selected.filter((c) => c !== hex) : [...selected, hex]);
  const addHex = () => {
    const h = normalizeHex(hexInput);
    if (!h) return;
    if (!selected.includes(h)) commit([...selected, h]);
    setHexInput("");
  };
  const hexValid = normalizeHex(hexInput);

  return (
    <>
      <Section title="Pick colours">
        <div className="grid grid-cols-8 gap-1.5">
          {NAMED_SWATCHES.map((s) => {
            const on = selected.includes(s.hex);
            return (
              <button
                key={s.name}
                type="button"
                aria-label={`${s.name} (${s.hex})`}
                aria-pressed={on}
                title={s.name}
                onClick={() => toggleHex(s.hex)}
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
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addHex();
          }}
        >
          <input
            type="color"
            aria-label="Colour picker"
            value={hexValid ?? "#000000"}
            onChange={(e) => setHexInput(e.target.value.toUpperCase())}
            className="size-8 shrink-0 cursor-pointer rounded-md ring-1 ring-black/10 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-0"
          />
          <Input
            value={hexInput}
            onChange={(e) => setHexInput(e.target.value)}
            placeholder="#HEX e.g. #F27C31"
            aria-label="Hex color"
            className="h-8 font-mono text-xs"
          />
          <Button type="submit" size="sm" disabled={!hexValid}>
            Add
          </Button>
        </form>
        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {selected.map((hex) => (
              <span
                key={hex}
                className="inline-flex h-7 items-center gap-1.5 rounded-full bg-panel pr-1 pl-1.5 text-xs"
              >
                <span className="size-4 rounded-full ring-1 ring-black/15" style={{ background: hex }} />
                <span className="font-mono">{hex}</span>
                <button
                  type="button"
                  aria-label={`Remove ${hex}`}
                  onClick={() => toggleHex(hex)}
                  className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  ×
                </button>
              </span>
            ))}
            <button
              type="button"
              className="ml-auto text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={() => commit([])}
            >
              Clear
            </button>
          </div>
        )}
      </Section>
      <Section title="Match">
        <div
          className="grid grid-cols-2 gap-0.5 rounded-lg bg-muted p-0.5 text-[13px]"
          role="radiogroup"
          aria-label="Colour match mode"
        >
          {COLOR_MATCH_MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => selected.length && commit(selected, m)}
              className={cn(
                "h-7 min-w-0 truncate rounded-md px-2 transition-colors",
                mode === m
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {COLOR_MODE_LABEL[m]}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          A design matches if any picked colour appears in its palette.
        </p>
      </Section>
      <Section title="Colour names">
        <OptionList facet="colorName" />
      </Section>
      <Section title="Colour scheme">
        <OptionList facet="colorScheme" />
      </Section>
    </>
  );
}

export const MORE_FACET_GROUPS: { title: string; facets: FacetKey[] }[] = [
  { title: "Typography", facets: ["fontStyle", "effects"] },
  { title: "Graphic elements", facets: ["elements"] },
  { title: "Tags", facets: ["tag"] },
];
