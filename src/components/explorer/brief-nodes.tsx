"use client";
import {
  createContext,
  memo,
  useContext,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import type { Node, NodeProps } from "@xyflow/react";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  GripVerticalIcon,
  ImageIcon,
  PipetteIcon,
  PlusIcon,
  SaveIcon,
  SparklesIcon,
} from "lucide-react";
import { ThumbImage } from "./thumb-image";
import {
  SLOT_LABELS,
  TAGS_LIMIT,
  addCustomTag,
  dropColorInto,
  dragPayload,
  formatSnapshot,
  readDragPayload,
  sectionPayload,
  snapshotOfBundle,
  toggleTag,
  type ArmedSlot,
  type BriefBundleCard,
  type BriefCard,
  type BriefDraft,
  type BriefPalette,
  type DesignCard,
  type PaletteCard,
  type TagsCard,
  type TitleCard,
} from "@/lib/brief-board";
import { sentenceCase } from "@/lib/facets";
import { cn } from "@/lib/utils";

/** Data carried by every brief canvas node. */
export interface BriefNodeData extends Record<string, unknown> {
  card: BriefCard;
}
export type BriefNode = Node<BriefNodeData>;

export interface BriefEditorApi {
  /** the draft being edited, so nodes can copy whole briefs */
  draft: BriefDraft;
  copied: string | null;
  copy: (text: string, key: string) => void;
  /** id of the card the dragged card would plug into right now */
  plugTargetId: string | null;
  updateCard: (id: string, fn: (card: BriefCard) => BriefCard) => void;
  deleteCard: (id: string) => void;
  saveBundle: (id: string) => void;
  savedBundleIds: Set<string>;
  /** the palette slot currently being edited in the colour picker */
  armedSlot: ArmedSlot | null;
  /** arm a slot and open the colour picker */
  armSlot: (cardId: string, index: number) => void;
}

const BriefEditorContext = createContext<BriefEditorApi | null>(null);

export function useBriefEditor() {
  const value = useContext(BriefEditorContext);
  if (!value) throw new Error("useBriefEditor outside a brief canvas");
  return value;
}

export function BriefEditorProvider({
  value,
  children,
}: {
  value: BriefEditorApi;
  children: ReactNode;
}) {
  return <BriefEditorContext.Provider value={value}>{children}</BriefEditorContext.Provider>;
}

/* ------------------------------------------------------------------ */
/* Shared chrome                                                       */
/* ------------------------------------------------------------------ */

function CardShell({
  children,
  selected,
  className,
  accent,
  plug,
}: {
  children: ReactNode;
  selected?: boolean;
  className?: string;
  accent?: string;
  /** true while a dragged card is close enough to plug into this one */
  plug?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl bg-background shadow-sm ring-1 transition-shadow",
        selected ? "ring-2 ring-foreground/45" : "ring-1 ring-foreground/10",
        plug && "ring-2 ring-foreground/60",
        className,
      )}
      style={accent ? { borderTop: `3px solid ${accent}` } : undefined}
    >
      {children}
    </div>
  );
}

function CardGrip({
  label,
  meta,
  action,
  plug,
}: {
  label: string;
  meta?: string;
  action?: ReactNode;
  plug?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={`${label} card — drag here to move`}
      className="card-grip flex cursor-grab items-center gap-1.5 bg-panel/60 px-2 py-1.5 active:cursor-grabbing"
    >
      <GripVerticalIcon className="size-3 shrink-0 text-muted-foreground/60" aria-hidden />
      <span className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </span>
      {plug ? (
        <span className="rounded-full bg-foreground px-1.5 text-[9px] font-semibold text-background">
          release to plug
        </span>
      ) : meta ? (
        <span className="min-w-0 truncate text-[10px] text-muted-foreground/80">· {meta}</span>
      ) : null}
      <span className="nodrag ml-auto flex shrink-0 items-center gap-1">{action}</span>
    </div>
  );
}

function CopyButton({
  text,
  copyKey,
  label = "Copy",
}: {
  text: string;
  copyKey: string;
  label?: string;
}) {
  const { copy, copied } = useBriefEditor();
  const on = copied === copyKey;
  return (
    <button
      type="button"
      className="nodrag flex h-6 items-center gap-1 rounded-full px-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      onClick={() => copy(text, copyKey)}
      aria-label={label}
    >
      {on ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
      <span className="hidden sm:inline">{on ? "Copied" : label}</span>
    </button>
  );
}

/** Shown on a loose card that a drag would plug into. */
const plugOf = (plugTargetId: string | null, id: string) => plugTargetId === id;

/* ------------------------------------------------------------------ */
/* Title                                                               */
/* ------------------------------------------------------------------ */

/** Title textarea that commits on blur/Enter and follows external edits. */
function TitleField({
  value,
  commit,
  className,
}: {
  value: string;
  commit: (next: string) => void;
  className?: string;
}) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(value);
  }

  const push = () => {
    const clean = text.trim();
    if (clean && clean !== value) commit(clean);
    else if (!clean) setText(value);
  };

  return (
    <textarea
      value={text}
      rows={2}
      aria-label="Brief title"
      onChange={(event) => setText(event.target.value)}
      onBlur={push}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          push();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          setText(value);
          event.currentTarget.blur();
        }
      }}
      className={cn(
        "nodrag nowheel w-full resize-none rounded-lg bg-panel/50 px-2 py-1.5 text-[15px] leading-snug font-semibold outline-none ring-1 ring-transparent focus:ring-foreground/20",
        className,
      )}
    />
  );
}

const TitleNode = memo(function TitleNode({ data, selected }: NodeProps<BriefNode>) {
  const { updateCard, plugTargetId } = useBriefEditor();
  const card = data.card as TitleCard;

  return (
    <CardShell selected={selected} plug={plugOf(plugTargetId, card.id)}>
      <CardGrip
        label="Title"
        plug={plugOf(plugTargetId, card.id)}
        action={<CopyButton text={card.text} copyKey={`title-${card.id}`} />}
      />
      <div className="p-2.5">
        <TitleField
          value={card.text}
          commit={(text) => updateCard(card.id, (c) => ({ ...(c as TitleCard), text }))}
        />
        <p className="mt-1 px-0.5 text-[10px] text-muted-foreground">
          Drop near a palette or tags to plug in
        </p>
      </div>
    </CardShell>
  );
});

/* ------------------------------------------------------------------ */
/* Palette (loose card and bundle section share this)                  */
/* ------------------------------------------------------------------ */

/** One draggable colour row. Clicking it arms the slot for the colour picker. */
function SlotRow({
  slot,
  index,
  cardId,
  onDropSlot,
  onDropColor,
  armed,
  onArm,
}: {
  slot: { hex: string; name: string };
  index: number;
  cardId: string;
  onDropSlot: (index: number | null) => void;
  onDropColor: (index: number, payload: NonNullable<ReturnType<typeof readDragPayload>>) => void;
  armed: boolean;
  onArm: () => void;
}) {
  const { copy, copied } = useBriefEditor();
  const key = `slot-${cardId}-${index}`;
  return (
    <div
      draggable
      role="button"
      tabIndex={0}
      aria-pressed={armed}
      aria-label={`${SLOT_LABELS[index]} ${slot.hex} — edit this colour`}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/brief-color", dragPayload(slot.hex, slot.name, cardId, index));
        event.dataTransfer.effectAllowed = "copyMove";
      }}
      onDragOver={(event) => {
        // Let an inspiration drag bubble to the canvas so it can land in this brief.
        if (!event.dataTransfer.types.includes("text/brief-color")) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
        onDropSlot(index);
      }}
      onDragLeave={() => onDropSlot(null)}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes("text/brief-color")) return;
        event.preventDefault();
        event.stopPropagation();
        onDropSlot(null);
        const payload = readDragPayload(event.dataTransfer.getData("text/brief-color"));
        if (payload) onDropColor(index, payload);
      }}
      onClick={onArm}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onArm();
      }}
      className={cn(
        "nodrag group flex cursor-grab items-center gap-2 rounded-lg bg-panel/40 p-1 pr-1.5 transition-shadow active:cursor-grabbing",
        armed && "ring-2 ring-foreground/50",
      )}
      title="Click to edit this colour, or press I to sample it"
    >
      <span className="size-7 shrink-0 rounded-md ring-1 ring-black/10" style={{ background: slot.hex }} />
      <span className="min-w-0 flex-1">
        <span className="block text-[9px] font-medium tracking-[0.1em] text-muted-foreground uppercase">
          {SLOT_LABELS[index]}
        </span>
        <span className="block text-[12px] font-semibold tabular-nums">{slot.hex}</span>
      </span>
      {armed && <PipetteIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          copy(slot.hex, key);
        }}
        aria-label={`Copy ${SLOT_LABELS[index]} ${slot.hex}`}
        className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {copied === key ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
      </button>
    </div>
  );
}

function usePaletteDrops(
  cardId: string,
  onSlots: (slots: BriefPalette["slots"]) => void,
  slots: BriefPalette["slots"],
) {
  const [dropping, setDropping] = useState<number | null>(null);
  const apply = (index: number, payload: NonNullable<ReturnType<typeof readDragPayload>>) =>
    onSlots(
      dropColorInto(slots, index, { hex: payload.hex, name: payload.name }, payload.cardId, payload.index, cardId),
    );
  return { dropping, setDropping, apply };
}

const PaletteNode = memo(function PaletteNode({ data, selected }: NodeProps<BriefNode>) {
  const { updateCard, plugTargetId, armedSlot, armSlot } = useBriefEditor();
  const card = data.card as PaletteCard;
  const { dropping, setDropping, apply } = usePaletteDrops(
    card.id,
    (slots) => updateCard(card.id, (c) => ({ ...(c as PaletteCard), slots })),
    card.slots,
  );
  const allHex = card.slots.map((slot) => slot.hex).join(", ");

  return (
    <CardShell
      selected={selected}
      accent={card.slots[0]?.hex}
      plug={plugOf(plugTargetId, card.id)}
    >
      <CardGrip
        label="Palette"
        meta={card.variation ? "variation" : `${Math.round(card.anchor.share * 100)}% ${sentenceCase(card.anchor.name)}`}
        plug={plugOf(plugTargetId, card.id)}
        action={<CopyButton text={allHex} copyKey={`palette-${card.id}`} label="Copy hex" />}
      />
      <div className="space-y-1 p-2">
        {card.slots.map((slot, index) => (
          <div key={`${index}-${slot.hex}`} className={cn(dropping === index && "rounded-lg ring-2 ring-foreground/40")}>
            <SlotRow
              slot={slot}
              index={index}
              cardId={card.id}
              onDropSlot={setDropping}
              onDropColor={apply}
              armed={armedSlot?.cardId === card.id && armedSlot.index === index}
              onArm={() => armSlot(card.id, index)}
            />
          </div>
        ))}
      </div>
      <p className="px-2 pb-2 text-[10px] text-muted-foreground">
        Click a colour to edit it · drop near a title or tags to plug in
      </p>
    </CardShell>
  );
});

/* ------------------------------------------------------------------ */
/* Tags                                                                */
/* ------------------------------------------------------------------ */

function TagPills({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <>
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => onChange(toggleTag(tags, tag))}
            title="Remove this tag"
            className="nodrag flex h-6 items-center gap-1 rounded-full bg-panel px-2 text-[11px] transition-colors hover:bg-foreground hover:text-background"
          >
            {sentenceCase(tag)}
          </button>
        ))}
        {!tags.length && <span className="text-[11px] text-muted-foreground">No tags selected.</span>}
      </div>
    </>
  );
}

function TagAdder({ tags, onChange }: { tags: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const full = tags.length >= TAGS_LIMIT;

  const add = () => {
    const next = addCustomTag(tags, draft);
    if (!next) return;
    onChange(next);
    setDraft("");
  };

  return (
    <div className="flex items-center gap-1">
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            add();
          }
        }}
        placeholder={full ? "Remove one to add another" : "Add a tag"}
        aria-label="Add a tag"
        maxLength={32}
        disabled={full}
        className="nodrag h-6 min-w-0 flex-1 rounded-md bg-panel/50 px-2 text-[11px] outline-none ring-1 ring-transparent focus:ring-foreground/20 disabled:opacity-60"
      />
      <button
        type="button"
        onClick={add}
        disabled={full || !draft.trim()}
        aria-label="Add tag"
        className="grid size-6 place-items-center rounded-md bg-panel text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
      >
        <PlusIcon className="size-3" />
      </button>
    </div>
  );
}

const TagNode = memo(function TagNode({ data, selected }: NodeProps<BriefNode>) {
  const { updateCard, plugTargetId } = useBriefEditor();
  const card = data.card as TagsCard;
  const onChange = (tags: string[]) => updateCard(card.id, (c) => ({ ...(c as TagsCard), tags }));

  return (
    <CardShell selected={selected} plug={plugOf(plugTargetId, card.id)}>
      <CardGrip
        label="Tags"
        meta={`${card.tags.length}/${TAGS_LIMIT}`}
        plug={plugOf(plugTargetId, card.id)}
        action={<CopyButton text={card.tags.join(", ")} copyKey={`tags-${card.id}`} />}
      />
      <div className="space-y-1.5 p-2">
        <TagPills tags={card.tags} onChange={onChange} />
        <TagAdder tags={card.tags} onChange={onChange} />
      </div>
    </CardShell>
  );
});

/* ------------------------------------------------------------------ */
/* Inspiration design                                                  */
/* ------------------------------------------------------------------ */

/** Round expand control used wherever a design's title and colours start hidden. */
function DetailsToggle({
  open,
  onToggle,
  label,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={`${open ? "Hide" : "Show"} ${label}`}
      title={open ? `Hide ${label}` : `Show ${label}`}
      onClick={onToggle}
      className={cn(
        "nodrag grid size-6 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        open && "bg-muted text-foreground",
      )}
    >
      {open ? <ChevronUpIcon className="size-3.5" /> : <ChevronDownIcon className="size-3.5" />}
    </button>
  );
}

function DesignSwatches({ card }: { card: DesignCard }) {
  const { copy } = useBriefEditor();
  return (
    <div className="flex flex-wrap gap-1">
      {card.palette.slice(0, 6).map((slot, index) => (
        <button
          key={`${slot.hex}-${index}`}
          type="button"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData("text/brief-color", dragPayload(slot.hex, slot.name, card.id, index));
            event.dataTransfer.effectAllowed = "copy";
          }}
          onClick={() => copy(slot.hex, `design-slot-${card.id}-${index}`)}
          title={`${slot.hex} — drag onto a palette`}
          aria-label={`Copy inspiration colour ${slot.hex}`}
          className="nodrag size-5 cursor-grab rounded ring-1 ring-black/10 active:cursor-grabbing"
          style={{ background: slot.hex }}
        />
      ))}
    </div>
  );
}

const DesignNode = memo(function DesignNode({ data, selected }: NodeProps<BriefNode>) {
  const { plugTargetId } = useBriefEditor();
  const card = data.card as DesignCard;
  // The artwork is the deliverable; its name and colours only appear on request.
  const [details, setDetails] = useState(false);

  return (
    <CardShell selected={selected} plug={plugOf(plugTargetId, card.id)}>
      <CardGrip
        label="Inspiration"
        plug={plugOf(plugTargetId, card.id)}
        action={
          <>
            <DetailsToggle
              open={details}
              onToggle={() => setDetails((open) => !open)}
              label="title and colours"
            />
            {details && (
              <CopyButton
                text={card.palette.map((slot) => slot.hex).join(", ")}
                copyKey={`design-${card.id}`}
              />
            )}
          </>
        }
      />
      <div className="space-y-1.5 p-2">
        {/* object-contain keeps the whole design visible: no crop, no forced square. */}
        <div className="overflow-hidden rounded-lg bg-muted">
          <ThumbImage
            src={card.image}
            alt={card.title}
            className="max-h-[300px] w-full object-contain"
          />
        </div>
        {details && (
          <>
            <p className="line-clamp-2 text-[12px] leading-snug font-medium">{card.title}</p>
            <DesignSwatches card={card} />
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <ImageIcon className="size-2.5" /> Drag a swatch onto a palette
            </p>
          </>
        )}
      </div>
    </CardShell>
  );
});

/* ------------------------------------------------------------------ */
/* Plugged brief                                                       */
/* ------------------------------------------------------------------ */

/** A section header that can be dragged out to unplug the section. */
function SectionHeader({
  cardId,
  section,
  label,
  action,
}: {
  cardId: string;
  section: "title" | "palette" | "tags" | "design";
  label: string;
  action?: ReactNode;
}) {
  return (
    <div
      draggable
      onDragStart={(event: DragEvent) => {
        event.dataTransfer.setData("text/brief-section", sectionPayload(cardId, section));
        event.dataTransfer.effectAllowed = "move";
      }}
      title="Drag out to unplug"
      aria-label={`${label} section — drag the header out to unplug it`}
      className="nodrag flex cursor-grab items-center gap-1 px-2 pt-2 pb-1 active:cursor-grabbing"
    >
      <GripVerticalIcon className="size-2.5 shrink-0 text-muted-foreground/40" aria-hidden />
      <span className="text-[9px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </span>
      <span className="nodrag ml-auto flex shrink-0 items-center gap-1">{action}</span>
    </div>
  );
}

function BundleSection({
  cardId,
  section,
  label,
  action,
  children,
}: {
  cardId: string;
  section: "title" | "palette" | "tags" | "design";
  label: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <SectionHeader cardId={cardId} section={section} label={label} action={action} />
      {children}
    </div>
  );
}

/** One plugged-in design: thumbnail first, name and colours on request. */
function BundleDesignRow({ design }: { design: DesignCard }) {
  const [details, setDetails] = useState(false);
  return (
    <div
      className="flex items-center gap-2"
      data-testid="bundle-inspo-row"
      title={details ? undefined : design.title}
    >
      <div className="w-12 shrink-0 overflow-hidden rounded-md bg-muted">
        <ThumbImage src={design.image} alt={design.title} className="w-full object-contain" />
      </div>
      {details && (
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[11px] leading-snug font-medium">{design.title}</p>
          <div className="pt-1">
            <DesignSwatches card={design} />
          </div>
        </div>
      )}
      <DetailsToggle
        open={details}
        onToggle={() => setDetails((open) => !open)}
        label={`title and colours for ${design.title}`}
      />
    </div>
  );
}

const BundleNode = memo(function BundleNode({ data, selected }: NodeProps<BriefNode>) {
  const { draft, updateCard, saveBundle, savedBundleIds, plugTargetId, armedSlot, armSlot } =
    useBriefEditor();
  const card = data.card as BriefBundleCard;
  const [name, setName] = useState(card.name);
  const [seen, setSeen] = useState(card.name);
  if (seen !== card.name) {
    setSeen(card.name);
    setName(card.name);
  }

  const saved = savedBundleIds.has(card.id);
  const plug = plugOf(plugTargetId, card.id);
  const snapshot = snapshotOfBundle(draft.cards, card.id);
  const setPalette = (palette: BriefPalette) =>
    updateCard(card.id, (c) => ({ ...(c as BriefBundleCard), palette }));
  const { dropping, setDropping, apply } = usePaletteDrops(
    card.id,
    (slots) => {
      if (!card.palette) return;
      setPalette({ ...card.palette, slots });
    },
    card.palette?.slots ?? [],
  );

  return (
    <CardShell selected={selected} plug={plug} className="ring-foreground/25">
      <CardGrip
        label="Brief"
        plug={plug}
        meta={saved ? "saved" : undefined}
        action={
          snapshot ? (
            <CopyButton
              text={formatSnapshot(snapshot, draft.label)}
              copyKey={`bundle-${card.id}`}
              label="Copy brief"
            />
          ) : null
        }
      />

      <div className="flex-1 divide-y divide-border/60">
        {card.title !== null && (
          <BundleSection cardId={card.id} section="title" label="Title">
            <div className="px-2 pb-2">
              <TitleField
                value={card.title}
                commit={(text) => updateCard(card.id, (c) => ({ ...(c as BriefBundleCard), title: text }))}
                className="text-[13.5px]"
              />
            </div>
          </BundleSection>
        )}

        {card.palette && (
          <BundleSection
            cardId={card.id}
            section="palette"
            label="Palette"
            action={
              <CopyButton
                text={card.palette.slots.map((slot) => slot.hex).join(", ")}
                copyKey={`bundle-palette-${card.id}`}
                label="Copy hex"
              />
            }
          >
            <div className="space-y-1 px-2 pb-2">
              {card.palette.slots.map((slot, index) => (
                <div
                  key={`${index}-${slot.hex}`}
                  className={cn(dropping === index && "rounded-lg ring-2 ring-foreground/40")}
                >
                  <SlotRow
                    slot={slot}
                    index={index}
                    cardId={card.id}
                    onDropSlot={setDropping}
                    onDropColor={apply}
                    armed={armedSlot?.cardId === card.id && armedSlot.index === index}
                    onArm={() => armSlot(card.id, index)}
                  />
                </div>
              ))}
              <p className="pt-0.5 text-[9px] text-muted-foreground">
                {card.palette.variation
                  ? "Variation of this colour story"
                  : `${Math.round(card.palette.anchor.share * 100)}% ${sentenceCase(card.palette.anchor.name)}`}
              </p>
            </div>
          </BundleSection>
        )}

        {card.tags && (
          <BundleSection cardId={card.id} section="tags" label={`Tags · ${card.tags.length}/${TAGS_LIMIT}`}>
            <div className="space-y-1.5 px-2 pb-2">
              <TagPills
                tags={card.tags}
                onChange={(tags) =>
                  updateCard(card.id, (c) => ({ ...(c as BriefBundleCard), tags }))
                }
              />
              <TagAdder
                tags={card.tags}
                onChange={(tags) =>
                  updateCard(card.id, (c) => ({ ...(c as BriefBundleCard), tags }))
                }
              />
            </div>
          </BundleSection>
        )}

        {(card.title !== null || card.palette || card.tags || card.designs.length > 0) && (
          <BundleSection
            cardId={card.id}
            section="design"
            label={`Inspiration · ${card.designs.length}`}
          >
            <div className="space-y-1.5 px-2 pb-2" data-testid="bundle-inspo">
              {card.designs.map((design) => (
                <BundleDesignRow key={design.id} design={design} />
              ))}
              {!card.designs.length && (
                <p className="rounded-lg border border-dashed border-border px-2 py-3 text-center text-[10px] text-muted-foreground">
                  Drop a design here from the Inspiration panel.
                </p>
              )}
            </div>
          </BundleSection>
        )}

        {!card.title && !card.palette && !card.tags && !card.designs.length && (
          <div className="flex flex-col items-center gap-1 px-3 py-8 text-center">
            <SparklesIcon className="size-4 text-muted-foreground/60" />
            <p className="text-[11px] font-medium">Nothing plugged in yet</p>
            <p className="text-[10px] text-muted-foreground">
              Drop a title, palette or tags card on me.
            </p>
          </div>
        )}
      </div>

      <div className="space-y-1.5 border-t border-border/60 p-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => updateCard(card.id, (c) => ({ ...(c as BriefBundleCard), name: name.trim() }))}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setName(card.name);
              event.currentTarget.blur();
            }
          }}
          placeholder="Name this brief"
          aria-label="Brief name"
          className="nodrag h-7 w-full rounded-md bg-panel/50 px-2 text-[12px] font-semibold outline-none ring-1 ring-transparent focus:ring-foreground/20"
        />
        <button
          type="button"
          onClick={() => {
            // Commit the typed name first: the save reads the store, and blur alone can land
            // after the click in some browsers.
            const clean = name.trim();
            if (clean !== card.name) {
              updateCard(card.id, (c) => ({ ...(c as BriefBundleCard), name: clean }));
            }
            saveBundle(card.id);
          }}
          className="nodrag flex h-7 w-full items-center justify-center gap-1.5 rounded-lg bg-foreground text-[11px] font-semibold text-background transition-opacity hover:opacity-90"
        >
          {saved ? <CheckIcon className="size-3.5" /> : <SaveIcon className="size-3.5" />}
          {saved ? "Saved — save again to update" : "Save brief"}
        </button>
      </div>
    </CardShell>
  );
});

export const briefNodeTypes = {
  briefTitle: TitleNode,
  briefPalette: PaletteNode,
  briefTags: TagNode,
  briefDesign: DesignNode,
  briefBundle: BundleNode,
};

export const BRIEF_NODE_TYPE = {
  title: "briefTitle",
  palette: "briefPalette",
  tags: "briefTags",
  design: "briefDesign",
  brief: "briefBundle",
} as const;
