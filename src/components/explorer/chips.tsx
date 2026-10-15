"use client";
import { SparklesIcon, XIcon } from "lucide-react";
import { displayValue, FACET_MAP, type FacetKey } from "@/lib/facets";
import { cn } from "@/lib/utils";
import { useExplorer } from "./context";

export function ActiveChips() {
  const {
    parsed,
    filters,
    toggleFacet,
    setFilters,
    clearAll,
    imageQuery,
    setImageQuery,
    query,
    searching,
  } = useExplorer();
  const detected = parsed.chips;
  const committed = (
    Object.entries(filters.facets) as [FacetKey, string[]][]
  ).flatMap(([k, vs]) =>
    (vs ?? [])
      .filter((v) => !detected.some((c) => c.facet === k && c.value === v))
      .map((v) => ({ facet: k, value: v })),
  );
  const any =
    detected.length ||
    committed.length ||
    filters.color ||
    imageQuery ||
    query.trim();
  return (
    <div className="flex min-h-7 flex-wrap items-center gap-1.5">
      {detected.length > 0 && (
        <span className="mr-1 flex items-center gap-1 text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
          <SparklesIcon className="size-3" /> Detected
        </span>
      )}
      {detected.map((c) => (
        <Chip
          key={`d:${c.facet}:${c.value}`}
          dark
          label={FACET_MAP[c.facet].label}
          value={displayValue(c.facet, c.value)}
          onRemove={() => toggleFacet(c.facet, c.value)}
        />
      ))}
      {committed.map((c) => (
        <Chip
          key={`c:${c.facet}:${c.value}`}
          label={FACET_MAP[c.facet].label}
          value={displayValue(c.facet, c.value)}
          onRemove={() => toggleFacet(c.facet, c.value)}
        />
      ))}
      {filters.color && (
        <Chip
          label={filters.color.mode === "background" ? "Background" : "Color"}
          value={filters.color.hex}
          swatch={filters.color.hex}
          onRemove={() => setFilters((f) => ({ ...f, color: null }))}
        />
      )}
      {imageQuery && (
        <Chip
          label="Image"
          value="colors from upload"
          swatch={imageQuery.palette[0]?.hex}
          onRemove={() => setImageQuery(null)}
        />
      )}
      {parsed.text && (
        <span className="text-xs text-muted-foreground">
          + text “{parsed.text}”
        </span>
      )}
      {searching && query.trim() && (
        <span className="text-xs text-muted-foreground" role="status">
          Searching…
        </span>
      )}
      {any ? (
        <button
          type="button"
          onClick={clearAll}
          className="ml-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Clear all
        </button>
      ) : (
        <span className="text-xs text-muted-foreground">
          Try “construction bold design”, “retro serif cutout”, or “text only
          quote”.
        </span>
      )}
    </div>
  );
}

function Chip({
  label,
  value,
  onRemove,
  dark,
  swatch,
}: {
  label: string;
  value: string;
  onRemove: () => void;
  dark?: boolean;
  swatch?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full pr-1 pl-2.5 text-xs",
        dark ? "bg-foreground text-background" : "bg-panel",
      )}
    >
      {swatch && (
        <span
          className="size-3 rounded-full ring-1 ring-black/15"
          style={{ background: swatch }}
        />
      )}
      <span className={dark ? "text-background/65" : "text-muted-foreground"}>
        {label}:
      </span>
      <span className="font-medium">{value}</span>
      <button
        type="button"
        aria-label={`Remove ${label} ${value}`}
        onClick={onRemove}
        className={cn(
          "grid size-6 place-items-center rounded-full",
          dark ? "hover:bg-background/20" : "hover:bg-muted",
        )}
      >
        <XIcon className="size-3" />
      </button>
    </span>
  );
}
