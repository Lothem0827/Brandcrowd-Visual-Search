"use client";
import "@xyflow/react/dist/style.css";
import {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useTheme } from "next-themes";
import { ArrowLeftIcon, ChevronRightIcon, ScanSearchIcon } from "lucide-react";
import type { Template } from "@/lib/schema";
import {
  buildSimilarGraph,
  buildTree,
  BRANCH_COLORS,
  SIM_SIZES,
  SIZES,
  type BranchInfo,
  type CenterData,
  type SimilarGroupData,
  type TreeNodeData,
} from "@/lib/tree";
import { cap, STRUCTURE_LABEL, type FacetKey } from "@/lib/facets";

const FIT_TREE = {
  padding: { top: "136px", left: "270px", right: "48px", bottom: "176px" },
  maxZoom: 1.1,
  minZoom: 0.28,
} as const;
const FIT_SIM = {
  padding: { top: "134px", left: "40px", right: "40px", bottom: "170px" },
  maxZoom: 1.1,
} as const;
const ZOOM_PADDING = { top: "90px", left: "280px", right: "60px", bottom: "80px" } as const;
// Phones: don't shrink the whole tree into 375px (6px labels, 20px tiles). Keep text
// readable and tiles >= 44px, centred on the root; the rest is a swipe away.
const FIT_TREE_MOBILE = {
  padding: { top: "110px", left: "12px", right: "12px", bottom: "110px" },
  maxZoom: 1,
  minZoom: 0.6,
} as const;
const FIT_SIM_MOBILE = {
  padding: { top: "150px", left: "12px", right: "12px", bottom: "100px" },
  maxZoom: 1,
  minZoom: 0.5,
} as const;
/**
 * What to frame first on a phone: the root plus the right-hand column of branches (or the
 * similar-view center plus its right-hand groups). Labels stay readable and every branch
 * there is a tap target; the left half is one swipe away.
 */
function mobileFitNodes(nodes: Node[]): { id: string }[] {
  const pick = nodes.filter((n) => {
    const d = n.data as { kind?: string; side?: string };
    if (d.kind === "root" || d.kind === "center") return true;
    if (d.kind === "branch") return d.side === "right";
    if (d.kind === "similar") return d.side === "right";
    return false;
  });
  return (pick.length ? pick : nodes).map((n) => ({ id: n.id }));
}
const ZOOM_PADDING_MOBILE = { top: "150px", left: "12px", right: "12px", bottom: "120px" } as const;
const structureLabel = (v: string) => STRUCTURE_LABEL[v] ?? cap(v);
import { cn } from "@/lib/utils";
import { useExplorer } from "./context";
import { useBoards } from "./use-boards";
import { useMediaQuery, useIsMobile, WIDE_QUERY } from "@/lib/use-media-query";
import { LayoutIcon } from "./icons";
import { ThumbImage } from "./thumb-image";

/* ------------------------------------------------------------------ */
/* Canvas context (callbacks used inside custom nodes)                 */
/* ------------------------------------------------------------------ */

interface CanvasApi {
  onBranch: (branchId: string) => void;
  onSub: (branchId: string, subId: string) => void;
  onMore: (branchId: string, subId: string) => void;
  openTemplate: (id: string) => void;
  hoverTemplate: (t: Template | null, el?: HTMLElement, note?: string) => void;
  openDetail: () => void;
  focus: Focus;
}
interface Focus {
  branchId?: string;
  subId?: string;
}
const CanvasCtx = createContext<CanvasApi | null>(null);
const useCanvas = () => useContext(CanvasCtx)!;

const hidden = "!h-1.5 !w-1.5 !min-w-0 !border-0 !bg-transparent";
function Handles() {
  return (
    <>
      <Handle
        type="source"
        position={Position.Right}
        id="r"
        className={hidden}
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="l"
        className={hidden}
        isConnectable={false}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="l"
        className={hidden}
        isConnectable={false}
      />
      <Handle
        type="target"
        position={Position.Right}
        id="r"
        className={hidden}
        isConnectable={false}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Thumbnails                                                          */
/* ------------------------------------------------------------------ */

function Thumb({
  t,
  size,
  badge,
  note,
}: {
  t: Template;
  size: number;
  badge?: string;
  note?: string;
}) {
  const { openTemplate, hoverTemplate } = useCanvas();
  return (
    <button
      type="button"
      data-testid="thumb"
      data-template-id={t.templateId}
      aria-label={`${t.displayTitle}. Explore similar`}
      onClick={(e) => {
        e.stopPropagation();
        openTemplate(t.templateId);
      }}
      onMouseEnter={(e) => hoverTemplate(t, e.currentTarget, note)}
      onMouseLeave={() => hoverTemplate(null)}
      onFocus={(e) => hoverTemplate(t, e.currentTarget, note)}
      onBlur={() => hoverTemplate(null)}
      className="nodrag group relative shrink-0 overflow-hidden rounded-[7px] bg-muted ring-1 ring-black/5 transition-transform duration-150 hover:z-10 hover:scale-[1.08] hover:ring-2 hover:ring-foreground focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none"
      style={{ width: size, height: size }}
    >
      <ThumbImage key={t.thumbnailImage} src={t.thumbnailImage} alt="" className="size-full object-cover" />
      {badge && (
        <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 text-[9px] font-medium text-white tabular-nums">
          {badge}
        </span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Node renderers                                                      */
/* ------------------------------------------------------------------ */

const TreeNodeView = memo(function TreeNodeView({
  data,
}: NodeProps<Node<TreeNodeData>>) {
  const canvas = useCanvas();
  if (data.kind === "root") {
    return (
      <div
        className="flex items-center gap-3 rounded-2xl bg-foreground px-4 text-background"
        style={{ minWidth: SIZES.root.w, maxWidth: 340, height: SIZES.root.h }}
        data-testid="tree-root"
      >
        {data.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.image}
            alt="Uploaded image"
            className="size-11 rounded-lg object-cover ring-2 ring-background/30"
          />
        )}
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-[15px] font-semibold" title={data.label}>
            {data.label}
          </div>
          <div className="mt-0.5 font-mono text-[10.5px] tracking-tight text-background/65">
            {data.sub}
          </div>
          {data.palette && (
            <div className="mt-1 flex justify-center gap-1">
              {data.palette.map((c) => (
                <span
                  key={c.hex}
                  className="size-2.5 rounded-full ring-1 ring-background/30"
                  style={{ background: c.hex }}
                />
              ))}
            </div>
          )}
        </div>
        <Handles />
      </div>
    );
  }
  if (data.kind === "branch") {
    const active = canvas.focus.branchId === data.branchId;
    return (
      <button
        type="button"
        onClick={() => canvas.onBranch(data.branchId)}
        data-testid="branch"
        className={cn(
          "flex items-center gap-2 rounded-xl bg-panel px-3 text-[13px] font-semibold transition-colors hover:bg-muted",
          active && "ring-4",
        )}
        style={{
          width: SIZES.branch.w,
          height: SIZES.branch.h,
          ["--tw-ring-color" as string]: `${data.color}33`,
        }}
        aria-pressed={active}
        title={data.label}
      >
        {/* accessible name = visible text first ("Holidays & Seasonal 922 designs, focus branch"),
            so voice control ("click Holidays") works */}
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: data.color }}
        />
        <span className="truncate">{data.label}</span>{" "}
        <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
          {data.count}
          <span className="sr-only"> designs, focus branch</span>
        </span>
        <Handles />
      </button>
    );
  }
  if (data.kind === "sub") {
    const active = canvas.focus.subId === data.subId;
    return (
      <button
        type="button"
        onClick={() => canvas.onSub(data.branchId, data.subId)}
        className={cn(
          "flex items-center gap-2 rounded-lg bg-panel px-2.5 text-[12.5px] transition-colors hover:bg-muted",
          active && "ring-2 ring-foreground",
        )}
        style={{ width: SIZES.sub.w, height: SIZES.sub.h }}
        aria-pressed={active}
        title={data.label}
      >
        <LayoutIcon
          value={data.structure}
          className="size-[18px] shrink-0 text-muted-foreground"
        />
        <span className="truncate">{data.label}</span>{" "}
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
          {data.count}
          <span className="sr-only"> designs, focus layout group</span>
        </span>
        <Handles />
      </button>
    );
  }
  // cluster
  const { thumb, gap } = SIZES;
  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${data.cols}, ${thumb}px)`,
        gap,
        direction: data.side === "left" ? "rtl" : "ltr",
      }}
    >
      {data.items.map((t) => (
        <Thumb
          key={t.templateId}
          t={t}
          size={thumb}
          badge={data.badges?.[t.templateId]}
        />
      ))}
      {data.more > 0 && (
        <button
          type="button"
          onClick={() => canvas.onMore(data.branchId, data.subId)}
          className="nodrag grid place-items-center rounded-[7px] bg-panel text-xs font-medium transition-colors hover:bg-muted"
          style={{ width: thumb, height: thumb, color: data.color }}
          title="Search within this group"
        >
          +{data.more}
          <span className="sr-only"> more, search within this group</span>
        </button>
      )}
      <Handles />
    </div>
  );
});

const CenterNodeView = memo(function CenterNodeView({
  data,
}: NodeProps<Node<CenterData>>) {
  const { openDetail } = useCanvas();
  const t = data.template;
  return (
    <div
      className="rounded-2xl bg-panel p-3 ring-2 ring-foreground"
      style={{ width: SIM_SIZES.center.w }}
      data-testid="similar-center"
    >
      <button
        type="button"
        onClick={openDetail}
        className="nodrag block w-full overflow-hidden rounded-lg"
        aria-label="Show details"
      >
        <span className="block aspect-square w-full">
          <ThumbImage
            key={t.previewImage || t.thumbnailImage}
            src={t.previewImage || t.thumbnailImage}
            alt={t.displayTitle}
            eager
            className="aspect-square w-full bg-muted bg-cover object-cover"
            style={{ backgroundImage: `url("${t.thumbnailImage}")` }}
          />
        </span>
      </button>
      <div className="mt-2.5 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="line-clamp-2 text-[14px] leading-snug font-semibold">
            {t.name}
          </div>
          <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
            {t.industry} · {t.topic}
          </div>
        </div>
        <div className="flex shrink-0 gap-1 pb-0.5">
          {t.colors.map((c) => (
            <span
              key={c.hex + c.role}
              className="size-3.5 rounded-full ring-1 ring-foreground/20"
              style={{ background: c.hex }}
              title={`${c.role} ${c.hex}`}
            />
          ))}
        </div>
      </div>
      <Handles />
    </div>
  );
});

const SimilarNodeView = memo(function SimilarNodeView({
  data,
}: NodeProps<Node<SimilarGroupData>>) {
  const t = SIM_SIZES.thumb;
  return (
    <div
      style={{ width: SIM_SIZES.groupW }}
      data-testid={`similar-group-${data.simKind}`}
    >
      <div
        className={cn(
          "mb-2.5 flex",
          data.side === "right" ? "justify-start" : "justify-start",
        )}
      >
        <span
          className="inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold text-white"
          style={{ background: data.color }}
        >
          {data.label}
          <span className="text-white/75 tabular-nums">{data.hits.length}</span>
        </span>
      </div>
      {data.hits.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No other designs in this scope yet.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
          {data.hits.map((h) => (
            <div key={h.template.templateId} className="min-w-0">
              <Thumb
                t={h.template}
                size={t}
                note={`${Math.round(h.score * 100)}% match · ${h.reason}`}
              />
              <div className="mt-1 flex items-start gap-1 text-[10.5px] leading-tight text-muted-foreground">
                <span
                  className="mt-[3px] size-1.5 shrink-0 rounded-full"
                  style={{ background: data.color }}
                />
                <span className="line-clamp-2">{h.reason}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <Handles />
    </div>
  );
});

const nodeTypes = {
  tree: TreeNodeView,
  center: CenterNodeView,
  similar: SimilarNodeView,
};

/* ------------------------------------------------------------------ */
/* Graph building per view                                             */
/* ------------------------------------------------------------------ */

function useColorMap() {
  const { base } = useExplorer();
  return useMemo(() => {
    const m = new Map<string, string>();
    const assign = (labels: string[]) =>
      labels.forEach(
        (l, i) =>
          !m.has(l) && m.set(l, BRANCH_COLORS[i % BRANCH_COLORS.length]),
      );
    const byCount = (key: (t: Template) => string) => {
      const c = new Map<string, number>();
      base.forEach((t) => c.set(key(t), (c.get(key(t)) ?? 0) + 1));
      return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    };
    assign(byCount((t) => t.industry));
    const topics = byCount((t) => t.topic);
    topics.forEach(
      (l, i) =>
        !m.has(l) && m.set(l, BRANCH_COLORS[(i + 3) % BRANCH_COLORS.length]),
    );
    return (label: string, i: number) =>
      m.get(label) ?? BRANCH_COLORS[i % BRANCH_COLORS.length];
  }, [base]);
}

const imageLabel = (t: Template) =>
  t.imagery.type === "none"
    ? "No image"
    : t.imagery.placement
      ? `${cap(t.imagery.placement)} ${t.imagery.type}`
      : cap(t.imagery.type);

function useGraph() {
  const {
    view,
    center,
    similar,
    simScope,
    boardGroup,
    byId,
    results,
    imageScores,
    imageQuery,
    parsed,
    effective,
  } = useExplorer();
  const { boards } = useBoards();
  const colorFor = useColorMap();
  const rootQueryLabel = parsed.label;
  return useMemo(() => {
    if (view.kind === "similar" && center && similar) {
      const g = buildSimilarGraph(center, similar);
      return {
        key: `sim:${center.templateId}:${simScope}`,
        nodes: g.nodes as Node[],
        edges: g.edges,
        branches: [] as BranchInfo[],
        level1: "",
      };
    }
    if (view.kind === "board") {
      const boardId = view.boardId;
      const board = boards.find((b) => b.id === boardId);
      const items = (board?.templateIds ?? [])
        .map((id) => byId(id))
        .filter((t): t is Template => !!t);
      const byLayout = boardGroup === "layout";
      const g = buildTree({
        root: {
          label: board?.name ?? "Board",
          sub: `${items.length} saved · by ${boardGroup}`,
        },
        items,
        level1: byLayout
          ? (t) => structureLabel(t.layout.structure)
          : (t) => cap(t.style.aesthetic[0] ?? "Unstyled"),
        level2: byLayout
          ? imageLabel
          : (t) => cap(t.typography.fontStyles[0] ?? "Other"),
        level2Label: (v) => v,
        colorFor: (_l, i) => BRANCH_COLORS[i % BRANCH_COLORS.length],
        maxThumbs: 9,
      });
      return {
        key: `board:${boardId}:${boardGroup}:${items.length}`,
        nodes: g.nodes as Node[],
        edges: g.edges,
        branches: g.branches,
        level1: byLayout ? "Layout" : "Style",
      };
    }
    const industries = new Set(results.map((t) => t.industry));
    const byTopic = industries.size === 1;
    const badges = imageScores
      ? Object.fromEntries(
          results.map((t) => [
            t.templateId,
            `${Math.round((imageScores.get(t.templateId) ?? 0) * 100)}%`,
          ]),
        )
      : undefined;
    const level1Facet: FacetKey = byTopic ? "topic" : "industry";
    const groupCount = new Set(
      results.map((t) => (byTopic ? t.topic : t.industry)),
    ).size;
    const filtered =
      !!effective.color ||
      Object.values(effective.facets).some((v) => v?.length);
    const rootLabel = imageQuery
      ? "Uploaded image"
      : rootQueryLabel || (filtered ? "Filtered" : "All templates");
    const g = buildTree({
      root: {
        label: rootLabel,
        sub: `${results.length} results · ${groupCount} ${byTopic ? (groupCount === 1 ? "topic" : "topics") : groupCount === 1 ? "industry" : "industries"}`,
        image: imageQuery?.url,
        palette: imageQuery?.palette,
      },
      items: results,
      level1: byTopic ? (t) => t.topic : (t) => t.industry,
      level2: (t) => t.layout.structure,
      level1Facet,
      level2Facet: "structure",
      level2Label: structureLabel,
      colorFor,
      badges,
      maxThumbs: results.length > 80 ? 3 : 6,
      maxSubs: results.length > 80 ? 4 : undefined,
    });
    return {
      key: `search:${results.length}:${results
        .slice(0, 40)
        .map((t) => t.templateId.slice(0, 4))
        .join("")}`,
      nodes: g.nodes as Node[],
      edges: g.edges,
      branches: g.branches,
      level1: byTopic ? "Topic" : "Industry",
    };
  }, [
    view,
    center,
    similar,
    simScope,
    boards,
    boardGroup,
    byId,
    results,
    imageScores,
    imageQuery,
    rootQueryLabel,
    effective,
    colorFor,
  ]);
}

/* ------------------------------------------------------------------ */
/* Overlays                                                            */
/* ------------------------------------------------------------------ */

function Panel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "pointer-events-auto rounded-xl bg-background/95 backdrop-blur",
        className,
      )}
    >
      {children}
    </div>
  );
}

function PathPanel({
  branches,
  focus,
  level1,
  onSearchWithin,
  onReset,
}: {
  branches: BranchInfo[];
  focus: Focus;
  level1: string;
  onSearchWithin: () => void;
  onReset: () => void;
}) {
  const ex = useExplorer();
  const canHover = useMediaQuery("(hover: hover)");
  const b = branches.find((x) => x.id === focus.branchId);
  const s = b?.subs.find((x) => x.id === focus.subId);
  const rows: { k: string; v: ReactNode; dot?: string }[] = [
    {
      k: ex.view.kind === "board" ? "Board" : "Search",
      v:
        ex.view.kind === "board"
          ? "Saved designs"
          : ex.imageQuery
            ? "Uploaded image"
            : ex.parsed.label || "All templates",
    },
    {
      k: level1 || "Branch",
      v: b ? (
        `${b.label} · ${b.count}`
      ) : (
        <span className="text-muted-foreground">Click a branch to focus</span>
      ),
      dot: b?.color,
    },
    {
      k: ex.view.kind === "board" ? "Group" : "Layout",
      v: s ? (
        `${s.label} · ${s.count}`
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
    },
    {
      k: "Design",
      v: ex.hover ? (
        <span className="line-clamp-1">{ex.hover.template.name}</span>
      ) : (
        <span className="text-muted-foreground">
          {canHover ? "Hover or focus a design" : "Tap a design to explore"}
        </span>
      ),
    },
  ];
  return (
    <Panel className="w-[232px] p-3">
      <ol className="space-y-2" aria-label="Current path">
        {rows.map((r, i) => (
          <li
            key={r.k}
            className={cn("text-[12.5px]", i > 0 && "pt-2")}
          >
            <div className="flex gap-2 font-mono text-[9.5px] tracking-[0.14em] text-muted-foreground uppercase">
              <span>{String(i + 1).padStart(2, "0")}</span>
              <span>{r.k}</span>
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 pl-[22px] font-semibold [&>span:last-child]:truncate">
              {r.dot && (
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: r.dot }}
                />
              )}
              <span className="min-w-0">{r.v}</span>
            </div>
          </li>
        ))}
      </ol>
      {b && ex.view.kind === "search" && (
        <div className="mt-3 flex gap-1.5">
          <button
            type="button"
            onClick={onSearchWithin}
            className="flex h-7 flex-1 items-center justify-center gap-1 rounded-lg bg-foreground text-[11.5px] font-medium text-background"
          >
            <ScanSearchIcon className="size-3.5" /> Search within
          </button>
          <button
            type="button"
            onClick={onReset}
            className="h-7 rounded-lg bg-panel px-2 text-[11.5px] font-medium hover:bg-muted"
          >
            Show all
          </button>
        </div>
      )}
      {b && ex.view.kind === "board" && (
        <button
          type="button"
          onClick={onReset}
          className="mt-3 h-7 w-full rounded-lg bg-panel text-[11.5px] font-medium hover:bg-muted"
        >
          Show all
        </button>
      )}
    </Panel>
  );
}

function Breadcrumb() {
  const ex = useExplorer();
  const { boards } = useBoards();
  if (ex.view.kind !== "similar") return null;
  const v = ex.view;
  const originLabel =
    v.origin.kind === "board"
      ? (boards.find((b) => b.id === (v.origin as { boardId: string }).boardId)
          ?.name ?? "Board")
      : ex.imageQuery
        ? "Uploaded image"
        : ex.parsed.label || "All templates";
  const back = () => {
    if (v.trail.length > 1) ex.setView({ ...v, trail: v.trail.slice(0, -1) });
    else ex.setView(v.origin);
  };
  return (
    <Panel className="flex max-w-full min-w-0 items-center gap-1 py-1 pr-3 pl-1 text-[12.5px]">
      <button
        type="button"
        onClick={back}
        aria-label="Back"
        className="grid size-7 shrink-0 place-items-center rounded-lg bg-panel hover:bg-muted"
      >
        <ArrowLeftIcon className="size-3.5" />
      </button>
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          className="max-w-[120px] shrink truncate px-1 text-muted-foreground hover:text-foreground"
          onClick={() => ex.setView(v.origin)}
        >
          {originLabel}
        </button>
        {v.trail.map((id, i) => {
          const t = ex.byId(id);
          const last = i === v.trail.length - 1;
          return (
            <span
              key={`${id}-${i}`}
              className="flex min-w-0 items-center gap-1"
            >
              <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground" />
              <button
                type="button"
                aria-current={last ? "page" : undefined}
                onClick={() =>
                  ex.setView({ ...v, trail: v.trail.slice(0, i + 1) })
                }
                className={cn(
                  "max-w-[160px] truncate px-1",
                  last
                    ? "font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t?.name ?? "Design"}
              </button>
            </span>
          );
        })}
      </nav>
    </Panel>
  );
}

function SearchBreadcrumb() {
  const ex = useExplorer();
  if (ex.view.kind !== "search" || ex.searchPath.length === 0) return null;
  const originLabel = ex.imageQuery
    ? "Uploaded image"
    : ex.parsed.label || "All templates";
  return (
    <Panel className="flex max-w-full min-w-0 items-center gap-1 py-1 pr-3 pl-1 text-[12.5px]">
      <button
        type="button"
        onClick={ex.backOneStep}
        aria-label="Back"
        className="grid size-7 shrink-0 place-items-center rounded-lg bg-panel hover:bg-muted"
      >
        <ArrowLeftIcon className="size-3.5" />
      </button>
      <nav aria-label="Search within breadcrumb" className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          className="max-w-[120px] shrink truncate px-1 text-muted-foreground hover:text-foreground"
          onClick={() => ex.jumpToStep(-1)}
        >
          {originLabel}
        </button>
        {ex.searchPath.map((step, i) => {
          const last = i === ex.searchPath.length - 1;
          return (
            <span key={step.id} className="flex min-w-0 items-center gap-1">
              <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground" />
              <button
                type="button"
                aria-current={last ? "page" : undefined}
                onClick={() => ex.jumpToStep(i)}
                className={cn(
                  "max-w-[160px] truncate px-1",
                  last
                    ? "font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {step.label}
              </button>
            </span>
          );
        })}
      </nav>
    </Panel>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
  className?: string;
}) {
  return (
    <Panel className={cn("flex p-1", className)}>
      <div role="radiogroup" aria-label={label} className="flex">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex h-8 items-center gap-2 rounded-lg px-3.5 text-[13px] font-medium transition-colors",
              value === o.value
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Panel>
  );
}

function HoverTooltip() {
  const { hover } = useExplorer();
  if (!hover) return null;
  const r = hover.rect;
  const below = r.top < 140;
  const half = 145;
  const left = Math.min(
    Math.max(r.left + r.width / 2, half + 8),
    window.innerWidth - half - 8,
  );
  const style = below ? { left, top: r.bottom + 8 } : { left, top: r.top - 8 };
  return (
    <div
      role="tooltip"
      className={cn(
        "pointer-events-none fixed z-50 w-max max-w-[280px] -translate-x-1/2 rounded-lg bg-[#1d1d1f] px-3 py-2 text-white dark:bg-[#f2f2f2] dark:text-[#111]",
        !below && "-translate-y-full",
      )}
      style={style}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0">
          <div className="text-[12.5px] leading-snug font-semibold">
            {hover.template.displayTitle}
          </div>
          <div className="mt-0.5 text-[11px] opacity-70">
            {hover.note ?? "Click to explore similar"}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          {hover.template.colors.map((c) => (
            <span
              key={c.hex + c.role}
              className="size-3 rounded-full ring-1 ring-white/40"
              style={{ background: c.hex }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Canvas                                                              */
/* ------------------------------------------------------------------ */

function CanvasInner() {
  const ex = useExplorer();
  const { resolvedTheme } = useTheme();
  const graph = useGraph();
  const rf = useReactFlow();
  const isMobile = useIsMobile();
  const wide = useMediaQuery(WIDE_QUERY);
  const fitTree = isMobile ? FIT_TREE_MOBILE : FIT_TREE;
  const fitSim = isMobile ? FIT_SIM_MOBILE : FIT_SIM;
  const fitRef = useRef({ fitTree, fitSim, mobile: isMobile });
  useEffect(() => {
    fitRef.current = { fitTree, fitSim, mobile: isMobile };
  }, [fitTree, fitSim, isMobile]);
  const [focus, setFocus] = useState<Focus>({});
  const [ready, setReady] = useState(false);
  const lastKey = useRef("");

  const readyRef = useRef(false);
  useEffect(() => {
    if (lastKey.current === graph.key) return;
    lastKey.current = graph.key;
    setFocus({});
    const first = !readyRef.current;
    setTimeout(
      () => {
        const sim = graph.key.startsWith("sim:");
        void rf.fitView({
          ...(sim ? fitRef.current.fitSim : fitRef.current.fitTree),
          ...(fitRef.current.mobile ? { nodes: mobileFitNodes(graph.nodes) } : {}),
          duration: first ? 0 : 450,
        });
        readyRef.current = true;
        setReady(true);
      },
      first ? 60 : 30,
    );
  }, [graph.key, graph.nodes, rf]);

  const { nodes, edges } = useMemo(() => {
    const inFocus = (n: Node) => {
      if (!focus.branchId || n.id === "root") return true;
      const d = n.data as { branchId?: string; subId?: string };
      if (d.branchId !== focus.branchId) return false;
      if (focus.subId && d.subId && d.subId !== focus.subId) return false;
      return true;
    };
    const ns = graph.nodes.map((n) => ({
      ...n,
      className: inFocus(n) ? undefined : "is-dim",
    }));
    const es: Edge[] = graph.edges.map((e) => {
      const d = e.data as { branchId?: string } | undefined;
      const dim =
        !!focus.branchId &&
        (d?.branchId !== focus.branchId ||
          (!!focus.subId &&
            e.source !== "root" &&
            !e.id.includes(focus.subId)));
      return { ...e, className: dim ? "is-dim" : undefined };
    });
    return { nodes: ns, edges: es };
  }, [graph, focus]);

  const zoomTo = (ids: string[]) =>
    requestAnimationFrame(() =>
      rf.fitView({
        nodes: ids.map((id) => ({ id })),
        padding: isMobile ? ZOOM_PADDING_MOBILE : ZOOM_PADDING,
        duration: 500,
        maxZoom: 1.4,
      }),
    );

  const api: CanvasApi = {
    focus,
    onBranch: (branchId) => {
      if (focus.branchId === branchId && !focus.subId) {
        setFocus({});
        void rf.fitView({ ...fitTree, duration: 450 });
        return;
      }
      setFocus({ branchId });
      zoomTo(
        graph.nodes
          .filter(
            (n) => (n.data as { branchId?: string }).branchId === branchId,
          )
          .map((n) => n.id),
      );
    },
    onSub: (branchId, subId) => {
      setFocus({ branchId, subId });
      zoomTo(
        graph.nodes
          .filter((n) => (n.data as { subId?: string }).subId === subId)
          .map((n) => n.id),
      );
    },
    onMore: (branchId, subId) => {
      const b = graph.branches.find((x) => x.id === branchId);
      const s = b?.subs.find((x) => x.id === subId);
      if (ex.view.kind === "search" && b?.facet) {
        ex.searchWithin({
          label: s ? `${b.label} · ${s.label}` : b.label,
          facets: {
            [b.facet]: [b.value],
            ...(s?.facet ? { [s.facet]: [s.value] } : {}),
          },
        });
      } else {
        setFocus({ branchId, subId });
      }
    },
    openTemplate: ex.openTemplate,
    hoverTemplate: (t, el, note) =>
      ex.setHover(
        t && el
          ? { template: t, rect: el.getBoundingClientRect(), note }
          : null,
      ),
    openDetail: () => ex.setDetailOpen(true),
  };

  const searchWithin = () => {
    const b = graph.branches.find((x) => x.id === focus.branchId);
    if (!b?.facet) return;
    const s = b.subs.find((x) => x.id === focus.subId);
    ex.searchWithin({
      label: s ? `${b.label} · ${s.label}` : b.label,
      facets: {
        [b.facet]: [b.value],
        ...(s?.facet ? { [s.facet]: [s.value] } : {}),
      },
    });
  };

  const indCount = ex.center
    ? ex.base.filter((t) => t.industry === ex.center!.industry).length - 1
    : 0;
  const empty = graph.nodes.length <= 1;

  const scopeControls = (
    <>
      {ex.view.kind === "similar" && ex.center && (
        <>
          <Segmented
            className="p-0.5"
            label="Similar scope"
            value={ex.simScope}
            onChange={ex.setSimScope}
            options={[
              {
                value: "industry",
                label: (
                  <>
                    In {ex.center.industry}{" "}
                    <span className="font-mono text-[11px] opacity-60">{indCount}</span>
                  </>
                ),
              },
              {
                value: "all",
                label: (
                  <>
                    All categories{" "}
                    <span className="font-mono text-[11px] opacity-60">{ex.base.length - 1}</span>
                  </>
                ),
              },
            ]}
          />
          <div className="text-xs text-muted-foreground max-md:hidden">
            Exploring similar to <b className="text-foreground">{ex.center.name}</b>
          </div>
        </>
      )}
      {ex.view.kind === "board" && (
        <Segmented
          className="p-0.5"
          label="Group board by"
          value={ex.boardGroup}
          onChange={ex.setBoardGroup}
          options={[
            { value: "layout", label: "By layout" },
            { value: "style", label: "By style" },
          ]}
        />
      )}
    </>
  );

  return (
    <CanvasCtx.Provider value={api}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        edgesFocusable={false}
        minZoom={0.08}
        maxZoom={2.5}
        onPaneClick={() => {
          if (focus.branchId) {
            setFocus({});
            void rf.fitView({ ...fitTree, duration: 450 });
          }
        }}
        onMoveStart={() => ex.hover && ex.setHover(null)}
        proOptions={{ hideAttribution: true }}
        fitView
        fitViewOptions={fitTree}
        className={cn(
          "transition-opacity duration-300",
          ready ? "opacity-100" : "opacity-0",
        )}
        aria-label="Template taxonomy tree"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={18}
          size={1.4}
          color="var(--canvas-dot)"
        />
        {wide && (
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          nodeColor={(n) => {
            const d = n.data as { color?: string; kind?: string };
            return d.kind === "root" || d.kind === "center"
              ? "#111"
              : (d.color ?? "#999");
          }}
          maskColor="rgb(120 120 120 / 0.12)"
          // 57 centers the 96px-tall map on the search dock: dock is 170px tall at bottom-5,
          // so its center sits 20 + 170 / 2 = 105px from the bottom => 105 - 96 / 2 = 57.
          style={{ width: 150, height: 96, marginBottom: 57 }}
        />
        )}
        {wide ? (
          <Controls
            position="bottom-right"
            showInteractive={false}
            // 66 = 57 (the map's own offset) + (96 - 78) / 2 so the 78px-tall control stack is
            // centered vertically against the 96px-tall minimap instead of bottom-aligned to it.
            style={{ marginRight: 175, marginBottom: 66 }}
          />
        ) : (
          // Below 1280px (incl. 125%+ browser zoom) the bottom-right corner collides with the
          // centered search dock, so the controls move under the top bar and the minimap hides.
          <Controls position="top-right" showInteractive={false} style={{ marginTop: 64 }} />
        )}
      </ReactFlow>

      {/* overlays */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute top-4 left-4 flex flex-col items-start gap-2 max-md:top-16 max-md:right-14 max-md:left-3 max-md:!max-w-none"
          style={{ maxWidth: "calc(50% - 200px)" }}
        >
          {ex.view.kind === "similar" ? (
            <Breadcrumb />
          ) : (
            <>
              <SearchBreadcrumb />
              {/* on phones the path panel only appears once a branch is focused */}
              {(!isMobile || focus.branchId) && (
                <PathPanel
                  branches={graph.branches}
                  focus={focus}
                  level1={graph.level1}
                  onSearchWithin={searchWithin}
                  onReset={() => api.onBranch(focus.branchId!)}
                />
              )}
            </>
          )}
          {ex.view.kind === "board" && (
            <Panel className="w-[232px] p-1">
              <button
                type="button"
                onClick={() => ex.setView({ kind: "search" })}
                className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[12.5px] font-medium hover:bg-muted"
              >
                <ArrowLeftIcon className="size-3.5" /> Back to search
              </button>
            </Panel>
          )}
          {isMobile && scopeControls}
        </div>
        {!isMobile && (
          <div className="absolute top-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5">
            {scopeControls}
          </div>
        )}
        {empty && (
          <div className="absolute inset-0 grid place-items-center pb-44">
            <Panel className="max-w-sm p-5 text-center">
              <div className="text-sm font-semibold">
                {ex.view.kind === "board"
                  ? "This board is empty"
                  : ex.unsearchable
                    ? "We couldn't search for that"
                    : "No templates match"}
              </div>
              <p className="mt-1 text-xs break-words text-muted-foreground">
                {ex.view.kind === "board"
                  ? "Open any design and press Save to add it here."
                  : ex.unsearchable
                    ? "Search understands English keywords. Try words like “bold”, “coffee” or “minimalist”."
                    : "Remove a chip or clear the filters to widen the search."}
              </p>
              {ex.view.kind !== "board" && (
                <button
                  type="button"
                  onClick={ex.clearAll}
                  className="mt-3 h-8 rounded-lg bg-foreground px-3 text-xs font-medium text-background"
                >
                  Clear all
                </button>
              )}
            </Panel>
          </div>
        )}
      </div>
      <HoverTooltip />
    </CanvasCtx.Provider>
  );
}

export function TreeCanvas() {
  return (
    <ReactFlowProvider>
      <div className="absolute inset-0 bg-canvas">
        <CanvasInner />
      </div>
    </ReactFlowProvider>
  );
}
