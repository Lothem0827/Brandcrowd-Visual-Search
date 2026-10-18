"use client";
import type { Template } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { templateImageUrl } from "@/lib/images";
import { ThumbImage } from "./thumb-image";

/**
 * Thumbnail collage for a board: the first few designs laid out so the cover reads as a
 * board at a glance — 1 full, 2 side by side, 3 as one large left + two stacked right,
 * 4 as a 2x2. Empty boards fall back to a plain muted tile. Shared by the boards page
 * cards and the multi-select destination chips so both read the same.
 */
export function BoardCover({
  items,
  className,
}: {
  items: Template[];
  className?: string;
}) {
  const count = Math.min(items.length, 4);
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg",
        // The gap between cells shows this fill: page background makes the divider invisible on
        // the boards page, while an empty board keeps muted so its card doesn't vanish.
        count === 0 ? "bg-muted" : "bg-background",
        className,
      )}
    >
      {count === 0 ? null : count === 1 ? (
        <CoverCell template={items[0]} />
      ) : count === 2 ? (
        <div className="grid size-full grid-cols-2 gap-0.5">
          <CoverCell template={items[0]} />
          <CoverCell template={items[1]} />
        </div>
      ) : count === 3 ? (
        <div className="grid size-full grid-cols-2 grid-rows-2 gap-0.5">
          <CoverCell template={items[0]} className="row-span-2" />
          <CoverCell template={items[1]} />
          <CoverCell template={items[2]} />
        </div>
      ) : (
        <div className="grid size-full grid-cols-2 grid-rows-2 gap-0.5">
          <CoverCell template={items[0]} />
          <CoverCell template={items[1]} />
          <CoverCell template={items[2]} />
          <CoverCell template={items[3]} />
        </div>
      )}
    </div>
  );
}

function CoverCell({ template, className }: { template?: Template; className?: string }) {
  if (!template) return <span className={cn("block size-full bg-muted", className)} />;
  return (
    <span className={cn("block size-full overflow-hidden", className)}>
      <ThumbImage src={templateImageUrl(template.templateId)} alt="" className="size-full object-cover" />
    </span>
  );
}
