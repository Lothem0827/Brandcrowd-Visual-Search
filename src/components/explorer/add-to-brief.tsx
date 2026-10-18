"use client";
import { SparklesIcon } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { designCard, LANE, type BriefDraft } from "@/lib/brief-board";
import { getBriefStore } from "@/lib/briefs";
import type { Template } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { useExplorer } from "./context";

/** Inspiration cards join the right-hand lane, below tags and earlier inspiration. */
const INSPIRATION_X = LANE.side;

/**
 * Append a design to the active brief workspace as a colour source.
 *
 * Only called from an opened design (lightbox or detail panel), never from grid
 * thumbnails: adding inspiration is a deliberate act, not an accidental hover.
 */
export function addDesignToActiveDraft(
  template: Template,
): { draftId: string; label: string } | null {
  const store = getBriefStore();
  const activeId = store.activeDraftId();
  let draft: BriefDraft | undefined = activeId ? store.getDraft(activeId) : undefined;
  if (!draft) {
    draft = store.createDraft({
      query: template.industry,
      label: template.industry,
      templates: 0,
    });
  }
  const column = draft.cards.filter(
    (card) => card.x === INSPIRATION_X || card.kind === "design",
  );
  const y = column.reduce(
    (max, card) => Math.max(max, card.y + (card.kind === "tags" ? 190 : 300)),
    0,
  );
  store.patchDraft(draft.id, {
    cards: [...draft.cards, designCard(template, INSPIRATION_X, y)],
  });
  store.setActiveDraft(draft.id);
  return { draftId: draft.id, label: draft.label };
}

export function AddToBriefButton({
  template,
  className,
}: {
  template: Template;
  className?: string;
}) {
  const { setPage } = useExplorer();

  return (
    <button
      type="button"
      data-testid="add-to-brief"
      onClick={() => {
        const next = addDesignToActiveDraft(template);
        toast.success(`Added to “${next?.label ?? "brief"}”`, {
          description: "Its colours can be dragged onto any palette card.",
          action: { label: "Open brief", onClick: () => setPage("brief") },
        });
      }}
      className={cn(
        "flex h-10 items-center justify-center gap-2 rounded-xl bg-panel px-3 text-sm font-medium transition-colors hover:bg-muted",
        className,
      )}
    >
      <SparklesIcon className="size-4" />
      Add to brief
    </button>
  );
}
