"use client";
import { PanelRightCloseIcon, ShuffleIcon } from "lucide-react";
import { activeFilterCount, FACET_MAP } from "@/lib/facets";
import { cn } from "@/lib/utils";
import { useExplorer } from "./context";
import {
  ColorFilterBody,
  FilterGroup,
  MORE_FACET_GROUPS,
  OptionList,
  Section,
} from "./filter-bar";
import { ActiveChips } from "./chips";
import { HEADER_CONTROL, HEADER_CONTROL_IDLE } from "./header";

function SortControl() {
  const { sort, setSort, setShuffleSeed } = useExplorer();
  return (
    <Section title="Sort">
      <div className="flex items-center gap-1.5">
        <div
          className="grid flex-1 grid-cols-2 gap-0.5 rounded-lg bg-muted p-0.5 text-[13px]"
          role="radiogroup"
          aria-label="Sort order"
        >
          {(["relevance", "shuffle"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={sort === s}
              onClick={() => {
                setSort(s);
                if (s === "shuffle")
                  setShuffleSeed(Math.floor(Math.random() * 1_000_000));
              }}
              className={cn(
                "h-7 min-w-0 truncate rounded-md px-2 capitalize transition-colors",
                sort === s
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        {sort === "shuffle" && (
          <button
            type="button"
            aria-label="Shuffle again"
            title="Shuffle again"
            onClick={() =>
              setShuffleSeed(Math.floor(Math.random() * 1_000_000))
            }
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-panel ring-1 ring-foreground/10 hover:bg-muted"
          >
            <ShuffleIcon className="size-4" />
          </button>
        )}
      </div>
    </Section>
  );
}

function Body() {
  const { clearAll, effective, filters } = useExplorer();
  const active = activeFilterCount(effective) + (effective.color ? 1 : 0);
  return (
    <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto px-4 pb-24">
      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          type="button"
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={clearAll}
        >
          Clear all
        </button>
        <span className="text-xs text-muted-foreground tabular-nums">
          {active} active
        </span>
      </div>
      <ActiveChips />
      <SortControl />
      <FilterGroup
        title="Style"
        facets={["aesthetic", "mood", "colorScheme", "texture"]}
        defaultOpen
      >
        <Section title="Aesthetic">
          <OptionList facet="aesthetic" />
        </Section>
        <Section title="Mood">
          <OptionList facet="mood" />
        </Section>
        <Section title="Colour scheme">
          <OptionList facet="colorScheme" />
        </Section>
        <Section title="Texture">
          <OptionList facet="texture" />
        </Section>
      </FilterGroup>
      <FilterGroup
        title="Colour"
        facets={["colorName"]}
        defaultOpen={!!filters.color}
      >
        <ColorFilterBody />
      </FilterGroup>
      <FilterGroup
        title="Layout"
        facets={[
          "structure",
          "alignment",
          "balance",
          "whitespace",
          "textDensity",
        ]}
        defaultOpen
      >
        <Section title="Structure">
          <OptionList facet="structure" tiles icon="layout" />
        </Section>
        <Section title="Alignment">
          <OptionList facet="alignment" />
        </Section>
        <Section title="Balance">
          <OptionList facet="balance" />
        </Section>
        <Section title="Whitespace">
          <OptionList facet="whitespace" />
        </Section>
        <Section title="Text amount">
          <OptionList facet="textDensity" />
        </Section>
      </FilterGroup>
      <FilterGroup
        title="Image"
        facets={["imageType", "placement", "frameShape", "illustrationStyle"]}
        defaultOpen
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
      </FilterGroup>
      <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        More filters
      </div>
      {MORE_FACET_GROUPS.map((g) => (
        <FilterGroup key={g.title} title={g.title} facets={g.facets}>
          {g.facets.map((k) => (
            <Section key={k} title={FACET_MAP[k].label}>
              <OptionList
                facet={k}
                limit={k === "tag" || k === "elements" ? 40 : undefined}
              />
            </Section>
          ))}
        </FilterGroup>
      ))}
    </div>
  );
}

/** Right-hand filter panel (Style / Colour / Layout / Image / More / Sort), opened by the filter icon.
 *  Slides out from the right and pushes the layout, matching the detail panel (not a modal sheet). */
export function FilterPanel() {
  const { filterPanelOpen, setFilterPanelOpen } = useExplorer();
  return (
    <aside
      aria-hidden={!filterPanelOpen}
      className={cn(
        "relative z-20 h-full shrink-0 overflow-hidden bg-background transition-[width] duration-300 ease-out",
        filterPanelOpen ? "visible w-[380px] max-md:w-[92vw]" : "invisible w-0",
      )}
      aria-label="Filters"
      data-testid="filter-panel"
    >
      <div
        inert={!filterPanelOpen}
        className="flex h-full w-[380px] max-md:w-[92vw] flex-col border-l border-border/60"
      >
        <div className="flex shrink-0 items-center justify-between px-4 py-2.5">
          <div className="text-xl font-semibold">Filters</div>
          <button
            type="button"
            aria-label="Collapse filters"
            onClick={() => setFilterPanelOpen(false)}
            className={cn(HEADER_CONTROL, HEADER_CONTROL_IDLE)}
          >
            <PanelRightCloseIcon className="size-4" />
          </button>
        </div>
        {filterPanelOpen && <Body />}
      </div>
    </aside>
  );
}
