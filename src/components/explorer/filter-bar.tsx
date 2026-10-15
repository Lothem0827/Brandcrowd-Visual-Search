"use client";
import { useMemo, useState, type ReactNode } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  RefreshCwIcon,
  ShuffleIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  activeFilterCount,
  displayValue,
  facetOptions,
  type FacetKey,
} from "@/lib/facets";
import { NAMED_SWATCHES, normalizeHex } from "@/lib/color";
import { cn } from "@/lib/utils";
import { useExplorer } from "./context";
import { ImageIcon, LayoutIcon } from "./icons";

type IconKind = "layout" | "image";

export function OptionList({
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
  let opts = facetOptions(base, facet, effective, {
    limit: filterText ? undefined : limit,
  });
  if (filterText)
    opts = opts
      .filter((o) => o.label.toLowerCase().includes(filterText.toLowerCase()))
      .slice(0, limit ?? 50);
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
              "group flex items-center gap-1.5 rounded-lg border text-left text-[13px] transition-colors",
              tiles ? "flex-col items-start gap-1 p-2" : "h-7 px-2.5",
              on
                ? "border-foreground bg-foreground text-background"
                : "bg-panel hover:border-foreground/40",
              zero && "cursor-not-allowed opacity-40 hover:border-border",
            )}
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
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {title}
      </div>
      {children}
    </div>
  );
}

function triggerLabel(label: string, values: string[], facet: FacetKey) {
  if (values.length === 0) return label;
  if (values.length === 1) return `${label}: ${displayValue(facet, values[0])}`;
  return `${label} · ${values.length}`;
}

function QuickFilter({
  label,
  facets,
  children,
  width = "w-[380px]",
}: {
  label: string;
  facets: FacetKey[];
  children: ReactNode;
  width?: string;
}) {
  const { effective } = useExplorer();
  const primary = facets[0];
  const values = facets.flatMap((f) => effective.facets[f] ?? []);
  const primaryValues = effective.facets[primary] ?? [];
  const active = values.length > 0;
  const text =
    values.length === primaryValues.length
      ? triggerLabel(label, primaryValues, primary)
      : `${label} · ${values.length}`;
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={cn(
              "h-8 rounded-lg bg-panel px-3 shadow-xs",
              active && "border-foreground ring-1 ring-foreground",
            )}
          />
        }
      >
        <span className="max-w-[180px] truncate">{text}</span>
        <ChevronDownIcon className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          "thin-scroll max-h-[70vh] gap-4 overflow-y-auto p-3.5",
          width,
        )}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

function ColorFilterBody() {
  const { filters, setFilters } = useExplorer();
  const [hexInput, setHexInput] = useState(filters.color?.hex ?? "");
  const color = filters.color;
  const mode = color?.mode ?? "any";
  const setColor = (hex: string | null, m = mode) =>
    setFilters((f) => ({ ...f, color: hex ? { hex, mode: m } : null }));
  const hexValid = normalizeHex(hexInput);
  return (
    <>
      <Section title="Pick a color">
        <div className="grid grid-cols-7 gap-1.5">
          {NAMED_SWATCHES.map((s) => {
            const on = color?.hex === s.hex;
            return (
              <button
                key={s.name}
                type="button"
                aria-label={`${s.name} (${s.hex})`}
                aria-pressed={on}
                title={s.name}
                onClick={() => {
                  setColor(on ? null : s.hex);
                  setHexInput(on ? "" : s.hex);
                }}
                className={cn(
                  "relative h-8 rounded-md ring-1 ring-black/10 transition-transform hover:scale-105",
                  on &&
                    "ring-2 ring-foreground ring-offset-2 ring-offset-popover",
                )}
                style={{ background: s.hex }}
              >
                {on && (
                  <CheckIcon className="absolute inset-0 m-auto size-4 text-white mix-blend-difference" />
                )}
              </button>
            );
          })}
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (hexValid) setColor(hexValid);
          }}
        >
          <span
            className="size-8 shrink-0 rounded-md ring-1 ring-black/10"
            style={{ background: hexValid ?? "transparent" }}
          />
          <Input
            value={hexInput}
            onChange={(e) => setHexInput(e.target.value)}
            placeholder="#HEX e.g. #F27C31"
            aria-label="Hex color"
            className="h-8 font-mono text-xs"
          />
          <Button type="submit" size="sm" disabled={!hexValid}>
            Apply
          </Button>
        </form>
      </Section>
      <Section title="Match">
        <div
          className="grid grid-cols-2 rounded-lg border p-0.5 text-[13px]"
          role="radiogroup"
          aria-label="Color match mode"
        >
          {(["background", "any"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() =>
                color ? setColor(color.hex, m) : setFilters((f) => f)
              }
              className={cn(
                "h-7 rounded-md transition-colors",
                mode === m
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "background" ? "Background only" : "Any of the 3 colors"}
            </button>
          ))}
        </div>
        {color && (
          <button
            type="button"
            className="text-xs text-muted-foreground underline underline-offset-2"
            onClick={() => {
              setColor(null);
              setHexInput("");
            }}
          >
            Clear color
          </button>
        )}
      </Section>
      <Section title="Color names">
        <OptionList facet="colorName" />
      </Section>
      <Section title="Color scheme">
        <OptionList facet="colorScheme" />
      </Section>
    </>
  );
}

function FilterGroup({
  title,
  facets,
  children,
}: {
  title: string;
  facets: FacetKey[];
  children: ReactNode;
}) {
  const { effective } = useExplorer();
  const n = activeFilterCount(effective, facets);
  return (
    <Collapsible className="border-b last:border-b-0">
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
      <CollapsibleContent className="space-y-3 pb-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

const MORE_FACETS: FacetKey[] = [
  "industry",
  "topic",
  "contentType",
  "mood",
  "fontStyle",
  "case",
  "effects",
  "elements",
  "contains",
  "tag",
  "texture",
];

function MoreFilters() {
  const { effective } = useExplorer();
  const [open, setOpen] = useState(false);
  const [tagText, setTagText] = useState("");
  const [elText, setElText] = useState("");
  const n = activeFilterCount(effective, MORE_FACETS);
  return (
    <>
      <Button
        variant="outline"
        className="h-8 rounded-lg bg-panel px-3 shadow-xs"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontalIcon />
        More filters
        {n > 0 && (
          <span className="rounded-full bg-[#F0812F] px-1.5 text-[10px] text-white tabular-nums">
            {n}
          </span>
        )}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[420px]! max-w-[90vw]! gap-0">
          <SheetHeader className="border-b">
            <SheetTitle>More filters</SheetTitle>
            <SheetDescription>
              Counts update with your search. Greyed options have no results.
            </SheetDescription>
          </SheetHeader>
          <div className="thin-scroll flex-1 overflow-y-auto px-4">
            <FilterGroup
              title="Industry & topic"
              facets={["industry", "topic"]}
            >
              <Section title="Industry">
                <OptionList facet="industry" />
              </Section>
              <Section title="Topic">
                <OptionList facet="topic" limit={40} />
              </Section>
            </FilterGroup>
            <FilterGroup title="Content type" facets={["contentType"]}>
              <OptionList facet="contentType" />
            </FilterGroup>
            <FilterGroup title="Mood" facets={["mood"]}>
              <OptionList facet="mood" />
            </FilterGroup>
            <FilterGroup
              title="Typography"
              facets={["fontStyle", "case", "effects"]}
            >
              <Section title="Font style">
                <OptionList facet="fontStyle" />
              </Section>
              <Section title="Case">
                <OptionList facet="case" />
              </Section>
              <Section title="Effects">
                <OptionList facet="effects" />
              </Section>
            </FilterGroup>
            <FilterGroup
              title="Graphic elements"
              facets={["elements", "texture"]}
            >
              <Section title="Texture">
                <OptionList facet="texture" />
              </Section>
              <Input
                value={elText}
                onChange={(e) => setElText(e.target.value)}
                placeholder="Find an element… (stars, ribbon, badge)"
                className="h-8 text-xs"
                aria-label="Find an element"
              />
              <OptionList facet="elements" limit={30} filterText={elText} />
            </FilterGroup>
            <FilterGroup title="Contains" facets={["contains"]}>
              <OptionList facet="contains" />
            </FilterGroup>
            <FilterGroup title="Tags" facets={["tag"]}>
              <Input
                value={tagText}
                onChange={(e) => setTagText(e.target.value)}
                placeholder="Find a tag…"
                className="h-8 text-xs"
                aria-label="Find a tag"
              />
              <OptionList facet="tag" limit={40} filterText={tagText} />
            </FilterGroup>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function FilterBar() {
  const { results, base, shuffleSeed, setShuffleSeed, view, center } =
    useExplorer();
  const hint = useMemo(() => {
    if (view.kind === "similar" && center)
      return (
        <>
          Exploring similar to <b className="text-foreground">{center.name}</b>
        </>
      );
    return null;
  }, [view.kind, center]);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <QuickFilter label="Style" facets={["aesthetic"]}>
          <Section title="Aesthetic">
            <OptionList facet="aesthetic" />
          </Section>
        </QuickFilter>
        <QuickFilter
          label="Color"
          facets={["colorName", "colorScheme"]}
          width="w-[360px]"
        >
          <ColorFilterBody />
        </QuickFilter>
        <QuickFilter
          label="Layout"
          facets={[
            "structure",
            "alignment",
            "balance",
            "whitespace",
            "textDensity",
          ]}
          width="w-[440px]"
        >
          <Section title="Structure">
            <OptionList facet="structure" tiles icon="layout" />
          </Section>
          <Section title="Alignment">
            <OptionList facet="alignment" />
          </Section>
          <div className="grid grid-cols-2 gap-3">
            <Section title="Balance">
              <OptionList facet="balance" />
            </Section>
            <Section title="Whitespace">
              <OptionList facet="whitespace" />
            </Section>
          </div>
          <Section title="Text amount">
            <OptionList facet="textDensity" />
          </Section>
        </QuickFilter>
        <QuickFilter
          label="Image"
          facets={["imageType", "placement", "frameShape", "illustrationStyle"]}
          width="w-[420px]"
        >
          <Section title="Type">
            <OptionList facet="imageType" tiles icon="image" />
          </Section>
          <Section title="Placement">
            <OptionList facet="placement" tiles icon="image" />
          </Section>
          <Section title="Frame shape">
            <OptionList facet="frameShape" />
          </Section>
          <Section title="Illustration style">
            <OptionList facet="illustrationStyle" />
          </Section>
        </QuickFilter>
        <MoreFilters />
        <div className="mx-1 h-5 w-px bg-border" />
        <Button
          variant="outline"
          aria-pressed={shuffleSeed !== null}
          className={cn(
            "h-8 rounded-lg bg-panel px-3 shadow-xs",
            shuffleSeed !== null && "border-foreground ring-1 ring-foreground",
          )}
          onClick={() =>
            setShuffleSeed(shuffleSeed === null ? Date.now() % 100000 : null)
          }
          title="Random order so you don't keep seeing the same designs"
        >
          <ShuffleIcon />
          Shuffle
        </Button>
        {shuffleSeed !== null && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Reshuffle"
            onClick={() => setShuffleSeed((Date.now() % 100000) + 1)}
          >
            <RefreshCwIcon />
          </Button>
        )}
        <div className="ml-auto text-xs text-muted-foreground">{hint}</div>
      </div>
      <div className="text-xs text-muted-foreground tabular-nums">
        <b className="text-foreground">{results.length}</b> of {base.length}{" "}
        no-logo templates
      </div>
    </div>
  );
}
