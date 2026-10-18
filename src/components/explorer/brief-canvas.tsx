"use client";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type NodeChange,
} from "@xyflow/react";
import {
  CARD_SIZE,
  INSPO_MIME,
  PLUG_RADIUS,
  addInspiration,
  designCard,
  ejectSection,
  moveCard,
  patchCard,
  plugInto,
  plugTargets,
  readInspoPayload,
  readSectionPayload,
  rectGap,
  removeCards,
  type ArmedSlot,
  type BriefCard,
  type BriefCardKind,
  type BriefDraft,
  type Rect,
} from "@/lib/brief-board";
import type { BriefStore } from "@/lib/briefs";
import { useExplorer } from "./context";
import {
  BRIEF_NODE_TYPE,
  BriefEditorProvider,
  briefNodeTypes,
  type BriefEditorApi,
  type BriefNode,
} from "./brief-nodes";

const sizeOf = (card: BriefCard) => CARD_SIZE[card.kind] ?? CARD_SIZE.brief;

/** Map a card to a React Flow node. */
function toNode(card: BriefCard): BriefNode {
  return {
    id: card.id,
    type: BRIEF_NODE_TYPE[card.kind as BriefCardKind],
    position: { x: card.x, y: card.y },
    dragHandle: ".card-grip",
    data: { card },
    style: { width: sizeOf(card).w },
  };
}

/**
 * Reconcile the node list with the draft.
 *
 * Untouched cards keep their existing node object, so React Flow never drops a node's
 * measurement (`measured`, `width`, `height`) mid-drag — rebuilding them on every
 * frame is what makes dragging flicker or blank a card out.
 */
function reconcile(prev: BriefNode[], cards: BriefCard[]): BriefNode[] {
  const prevById = new Map(prev.map((node) => [node.id, node]));
  const next = cards.map((card) => {
    const existing = prevById.get(card.id);
    if (!existing) return toNode(card);
    if (existing.data.card === card) return existing;
    return { ...existing, type: BRIEF_NODE_TYPE[card.kind as BriefCardKind], data: { card } };
  });
  // Only replace the array when something actually changed, so React Flow can bail out.
  const same =
    next.length === prev.length && next.every((node, index) => node === prev[index]);
  return same ? prev : next;
}

export interface BriefCanvasProps {
  draft: BriefDraft;
  store: BriefStore;
  /** Brief cards that already have a saved snapshot, for the "Saved" affordance. */
  savedBundleIds: Set<string>;
  /** bumped by the page to fit the viewport around newly added cards */
  fitSignal: number;
  onSaveBundle: (bundleId: string) => void;
  /** palette slot currently being edited in the colour picker */
  armedSlot: ArmedSlot | null;
  /** arm a slot and open the colour picker */
  armSlot: (cardId: string, index: number) => void;
}

function BriefCanvasInner({
  draft,
  store,
  savedBundleIds,
  fitSignal,
  onSaveBundle,
  armedSlot,
  armSlot,
}: BriefCanvasProps) {
  const rf = useReactFlow();
  const { byId } = useExplorer();
  const [nodes, setNodes] = useState<BriefNode[]>(() => draft.cards.map(toNode));
  const [copied, setCopied] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Reconcile during render (React's "adjust state when props change" pattern) instead of an
  // effect, so a store round-trip never paints one frame of stale positions.
  const [seenCards, setSeenCards] = useState(draft.cards);
  if (seenCards !== draft.cards) {
    setSeenCards(draft.cards);
    setNodes((prev) => reconcile(prev, draft.cards));
  }

  const copy = useCallback((text: string, key: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(key);
        if (copyTimer.current) clearTimeout(copyTimer.current);
        copyTimer.current = setTimeout(
          () => setCopied((current) => (current === key ? null : current)),
          1400,
        );
      })
      .catch(() => undefined);
  }, []);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const patch = useCallback(
    (next: { cards?: BriefCard[] }) => {
      store.patchDraft(draft.id, next);
    },
    [draft.id, store],
  );

  // Position, dimensions, selection and removal all flow through React Flow's own reducer.
  // Ignoring `dimensions` here is what blanks a node out while it is being dragged.
  const onNodesChange = useCallback((changes: NodeChange<BriefNode>[]) => {
    setNodes((prev) => applyNodeChanges(changes, prev));
  }, []);

  const onNodesDelete = useCallback(
    (deleted: BriefNode[]) => {
      const ids = deleted.map((node) => node.id);
      if (!ids.length) return;
      patch({ cards: removeCards(draft.cards, ids) });
    },
    [draft.cards, patch],
  );

  /* ---------------------------------------------------------------- */
  /* Plugging: everything happens on drop, never during the drag       */
  /* ---------------------------------------------------------------- */

  const [plugTarget, setPlugTarget] = useState<string | null>(null);
  // A ref too, so the drop handler never reads a stale state value.
  const plugRef = useRef<string | null>(null);
  const setPlug = useCallback((id: string | null) => {
    if (plugRef.current === id) return;
    plugRef.current = id;
    setPlugTarget(id);
  }, []);

  const onNodeDrag = useCallback(
    (_event: unknown, dragged: BriefNode) => {
      const rect = (node: BriefNode): Rect => {
        const card = node.data.card;
        const size = sizeOf(card);
        return {
          x: node.position.x,
          y: node.position.y,
          w: node.measured?.width ?? size.w,
          h: node.measured?.height ?? size.h,
        };
      };
      const self = rect(dragged);
      const cardsById = new Map(draft.cards.map((card) => [card.id, card]));
      const candidates = new Set(plugTargets(draft.cards, dragged.id).map((card) => card.id));

      let best: string | null = null;
      let bestGap = PLUG_RADIUS;
      for (const node of rf.getNodes() as BriefNode[]) {
        if (!candidates.has(node.id) || !cardsById.has(node.id)) continue;
        const gap = rectGap(self, rect(node));
        if (gap <= bestGap) {
          best = node.id;
          bestGap = gap;
        }
      }
      // Only re-render when the hovered socket actually changes: a per-frame setState here
      // is what made the canvas stutter before.
      setPlug(best);
    },
    [draft.cards, rf, setPlug],
  );

  const onNodeDragStop = useCallback(
    (_event: unknown, node: BriefNode) => {
      const target = plugRef.current;
      setPlug(null);
      if (target && target !== node.id) {
        const next = plugInto(draft.cards, node.id, target);
        if (next !== draft.cards) {
          patch({ cards: next });
          return;
        }
      }
      // Commit once, at the end of the gesture: writing on every frame is what made it stutter.
      patch({ cards: moveCard(draft.cards, node.id, node.position.x, node.position.y) });
    },
    [draft.cards, patch, setPlug],
  );

  // Dragging a section header out of a bundle drops a loose card where the pointer lands.
  // A design dragged in from the Inspiration panel lands in the brief under the pointer,
  // or as a loose inspiration card anywhere else.
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      const inspoId = readInspoPayload(event.dataTransfer.getData(INSPO_MIME));
      if (inspoId) {
        event.preventDefault();
        const targetId = plugRef.current;
        setPlug(null);
        const template = byId(inspoId);
        if (!template) return;
        const point = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const next = addInspiration(
          draft.cards,
          designCard(template, point.x, point.y),
          targetId,
          point.x,
          point.y,
        );
        if (next !== draft.cards) patch({ cards: next });
        return;
      }
      const payload = readSectionPayload(event.dataTransfer.getData("text/brief-section"));
      if (!payload) return;
      event.preventDefault();
      const point = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      patch({ cards: ejectSection(draft.cards, payload.cardId, payload.section, point.x, point.y) });
    },
    [byId, draft.cards, patch, rf, setPlug],
  );

  const onDragOver = useCallback(
    (event: React.DragEvent) => {
      const types = event.dataTransfer.types;
      if (types.includes("text/brief-section")) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        return;
      }
      if (!types.includes(INSPO_MIME)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      // Highlight the brief under the pointer so the drop target is obvious.
      const point = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      let hit: string | null = null;
      for (const node of rf.getNodes() as BriefNode[]) {
        if (node.data.card.kind !== "brief") continue;
        const size = CARD_SIZE.brief;
        const w = node.measured?.width ?? size.w;
        const h = node.measured?.height ?? size.h;
        if (
          point.x >= node.position.x &&
          point.x <= node.position.x + w &&
          point.y >= node.position.y &&
          point.y <= node.position.y + h
        ) {
          hit = node.id;
          break;
        }
      }
      setPlug(hit);
    },
    [rf, setPlug],
  );

  const onDragLeave = useCallback(
    (event: React.DragEvent) => {
      const next = event.relatedTarget as Node | null;
      if (next && event.currentTarget.contains(next)) return;
      setPlug(null);
    },
    [setPlug],
  );

  // Fit when new cards land (generate / add more) or when the draft is switched.
  const lastFit = useRef({ signal: fitSignal, draft: draft.id });
  useEffect(() => {
    const previous = lastFit.current;
    if (previous.signal === fitSignal && previous.draft === draft.id) return;
    lastFit.current = { signal: fitSignal, draft: draft.id };
    // New nodes are measured a frame after they mount, so fit once the measurements land;
    // fitting immediately would compute bounds from unmeasured (zero-height) cards.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        // Extra bottom padding keeps new cards clear of the floating generator dock.
        void rf.fitView({
          padding: { top: 0.16, left: 0.16, right: 0.16, bottom: 0.26 },
          duration: 400,
          maxZoom: 0.9,
        });
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [draft.id, fitSignal, rf]);

  const editor = useMemo<BriefEditorApi>(
    () => ({
      draft,
      copied,
      copy,
      plugTargetId: plugTarget,
      updateCard: (id, fn) => patch({ cards: patchCard(draft.cards, id, fn) }),
      deleteCard: (id) => patch({ cards: removeCards(draft.cards, [id]) }),
      saveBundle: onSaveBundle,
      savedBundleIds,
      armedSlot,
      armSlot,
    }),
    [armedSlot, armSlot, copied, copy, draft, onSaveBundle, patch, plugTarget, savedBundleIds],
  );

  return (
    <BriefEditorProvider value={editor}>
      <div
        className="h-full"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <ReactFlow
          nodes={nodes}
          edges={[]}
          nodeTypes={briefNodeTypes}
          onNodesChange={onNodesChange}
          onNodesDelete={onNodesDelete}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          fitView
          fitViewOptions={{
            padding: { top: 0.16, left: 0.16, right: 0.16, bottom: 0.26 },
            maxZoom: 0.9,
          }}
          minZoom={0.2}
          maxZoom={1.8}
          deleteKeyCode={["Backspace", "Delete"]}
          className="bg-[var(--canvas)]"
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} />
          <Controls showInteractive={false} className="max-md:!bottom-24" />
        </ReactFlow>
      </div>
    </BriefEditorProvider>
  );
}

/** Bespoke assembly canvas for a brief draft (cards, colour drags, plugging). */
export function BriefCanvas(props: BriefCanvasProps) {
  return (
    <ReactFlowProvider>
      <BriefCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
