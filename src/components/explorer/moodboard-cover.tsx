"use client";
import { moodboardSource } from "@/lib/brief";
import { paletteFromHarmony } from "@/lib/harmony";
import type { MoodboardDraft } from "@/lib/moodboards";
import type { Template } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { BoardCover } from "./board-cover";

/**
 * Cover for a saved moodboard: inspiration designs on top, popular colours and the
 * harmony palette along the bottom. Whichever of those is missing fills the tile.
 */
export function MoodboardCover({
  draft,
  designs,
  className,
}: {
  draft: MoodboardDraft;
  designs: Template[];
  className?: string;
}) {
  const popular = draft.colors.map((color, index) => draft.overrides[String(index)] ?? color.hex);
  const picked = popular[Math.min(draft.selected, Math.max(popular.length - 1, 0))];
  const palette = picked ? paletteFromHarmony(picked, draft.harmony).map((color) => color.hex) : [];
  const hasDesigns = designs.length > 0;
  const hasColours = popular.length > 0;

  if (!hasDesigns && !hasColours) {
    return <div className={cn("overflow-hidden rounded-lg bg-muted", className)} />;
  }

  if (hasDesigns && !hasColours) {
    return <BoardCover items={designs} className={className} />;
  }

  return (
    <div className={cn("flex flex-col gap-0.5 overflow-hidden rounded-lg bg-background", className)}>
      {hasDesigns && (
        <div className="min-h-0 flex-1">
          <BoardCover items={designs} className="size-full rounded-none" />
        </div>
      )}
      <div className={cn("flex min-h-0 flex-col gap-0.5", hasDesigns ? "h-[42%] shrink-0" : "flex-1")}>
        <SwatchRow hexes={popular} />
        {palette.length > 0 && <SwatchRow hexes={palette} />}
      </div>
    </div>
  );
}

/** Industry when the subject resolves to one; otherwise the text that was saved. */
export function moodboardCardTitle(templates: Template[], query: string): string {
  const source = moodboardSource(templates, query);
  return source?.match.kind === "industry" ? source.match.label : query;
}

function SwatchRow({ hexes }: { hexes: string[] }) {
  if (!hexes.length) return null;
  return (
    <div
      className="grid min-h-0 flex-1 gap-0.5"
      style={{ gridTemplateColumns: `repeat(${hexes.length}, minmax(0, 1fr))` }}
    >
      {hexes.map((hex, index) => (
        <span key={`${index}-${hex}`} className="block size-full" style={{ background: hex }} />
      ))}
    </div>
  );
}
