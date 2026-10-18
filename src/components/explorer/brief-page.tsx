"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  CopyIcon,
  FilePlusIcon,
  LayoutGridIcon,
  PaletteIcon,
  PanelRightIcon,
  SaveIcon,
  SparklesIcon,
  TypeIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  CARD_SIZE,
  LANE,
  SLOT_LABELS,
  addInspiration,
  cardsFromBrief,
  designCard,
  emptyBundle,
  formatSnapshot,
  paletteSlots,
  patchCard,
  plugInto,
  setSlot,
  snapshotOfBundle,
  TAGS_LIMIT,
  toggleTag,
  type ArmedSlot,
  type BriefBundleCard,
  type BriefCard,
  type BriefDraft,
  type DesignCard,
  type PaletteCard,
  type TagsCard,
  type TitleCard,
} from "@/lib/brief-board";
import type { BriefStore } from "@/lib/briefs";
import { generateBrief, MAX_BRIEF_OPTIONS } from "@/lib/brief";
import { eyeDropperSupported, pickScreenColor } from "@/lib/eyedropper";
import type { Template } from "@/lib/schema";
import { useIsMobile } from "@/lib/use-media-query";
import { sentenceCase } from "@/lib/facets";
import { cn } from "@/lib/utils";
import { BriefCanvas } from "./brief-canvas";
import { useExplorer } from "./context";
import { InspirationPanel } from "./inspiration-panel";
import { PalettePicker, type PaletteTarget } from "./palette-picker";
import { HEADER_CONTROL, HEADER_CONTROL_IDLE, HEADER_CONTROL_ON, HEADER_ROW, HEADER_TITLE } from "./header";
import { useActiveDraftId, useBriefs } from "./use-briefs";

/** Vertical gap used when "Add more" drops a card below everything already placed. */
const ADD_MORE_GAP = 40;

/** A quiet pill button used for every secondary action in this page's header. */
const PILL =
  "flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-panel px-3 text-[12px] font-medium transition-colors hover:bg-muted disabled:opacity-40";

/** Floating chip used above the generator dock. */
const DOCK_CHIP =
  "pointer-events-auto flex h-8 items-center gap-1.5 rounded-full bg-panel/90 px-3 text-[12px] font-medium shadow-sm backdrop-blur-md transition-colors hover:bg-muted";

export function BriefPage() {
  const { base, setPage } = useExplorer();
  const { drafts, saved, store } = useBriefs();
  const activeId = useActiveDraftId();
  const isMobile = useIsMobile();

  const active = drafts.find((draft) => draft.id === activeId) ?? drafts.at(-1);
  const [fresh, setFresh] = useState(false);
  const draft = fresh ? undefined : active;

  const [input, setInput] = useState("");
  const [seenDraft, setSeenDraft] = useState<string | null>(draft?.id ?? null);
  // Switching drafts (or starting a new one) seeds the dock with its query.
  if ((draft?.id ?? null) !== seenDraft) {
    setSeenDraft(draft?.id ?? null);
    setInput(draft?.query ?? "");
  }

  const [count, setCount] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fitSignal, setFitSignal] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);

  /* Inspiration panel + colour picker */
  const [inspoOpen, setInspoOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [armedSlot, setArmedSlot] = useState<ArmedSlot | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const canPickScreen = eyeDropperSupported();

  // Switching drafts must not leave a colour armed on a card that no longer exists.
  const [seenPickerDraft, setSeenPickerDraft] = useState(draft?.id ?? null);
  if ((draft?.id ?? null) !== seenPickerDraft) {
    setSeenPickerDraft(draft?.id ?? null);
    setArmedSlot(null);
    setPreview(null);
  }

  const industries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const template of base) {
      counts.set(template.industry, (counts.get(template.industry) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6)
      .map(([name]) => name);
  }, [base]);

  // Saved records keep `finalId`; since plugging replaced final nodes it is the brief card id.
  const savedBundleIds = useMemo(() => {
    if (!draft) return new Set<string>();
    return new Set(saved.filter((item) => item.draftId === draft.id).map((item) => item.finalId));
  }, [draft, saved]);

  const bumpFit = () => setFitSignal((value) => value + 1);

  /* ------------------------------------------------------------------ */
  /* Colour picking: manual spectrum + eyedropper share one writer       */
  /* ------------------------------------------------------------------ */

  const lastWrite = useRef<string | null>(null);

  /** The slot a colour edit lands in: the armed one, else the board's first palette. */
  const resolveTarget = useCallback((): ArmedSlot | null => {
    if (!draft) return null;
    if (armedSlot) return armedSlot;
    const loose = draft.cards.find((card): card is PaletteCard => card.kind === "palette");
    if (loose) return { cardId: loose.id, index: 0 };
    const bundle = draft.cards.find(
      (card): card is BriefBundleCard => card.kind === "brief" && !!card.palette,
    );
    return bundle ? { cardId: bundle.id, index: 0 } : null;
  }, [armedSlot, draft]);

  /** Fill the armed slot (arming the board's first palette when nothing is armed). */
  const fillSlot = useCallback(
    (hex: string) => {
      const target = resolveTarget();
      if (!target) {
        setPickerOpen(true);
        return;
      }
      setArmedSlot((current) =>
        current?.cardId === target.cardId && current.index === target.index ? current : target,
      );
      setPreview(hex);
    },
    [resolveTarget],
  );

  const armSlot = useCallback(
    (cardId: string, index: number) => {
      const hex = paletteSlots(draft?.cards.find((card) => card.id === cardId))?.[index]?.hex ?? null;
      setArmedSlot({ cardId, index });
      setPreview(hex);
      // Arming only opens the picker: seeding must not count as a colour change.
      if (draft && hex) lastWrite.current = `${draft.id}:${cardId}:${index}:${hex}`;
      setPickerOpen(true);
    },
    [draft],
  );

  // Manual edits are committed on a short delay, so dragging across the spectrum does not
  // write to the store (and localStorage) on every pointer move.
  useEffect(() => {
    if (!preview || !armedSlot || !draft) return;
    const key = `${draft.id}:${armedSlot.cardId}:${armedSlot.index}:${preview}`;
    if (lastWrite.current === key) return;
    const timer = window.setTimeout(() => {
      lastWrite.current = key;
      const card = draft.cards.find((current) => current.id === armedSlot.cardId);
      const name =
        card?.kind === "brief"
          ? card.name || card.palette?.label || "Brief"
          : card?.kind === "palette"
            ? card.label || "Palette"
            : "Palette";
      store.patchDraft(draft.id, {
        cards: setSlot(draft.cards, armedSlot.cardId, armedSlot.index, preview),
      });
      toast.success(`Filled ${SLOT_LABELS[armedSlot.index]} · ${name}`, { id: "slot-fill" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [armedSlot, draft, preview, store]);

  const pickColor = useCallback(async () => {
    if (!eyeDropperSupported()) {
      setPickerOpen(true);
      return;
    }
    const hex = await pickScreenColor();
    if (hex) fillSlot(hex);
  }, [fillSlot]);

  // "I" samples a colour from anywhere on screen, matching the picker's kbd hint.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "i" && event.key !== "I") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.closest('[role="slider"]'))
      ) {
        return;
      }
      if (document.querySelector('[data-slot="dialog-content"]')) return;
      event.preventDefault();
      void pickColor();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickColor]);

  const paletteTargets = useMemo<PaletteTarget[]>(() => {
    if (!draft) return [];
    const targets: PaletteTarget[] = [];
    for (const card of draft.cards) {
      if (card.kind === "palette") {
        targets.push({ cardId: card.id, label: card.label || "Palette", slots: card.slots });
      } else if (card.kind === "brief" && card.palette) {
        targets.push({ cardId: card.id, label: card.name || card.palette.label || "Brief", slots: card.palette.slots });
      }
    }
    return targets;
  }, [draft]);

  const armedHex =
    armedSlot && draft
      ? (paletteSlots(draft.cards.find((card) => card.id === armedSlot.cardId))?.[armedSlot.index]
          ?.hex ?? null)
      : null;
  const pickerHex = preview ?? armedHex ?? "#F07B22";

  /** Mobile/narrow screens have no drag, so an inspiration tile can be added with one tap. */
  const addDesignToBoard = (template: Template) => {
    if (!draft) return;
    const host = draft.cards.find((card): card is BriefBundleCard => card.kind === "brief");
    const lowest = draft.cards.reduce(
      (max, card) => Math.max(max, card.y + CARD_SIZE[card.kind].h),
      0,
    );
    const x = LANE.side;
    const y = lowest + ADD_MORE_GAP;
    const next = addInspiration(draft.cards, designCard(template, x, y), host?.id ?? null, x, y);
    if (next !== draft.cards) {
      store.patchDraft(draft.id, { cards: next });
      bumpFit();
    }
  };

  const copy = useCallback((text: string, key: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(key);
        window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1400);
      })
      .catch(() => setError("Couldn't copy to the clipboard."));
  }, []);

  /** Append a generated batch. Nothing already on the canvas is discarded. */
  const generate = (value: string, wanted: number) => {
    const text = value.trim();
    if (!text) return;
    const previous = fresh ? undefined : active;
    const seed = previous && previous.cards.length ? (previous.seed ?? 0) + 1 : 0;
    const brief = generateBrief(base, text, wanted, {
      seed,
      minShare: seed > 0 ? 0.02 : undefined,
    });
    if (!brief) {
      setError(`No designs match “${text}”. Try an industry like Construction or Food & Drink.`);
      return;
    }
    setError(null);
    setNotice(
      brief.options.some((option) => option.variation)
        ? "This industry has no further distinct colour stories, so the extra option is a variation of its strongest colour."
        : null,
    );

    const target =
      previous ??
      store.createDraft({
        query: text,
        label: brief.match.label,
        templates: brief.match.templates,
      });
    const batchIndex = target.cards.filter((card) => card.kind === "tags").length;
    store.patchDraft(target.id, {
      query: text,
      label: brief.match.label,
      templates: brief.match.templates,
      cards: [...target.cards, ...cardsFromBrief(brief, batchIndex)],
      seed,
    });
    store.setActiveDraft(target.id);
    setFresh(false);
    setInput(text);
    bumpFit();
  };

  /** Add just titles or just palettes, below everything already placed. */
  const addMore = (kind: "title" | "palette") => {
    if (!draft) return;
    const text = draft.query.trim() || draft.label;
    const seed = (draft.seed ?? 0) + 1;
    const brief = generateBrief(base, text, 1, { seed, minShare: 0.02 });
    if (!brief) {
      setNotice("This industry ran out of usable colour data — nothing to add.");
      return;
    }
    const lowest = draft.cards.reduce(
      (max, card) => Math.max(max, card.y + CARD_SIZE[card.kind].h),
      0,
    );
    const batchIndex = draft.cards.filter((card) => card.kind === "tags").length;
    const extra = cardsFromBrief(brief, batchIndex, lowest + ADD_MORE_GAP).filter(
      (card) => card.kind === kind,
    );
    store.patchDraft(draft.id, { cards: [...draft.cards, ...extra], seed });
    setNotice(
      brief.options[0]?.variation
        ? "No distinct colour story left; added a variation of this industry's strongest colour."
        : null,
    );
    bumpFit();
  };

  const saveBundle = useCallback(
    (bundleId: string) => {
      if (!draft) return;
      const savedBrief = store.saveSnapshot(draft.id, bundleId, "");
      if (!savedBrief) return;
      toast.success(`Saved “${savedBrief.name}”`, {
        description: "Find it on the Boards page.",
        action: { label: "View", onClick: () => setPage("boards") },
      });
    },
    [draft, setPage, store],
  );

  const startNew = () => {
    setFresh(true);
    setInput("");
    setError(null);
    setNotice(null);
  };

  const copyDraft = () => {
    if (!draft) return;
    const bundles = draft.cards.filter(
      (card): card is BriefBundleCard => card.kind === "brief",
    );
    const text = bundles.length
      ? bundles
          .map((card) => formatSnapshot(snapshotOfBundle(draft.cards, card.id)!, draft.label))
          .join("\n\n")
      : cardsAsText(draft);
    copy(text, "draft");
  };

  const hasCards = !!draft && draft.cards.length > 0;

  return (
    <div className="flex h-full flex-col" data-testid="brief-page">
      <div className={cn(HEADER_ROW, "flex-wrap")}>
        <div className="min-w-0 flex-1 basis-full sm:basis-auto">
          <h1 className={HEADER_TITLE}>Design brief</h1>
          <p className="hidden truncate text-[11px] text-muted-foreground sm:block">
            Generate palette, title and tag cards, then drop them together to plug in a brief.
          </p>
        </div>

        {drafts.length > 0 && (
          <select
            value={fresh ? "" : (draft?.id ?? "")}
            onChange={(event) => {
              const id = event.target.value;
              setFresh(!id);
              if (id) store.setActiveDraft(id);
            }}
            aria-label="Switch brief workspace"
            className="h-8 max-w-[180px] shrink-0 rounded-lg bg-panel px-2 text-[12px] font-medium outline-none ring-1 ring-foreground/10 focus:ring-foreground/25"
          >
            {fresh && <option value="">New brief…</option>}
            {drafts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} ·{" "}
                {item.cards.filter((card) => card.kind === "palette" || card.kind === "brief").length}{" "}
                palettes
              </option>
            ))}
          </select>
        )}

        <button type="button" onClick={startNew} className={PILL} title="Start a new brief workspace">
          <FilePlusIcon className="size-3.5" /> New
        </button>

        {hasCards && (
          <button
            type="button"
            aria-label="Copy the whole draft"
            title="Copy the whole draft"
            onClick={copyDraft}
            className={cn(HEADER_CONTROL, HEADER_CONTROL_IDLE, "rounded-xl")}
          >
            {copied === "draft" ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
          </button>
        )}

        <button
          type="button"
          aria-label="Search inspiration"
          title="Search inspiration"
          aria-pressed={inspoOpen}
          onClick={() => {
            setInspoOpen((open) => !open);
            bumpFit();
          }}
          className={cn(HEADER_CONTROL, inspoOpen ? HEADER_CONTROL_ON : HEADER_CONTROL_IDLE)}
        >
          <PanelRightIcon className="size-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {!hasCards ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 pb-44 text-center">
              <span className="grid size-11 place-items-center rounded-2xl bg-foreground text-background">
                <LayoutGridIcon className="size-5" />
              </span>
              <p className="text-sm font-semibold">Start with an industry, topic or theme</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Generating lays out title, four-colour palette and tags cards. Move them around, drag
                colours between palettes, then drop a title, a palette and the tags on top of each
                other so they plug into one brief card you can name and save.
              </p>
            </div>
          ) : isMobile ? (
            <BriefMobileList
              draft={draft}
              store={store}
              savedBundleIds={savedBundleIds}
              onSaveBundle={saveBundle}
              onCopy={copy}
              copied={copied}
              armedSlot={armedSlot}
              armSlot={armSlot}
            />
          ) : (
            <BriefCanvas
              draft={draft}
              store={store}
              savedBundleIds={savedBundleIds}
              fitSignal={fitSignal}
              onSaveBundle={saveBundle}
              armedSlot={armedSlot}
              armSlot={armSlot}
            />
          )}

          {/* The dock floats over the canvas: one place to generate, and contextual actions above it. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex flex-col items-center gap-2 px-4 max-md:bottom-0 max-md:px-0 max-md:pb-2">
            {notice && (
              <p className="pointer-events-auto max-w-[560px] rounded-lg bg-panel/90 px-3 py-1.5 text-center text-[11px] text-muted-foreground backdrop-blur-md">
                {notice}
              </p>
            )}
            {error && (
              <p className="pointer-events-auto max-w-[560px] rounded-lg bg-destructive/10 px-3 py-2 text-center text-[11px] text-destructive backdrop-blur-md">
                {error}
              </p>
            )}

            <div className="flex max-w-full flex-wrap items-center justify-center gap-2">
              {!hasCards
                ? industries.map((industry) => (
                    <button
                      key={industry}
                      type="button"
                      onClick={() => generate(industry, count)}
                      className={DOCK_CHIP}
                    >
                      {industry}
                    </button>
                  ))
                : (
                    <>
                      <button
                        type="button"
                        onClick={() => addMore("title")}
                        className={DOCK_CHIP}
                        title="Add another title card"
                      >
                        <TypeIcon className="size-3.5" /> Add title
                      </button>
                      <button
                        type="button"
                        onClick={() => addMore("palette")}
                        className={DOCK_CHIP}
                        title="Add another palette card"
                      >
                        <PaletteIcon className="size-3.5" /> Add palette
                      </button>
                      <PalettePicker
                        open={pickerOpen}
                        onOpenChange={setPickerOpen}
                        targets={paletteTargets}
                        armed={armedSlot}
                        onArm={armSlot}
                        hex={pickerHex}
                        onHexChange={fillSlot}
                        onPickScreen={() => void pickColor()}
                        supported={canPickScreen}
                        onAddPalette={() => addMore("palette")}
                        triggerClassName={cn(
                          DOCK_CHIP,
                          "pointer-events-auto",
                          pickerOpen && "bg-foreground text-background hover:bg-foreground",
                        )}
                        triggerLabel="Pick colour"
                        side="top"
                        align="center"
                      />
                    </>
                  )}
            </div>

            <form
              className="pointer-events-auto flex h-13 w-full max-w-[620px] items-center gap-1 rounded-full bg-panel/75 pr-2 pl-4 shadow-[0_8px_30px_rgb(0_0_0/0.12)] backdrop-blur-md transition-shadow focus-within:ring-2 focus-within:ring-ring/40"
              onSubmit={(event) => {
                event.preventDefault();
                generate(input, count);
              }}
            >
              <LayoutGridIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Industry, topic or theme"
                aria-label="Industry, topic or theme"
                maxLength={80}
                className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none placeholder:text-muted-foreground/80"
              />

              <div
                role="group"
                aria-label="Number of palette and title options"
                className="flex shrink-0 gap-0.5 rounded-full bg-background/70 p-0.5"
              >
                {Array.from({ length: MAX_BRIEF_OPTIONS }, (_, index) => index + 1).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={count === value}
                    onClick={() => setCount(value)}
                    className={cn(
                      "grid size-7 place-items-center rounded-full text-[11px] tabular-nums transition-colors",
                      count === value
                        ? "bg-foreground font-semibold text-background"
                        : "font-medium text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {value}
                  </button>
                ))}
              </div>

              <Button type="submit" className="h-10 shrink-0 rounded-full px-3.5">
                <SparklesIcon className="size-4" />
                Generate
              </Button>
            </form>
          </div>
        </div>

        {inspoOpen && (
          <InspirationPanel
            open={inspoOpen}
            industry={draft?.query.trim() || draft?.label || ""}
            draft={draft}
            onClose={() => {
              setInspoOpen(false);
              bumpFit();
            }}
            onAddDesign={addDesignToBoard}
            onPickColor={(_template, hex) => fillSlot(hex)}
            onTransitionEnd={bumpFit}
          />
        )}
      </div>
    </div>
  );
}

/** Plain-text dump of a draft that has no plugged brief yet. */
function cardsAsText(draft: BriefDraft): string {
  const titles = draft.cards.filter((card): card is TitleCard => card.kind === "title");
  const palettes = draft.cards.filter((card): card is PaletteCard => card.kind === "palette");
  const tags = draft.cards.find((card): card is TagsCard => card.kind === "tags");
  const lines = [`${draft.label} design brief`];
  palettes.forEach((palette, index) => {
    const title = titles[index];
    lines.push(
      `${index + 1}. ${palette.slots.map((slot) => slot.hex).join(" ")} — ${
        title ? title.text : "(no title plugged in)"
      }`,
    );
  });
  lines.push(`Tags: ${tags?.tags.join(", ") ?? "(none)"}`);
  return lines.join("\n");
}

/** Closest palette above/below a title, used by the mobile "Make brief" shortcut. */
function nearestPalette(cards: BriefCard[], y: number): PaletteCard | undefined {
  let best: PaletteCard | undefined;
  let distance = Number.POSITIVE_INFINITY;
  for (const card of cards) {
    if (card.kind !== "palette") continue;
    const gap = Math.abs(card.y - y);
    if (gap < distance) {
      best = card;
      distance = gap;
    }
  }
  return best;
}

/**
 * Narrow screens have no drag-and-drop, so each title gets a "Make brief" action that plugs
 * it with its nearest palette and the shared tags in one tap.
 */
function BriefMobileList({
  draft,
  store,
  savedBundleIds,
  onSaveBundle,
  onCopy,
  copied,
  armedSlot,
  armSlot,
}: {
  draft: BriefDraft;
  store: BriefStore;
  savedBundleIds: Set<string>;
  onSaveBundle: (bundleId: string) => void;
  onCopy: (text: string, key: string) => void;
  copied: string | null;
  armedSlot: ArmedSlot | null;
  armSlot: (cardId: string, index: number) => void;
}) {
  const update = (id: string, fn: (card: BriefCard) => BriefCard) =>
    store.patchDraft(draft.id, { cards: patchCard(draft.cards, id, fn) });

  const makeBrief = (title: TitleCard) => {
    const palette = nearestPalette(draft.cards, title.y);
    const tags = draft.cards.find((card): card is TagsCard => card.kind === "tags");
    let cards = draft.cards;
    let bundleId: string;
    if (palette) {
      cards = plugInto(cards, title.id, palette.id);
      bundleId = palette.id;
    } else {
      const blank = emptyBundle(title.x, title.y);
      bundleId = blank.id;
      cards = plugInto([...cards, blank], title.id, blank.id);
    }
    if (tags) cards = plugInto(cards, tags.id, bundleId);
    store.patchDraft(draft.id, { cards });
  };

  return (
    <div className="thin-scroll h-full space-y-3 overflow-y-auto px-4 pb-44">
      {draft.cards.map((card) => {
        if (card.kind === "title") {
          return (
            <div key={card.id} className="rounded-xl bg-panel p-3 ring-1 ring-foreground/10">
              <label className="mb-1 block text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                Title
              </label>
              <input
                key={card.text}
                defaultValue={card.text}
                aria-label="Brief title"
                onBlur={(event) => {
                  const text = event.target.value.trim();
                  if (!text) event.target.value = card.text;
                  else if (text !== card.text) {
                    update(card.id, (c) => ({ ...(c as TitleCard), text }));
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    event.currentTarget.value = card.text;
                    event.currentTarget.blur();
                  }
                }}
                className="w-full rounded-lg bg-background px-2 py-1.5 text-[15px] leading-snug font-semibold outline-none ring-1 ring-transparent focus:ring-foreground/20"
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="mt-2 w-full"
                onClick={() => makeBrief(card)}
              >
                <SparklesIcon className="size-3.5" /> Make brief
              </Button>
            </div>
          );
        }
        if (card.kind === "palette") {
          return (
            <div key={card.id} className="rounded-xl bg-panel p-3 ring-1 ring-foreground/10">
              <div className="mb-2 flex items-center justify-between text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                <span>Palette</span>
                <button
                  type="button"
                  onClick={() => onCopy(card.slots.map((slot) => slot.hex).join(", "), card.id)}
                  className="flex h-6 items-center gap-1 rounded-full px-2 text-[10px] font-medium normal-case tracking-normal text-muted-foreground"
                >
                  {copied === card.id ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
                  {copied === card.id ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {card.slots.map((slot, index) => {
                  const armed = armedSlot?.cardId === card.id && armedSlot.index === index;
                  return (
                    <button
                      key={`${index}-${slot.hex}`}
                      type="button"
                      onClick={() => armSlot(card.id, index)}
                      aria-pressed={armed}
                      aria-label={`Edit ${SLOT_LABELS[index]} ${slot.hex}`}
                      className="space-y-1 rounded-lg text-left"
                    >
                      <span
                        className={cn(
                          "block h-12 rounded-lg ring-1 ring-black/10",
                          armed && "ring-2 ring-foreground",
                        )}
                        style={{ background: slot.hex }}
                      />
                      <span className="block text-center text-[10px] font-medium tabular-nums">
                        {slot.hex}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        }
        if (card.kind === "tags") {
          return (
            <div key={card.id} className="rounded-xl bg-panel p-3 ring-1 ring-foreground/10">
              <div className="mb-2 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                Tags · {card.tags.length}/{TAGS_LIMIT}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {card.tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    title="Remove this tag"
                    onClick={() =>
                      update(card.id, (c) => ({
                        ...(c as TagsCard),
                        tags: toggleTag((c as TagsCard).tags, tag),
                      }))
                    }
                    className="rounded-full bg-background px-2 py-0.5 text-[11px]"
                  >
                    {sentenceCase(tag)}
                  </button>
                ))}
                {!card.tags.length && (
                  <span className="text-[11px] text-muted-foreground">No tags selected.</span>
                )}
              </div>
            </div>
          );
        }
        if (card.kind === "design") {
          const design = card as DesignCard;
          return (
            <div key={card.id} className="rounded-xl bg-panel p-3 ring-1 ring-foreground/10">
              <div className="mb-1 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                Inspiration
              </div>
              <p className="mb-1.5 truncate text-[12px] font-medium">{design.title}</p>
              <div className="flex gap-1">
                {design.palette.slice(0, 6).map((slot) => (
                  <span
                    key={slot.hex}
                    className="h-6 flex-1 rounded ring-1 ring-black/10"
                    style={{ background: slot.hex }}
                  />
                ))}
              </div>
            </div>
          );
        }
        return null;
      })}

      {draft.cards
        .filter((card): card is BriefBundleCard => card.kind === "brief")
        .map((bundle) => (
          <div key={bundle.id} className="space-y-2 rounded-xl bg-panel p-3 ring-1 ring-foreground/10">
            <div className="flex items-center justify-between text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              <span>Brief</span>
              {savedBundleIds.has(bundle.id) && <span>Saved</span>}
            </div>
            <input
              key={bundle.name}
              defaultValue={bundle.name}
              placeholder="Name this brief"
              aria-label="Brief name"
              onBlur={(event) =>
                update(bundle.id, (c) => ({ ...(c as BriefBundleCard), name: event.target.value.trim() }))
              }
              className="h-8 w-full rounded-lg bg-background px-2 text-[13px] font-semibold outline-none ring-1 ring-transparent focus:ring-foreground/20"
            />
            <p className="text-[15px] leading-snug font-semibold">
              {bundle.title ?? "No title plugged in"}
            </p>
            {bundle.palette ? (
              <div className="flex gap-1">
                {bundle.palette.slots.map((slot, index) => {
                  const armed = armedSlot?.cardId === bundle.id && armedSlot.index === index;
                  return (
                    <button
                      key={`${index}-${slot.hex}`}
                      type="button"
                      onClick={() => armSlot(bundle.id, index)}
                      aria-pressed={armed}
                      aria-label={`Edit ${SLOT_LABELS[index]} ${slot.hex}`}
                      className={cn(
                        "h-8 flex-1 rounded ring-1 ring-black/10",
                        armed && "ring-2 ring-foreground",
                      )}
                      style={{ background: slot.hex }}
                    />
                  );
                })}
              </div>
            ) : null}
            <p className="text-[11px] text-muted-foreground">
              {bundle.tags?.map(sentenceCase).join(", ") ?? "No tags plugged in"}
            </p>
            {bundle.designs.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {bundle.designs.length} inspiration{" "}
                {bundle.designs.length === 1 ? "design" : "designs"}
              </p>
            )}
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={() => onSaveBundle(bundle.id)}
            >
              <SaveIcon className="size-4" />
              {savedBundleIds.has(bundle.id) ? "Saved — save again to update" : "Save brief"}
            </Button>
          </div>
        ))}

      <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground">
        Drag-and-drop plugging is available on a wider screen.
      </p>
    </div>
  );
}
