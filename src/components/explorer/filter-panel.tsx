"use client";
import { PanelRightCloseIcon } from "lucide-react";
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
import { SidePanel } from "./side-panel";

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
      <FilterGroup
        title="Industry & content type"
        facets={["industry", "contentType"]}
      >
        <Section title="Industry">
          <OptionList facet="industry" />
        </Section>
        <Section title="Content type">
          <OptionList facet="contentType" />
        </Section>
      </FilterGroup>
      <FilterGroup
        title="Style"
        facets={["aesthetic", "mood", "texture"]}
        defaultOpen
      >
        <Section title="Aesthetic">
          <OptionList facet="aesthetic" />
        </Section>
        <Section title="Mood">
          <OptionList facet="mood" />
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
        facets={["structure", "alignment"]}
        defaultOpen
      >
        <Section title="Structure">
          <OptionList facet="structure" tiles icon="layout" />
        </Section>
        <Section title="Alignment">
          <OptionList facet="alignment" />
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

/** Right-hand filter panel (Style / Colour / Layout / Image / More). */
export function FilterPanel() {
  const { filterPanelOpen, setFilterPanelOpen } = useExplorer();
  return (
    <SidePanel
      open={filterPanelOpen}
      onClose={() => setFilterPanelOpen(false)}
      width={380}
      label="Filters"
      testId="filter-panel"
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
    </SidePanel>
  );
}
