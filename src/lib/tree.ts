import type { Edge, Node } from "@xyflow/react";
import type { Template } from "./schema";
import type { RoleColor } from "./color";
import type { FacetKey } from "./facets";
import type { SimilarHit, SimilarKind } from "./similarity";

export const BRANCH_COLORS = ["#F0812F", "#4C7DF0", "#22A06B", "#E5484D", "#9B6BE8", "#D49B0B", "#1A9FA0", "#E2559B", "#6E7F2E", "#8B5E3C"];

export const SIZES = {
  root: { w: 200, h: 64 },
  branch: { w: 200, h: 36 },
  sub: { w: 176, h: 32 },
  thumb: 64,
  gap: 6,
  x: { branch: 260, sub: 510, cluster: 730 },
};

/** label of the merged overflow branch; it cannot be turned into a single filter */
export const OTHER = "Other (more)";
export const OTHER_SUB = "Other layouts";

export interface RootData extends Record<string, unknown> {
  kind: "root";
  label: string;
  sub: string;
  image?: string;
  palette?: RoleColor[];
}
export interface BranchData extends Record<string, unknown> {
  kind: "branch";
  label: string;
  count: number;
  color: string;
  branchId: string;
  side: "left" | "right";
}
export interface SubData extends Record<string, unknown> {
  kind: "sub";
  label: string;
  structure: string;
  count: number;
  color: string;
  branchId: string;
  subId: string;
  side: "left" | "right";
}
export interface ClusterData extends Record<string, unknown> {
  kind: "cluster";
  items: Template[];
  more: number;
  color: string;
  branchId: string;
  subId: string;
  side: "left" | "right";
  cols: number;
  /** optional per-item badge, e.g. image-search match % */
  badges?: Record<string, string>;
}
export type TreeNodeData = RootData | BranchData | SubData | ClusterData;
export type TreeNode = Node<TreeNodeData>;

export interface BranchInfo {
  id: string;
  label: string;
  count: number;
  facet?: FacetKey;
  value: string;
  color: string;
  subs: { id: string; label: string; count: number; facet?: FacetKey; value: string }[];
}

export interface TreeSpec {
  root: { label: string; sub: string; image?: string; palette?: RoleColor[] };
  items: Template[];
  level1: (t: Template) => string;
  level2: (t: Template) => string;
  level1Facet?: FacetKey;
  level2Facet?: FacetKey;
  level2Label?: (v: string) => string;
  colorFor: (label: string, i: number) => string;
  maxThumbs?: number;
  maxBranches?: number;
  /** cap sub-branches per branch; the rest merge into "Other layouts" */
  maxSubs?: number;
  badges?: Record<string, string>;
}

function clusterDims(tiles: number) {
  const cols = Math.max(1, Math.min(3, tiles));
  const rows = Math.ceil(tiles / cols);
  const { thumb, gap } = SIZES;
  return { cols, w: cols * thumb + (cols - 1) * gap, h: rows * thumb + (rows - 1) * gap };
}

function groupBy<T>(list: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of list) {
    const k = key(x);
    const arr = m.get(k);
    if (arr) arr.push(x);
    else m.set(k, [x]);
  }
  return m;
}

/**
 * Lays out a two-level mind-map: root in the middle, level-1 branches split
 * left/right (balanced by height), level-2 sub-branches, then thumbnail clusters.
 */
export function buildTree(spec: TreeSpec): { nodes: TreeNode[]; edges: Edge[]; branches: BranchInfo[] } {
  const maxThumbs = spec.maxThumbs ?? 6;
  const maxBranches = spec.maxBranches ?? 9;
  const nodes: TreeNode[] = [];
  const edges: Edge[] = [];
  const { root: R, branch: B, sub: S, x: X } = SIZES;

  nodes.push({
    id: "root",
    type: "tree",
    position: { x: -R.w / 2, y: -R.h / 2 },
    initialWidth: R.w,
    initialHeight: R.h,
    data: { kind: "root", label: spec.root.label, sub: spec.root.sub, image: spec.root.image, palette: spec.root.palette },
    draggable: false,
  });

  let groups = Array.from(groupBy(spec.items, spec.level1).entries()).sort((a, b) => b[1].length - a[1].length);
  if (groups.length > maxBranches) {
    const head = groups.slice(0, maxBranches - 1);
    const rest = groups.slice(maxBranches - 1).flatMap(([, v]) => v);
    groups = [...head, [OTHER, rest]];
  }

  type Block = {
    label: string;
    items: Template[];
    color: string;
    subs: { label: string; items: Template[]; dims: ReturnType<typeof clusterDims>; tiles: number; h: number }[];
    h: number;
  };
  const SUB_GAP = 14;
  const BRANCH_GAP = 36;
  const blocks: Block[] = groups.map(([label, items], i) => {
    let subGroups = Array.from(groupBy(items, spec.level2).entries()).sort((a, b) => b[1].length - a[1].length);
    if (spec.maxSubs && subGroups.length > spec.maxSubs) {
      const head = subGroups.slice(0, spec.maxSubs - 1);
      const rest = subGroups.slice(spec.maxSubs - 1).flatMap(([, v]) => v);
      subGroups = [...head, [OTHER_SUB, rest]];
    }
    const subs = subGroups
      .map(([sl, sitems]) => {
        const tiles = Math.min(sitems.length, maxThumbs);
        const dims = clusterDims(tiles);
        return { label: sl, items: sitems, dims, tiles, h: Math.max(dims.h, S.h) };
      });
    const h = subs.reduce((a, s) => a + s.h, 0) + SUB_GAP * (subs.length - 1);
    return { label, items, color: spec.colorFor(label, i), subs, h };
  });

  // balance sides
  const left: Block[] = [];
  const right: Block[] = [];
  let lh = 0, rh = 0;
  for (const b of [...blocks].sort((a, b) => b.h - a.h)) {
    if (rh <= lh) { right.push(b); rh += b.h + BRANCH_GAP; } else { left.push(b); lh += b.h + BRANCH_GAP; }
  }
  // keep original (count) order within each side
  const order = (arr: Block[]) => arr.sort((a, b) => blocks.indexOf(a) - blocks.indexOf(b));
  order(left); order(right);

  const branches: BranchInfo[] = [];
  const place = (side: "left" | "right", arr: Block[], total: number) => {
    let y = -(total - BRANCH_GAP) / 2;
    const dir = side === "right" ? 1 : -1;
    for (const b of arr) {
      const bid = `b:${b.label}`;
      const by = y + b.h / 2;
      const bx = side === "right" ? X.branch : -X.branch - B.w;
      nodes.push({
        id: bid,
        type: "tree",
        position: { x: bx, y: by - B.h / 2 },
        initialWidth: B.w,
        initialHeight: B.h,
        data: { kind: "branch", label: b.label, count: b.items.length, color: b.color, branchId: bid, side },
        draggable: false,
      });
      edges.push({
        id: `e:root:${bid}`,
        source: "root",
        target: bid,
        sourceHandle: side === "right" ? "r" : "l",
        targetHandle: side === "right" ? "l" : "r",
        style: { stroke: b.color, strokeWidth: 2.25 },
        data: { branchId: bid },
      });
      const info: BranchInfo = { id: bid, label: b.label, count: b.items.length, facet: b.label === OTHER ? undefined : spec.level1Facet, value: b.label, color: b.color, subs: [] };
      let sy = y;
      for (const s of b.subs) {
        const sid = `s:${b.label}:${s.label}`;
        const cy = sy + s.h / 2;
        const sx = side === "right" ? X.sub : -X.sub - S.w;
        const label = s.label === OTHER_SUB ? OTHER_SUB : spec.level2Label ? spec.level2Label(s.label) : s.label;
        nodes.push({
          id: sid,
          type: "tree",
          position: { x: sx, y: cy - S.h / 2 },
          initialWidth: S.w,
          initialHeight: S.h,
          data: { kind: "sub", label, structure: s.label, count: s.items.length, color: b.color, branchId: bid, subId: sid, side },
          draggable: false,
        });
        edges.push({
          id: `e:${bid}:${sid}`,
          source: bid,
          target: sid,
          sourceHandle: side === "right" ? "r" : "l",
          targetHandle: side === "right" ? "l" : "r",
          style: { stroke: b.color, strokeWidth: 1.75 },
          data: { branchId: bid },
        });
        const cid = `c:${b.label}:${s.label}`;
        const more = s.items.length - s.tiles;
        const shown = s.items.slice(0, more > 0 ? s.tiles - 1 : s.tiles);
        const cx = side === "right" ? X.cluster : -X.cluster - s.dims.w;
        nodes.push({
          id: cid,
          type: "tree",
          position: { x: cx, y: cy - s.dims.h / 2 },
          initialWidth: s.dims.w,
          initialHeight: s.dims.h,
          data: {
            kind: "cluster",
            items: shown,
            more: more > 0 ? more + 1 : 0,
            color: b.color,
            branchId: bid,
            subId: sid,
            side,
            cols: s.dims.cols,
            badges: spec.badges,
          },
          draggable: false,
        });
        edges.push({
          id: `e:${sid}:${cid}`,
          source: sid,
          target: cid,
          sourceHandle: side === "right" ? "r" : "l",
          targetHandle: side === "right" ? "l" : "r",
          style: { stroke: b.color, strokeWidth: 1.25, strokeDasharray: "3 4" },
          data: { branchId: bid },
        });
        info.subs.push({ id: sid, label, count: s.items.length, facet: s.label === OTHER_SUB ? undefined : spec.level2Facet, value: s.label });
        sy += s.h + SUB_GAP;
      }
      branches.push(info);
      y += b.h + BRANCH_GAP;
      void dir;
    }
  };
  place("right", right, rh);
  place("left", left, lh);
  return { nodes, edges, branches };
}

/* ---------------- Similar view ---------------- */

export const SIMILAR_META: Record<SimilarKind, { label: string; color: string; pos: "tl" | "tr" | "bl" | "br" }> = {
  colors: { label: "Similar colors", color: "#F0812F", pos: "tl" },
  layout: { label: "Similar layout", color: "#4C7DF0", pos: "tr" },
  style: { label: "Similar style", color: "#9B6BE8", pos: "bl" },
  overall: { label: "Overall match", color: "#22A06B", pos: "br" },
};

export const SIM_SIZES = { center: { w: 250, h: 330 }, groupW: 3 * 92 + 2 * 12, groupH: 300, thumb: 92 };

export interface CenterData extends Record<string, unknown> {
  kind: "center";
  template: Template;
}
export interface SimilarGroupData extends Record<string, unknown> {
  kind: "similar";
  simKind: SimilarKind;
  label: string;
  color: string;
  hits: SimilarHit[];
  side: "left" | "right";
}

export function buildSimilarGraph(center: Template, groups: Record<SimilarKind, SimilarHit[]>) {
  const { center: C, groupW, groupH } = SIM_SIZES;
  const nodes: Node<CenterData | SimilarGroupData>[] = [
    { id: "center", type: "center", position: { x: -C.w / 2, y: -C.h / 2 }, initialWidth: C.w, initialHeight: C.h, data: { kind: "center", template: center }, draggable: false },
  ];
  const edges: Edge[] = [];
  const HX = C.w / 2 + 190;
  for (const kind of Object.keys(SIMILAR_META) as SimilarKind[]) {
    const m = SIMILAR_META[kind];
    const side = m.pos.endsWith("l") ? "left" : "right";
    const x = side === "left" ? -HX - groupW : HX;
    const y = m.pos.startsWith("t") ? -groupH - 30 : 30;
    const id = `g:${kind}`;
    nodes.push({ id, type: "similar", position: { x, y }, initialWidth: groupW, initialHeight: groupH, data: { kind: "similar", simKind: kind, label: m.label, color: m.color, hits: groups[kind], side }, draggable: false });
    edges.push({
      id: `e:center:${id}`,
      source: "center",
      target: id,
      sourceHandle: side === "right" ? "r" : "l",
      targetHandle: side === "right" ? "l" : "r",
      style: { stroke: m.color, strokeWidth: 2.25 },
    });
  }
  return { nodes, edges };
}
