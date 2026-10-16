import type { Template } from "./schema";
import { paletteSimilarity, type RoleColor } from "./color";
import { STRUCTURE_LABEL } from "./facets";
import { lookBuckets, type ImageFeatures } from "./image-features";

/** Pure similarity functions. All scores are in 0..1. */

export function jaccard(a: readonly string[], b: readonly string[]): number {
  if (!a.length && !b.length) return 1;
  const A = new Set(a.map((x) => x.toLowerCase()));
  const B = new Set(b.map((x) => x.toLowerCase()));
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

const eq = (a: string | null | undefined, b: string | null | undefined) => (a && b ? (a === b ? 1 : 0) : a === b ? 0.5 : 0);

export function colorSimilarity(a: Pick<Template, "colors">, b: Pick<Template, "colors">): number {
  return paletteSimilarity(a.colors, b.colors);
}

export const LAYOUT_WEIGHTS = {
  structure: 0.32,
  alignment: 0.14,
  imageType: 0.14,
  placement: 0.14,
  textDensity: 0.1,
  balance: 0.08,
  whitespace: 0.08,
};

export function layoutSimilarity(a: Template, b: Template): number {
  const w = LAYOUT_WEIGHTS;
  return (
    w.structure * eq(a.layout.structure, b.layout.structure) +
    w.alignment * eq(a.layout.alignment, b.layout.alignment) +
    w.imageType * eq(a.imagery.type, b.imagery.type) +
    w.placement * (a.imagery.type === "none" && b.imagery.type === "none" ? 1 : eq(a.imagery.placement, b.imagery.placement)) +
    w.textDensity * eq(a.layout.textDensity, b.layout.textDensity) +
    w.balance * eq(a.layout.balance, b.layout.balance) +
    w.whitespace * eq(a.layout.whitespace, b.layout.whitespace)
  );
}

export const STYLE_WEIGHTS = { aesthetic: 0.36, mood: 0.18, typography: 0.22, colorScheme: 0.16, texture: 0.08 };

export function styleSimilarity(a: Template, b: Template): number {
  const w = STYLE_WEIGHTS;
  const typo = 0.75 * jaccard(a.typography.fontStyles, b.typography.fontStyles) + 0.25 * eq(a.typography.case, b.typography.case);
  return (
    w.aesthetic * jaccard(a.style.aesthetic, b.style.aesthetic) +
    w.mood * jaccard(a.style.mood, b.style.mood) +
    w.typography * typo +
    w.colorScheme * jaccard(a.style.colorScheme, b.style.colorScheme) +
    w.texture * eq(a.style.texture, b.style.texture)
  );
}

export const OVERALL_WEIGHTS = { color: 0.3, layout: 0.3, style: 0.32, tags: 0.08 };

export function overallSimilarity(a: Template, b: Template): number {
  const w = OVERALL_WEIGHTS;
  return (
    w.color * colorSimilarity(a, b) +
    w.layout * layoutSimilarity(a, b) +
    w.style * styleSimilarity(a, b) +
    w.tags * jaccard(a.tags, b.tags)
  );
}

export type SimilarKind = "colors" | "layout" | "style" | "overall";

export interface SimilarHit {
  template: Template;
  score: number;
  reason: string;
}

const short = (s: string) => (STRUCTURE_LABEL[s] ?? s).toLowerCase();
const PLACEMENT_ADJ: Record<string, string> = { frame: "framed", background: "background", cutout: "cutout", "full-bleed": "full-bleed", collage: "collage" };

/** Short human reason for why `b` is similar to `a`. */
export function reasonFor(kind: SimilarKind, a: Template, b: Template): string {
  if (kind === "colors") {
    const names = b.colors.slice(0, 2).map((c) => c.name).filter(Boolean);
    return Array.from(new Set(names)).join(" + ") || "similar palette";
  }
  if (kind === "layout") {
    const parts = [short(b.layout.structure)];
    if (b.imagery.type === "none") parts.push("no image");
    else if (b.imagery.placement && !(b.imagery.placement === "full-bleed" && b.layout.structure === "full-bleed photo")) {
      parts.push(`${PLACEMENT_ADJ[b.imagery.placement] ?? b.imagery.placement} ${b.imagery.type}`);
    }
    if (b.layout.alignment && b.layout.alignment === a.layout.alignment) parts.push(`${b.layout.alignment}-aligned`);
    return parts.slice(0, 2).join(", ");
  }
  if (kind === "style") {
    const shared = b.style.aesthetic.filter((x) => a.style.aesthetic.includes(x));
    const font = b.typography.fontStyles.find((x) => a.typography.fontStyles.includes(x));
    const parts = [...shared.slice(0, 2), font].filter(Boolean) as string[];
    return parts.length ? parts.join(" · ") : b.style.aesthetic.slice(0, 2).join(" · ") || "similar style";
  }
  const scores: [string, number][] = [
    [b.colors[0]?.name ? `${b.colors[0].name} palette` : "palette", colorSimilarity(a, b)],
    [short(b.layout.structure), layoutSimilarity(a, b)],
    [b.style.aesthetic[0] ?? "style", styleSimilarity(a, b)],
  ];
  return scores
    .sort((x, y) => y[1] - x[1])
    .slice(0, 2)
    .map((x) => x[0])
    .join(", ");
}

const SCORERS: Record<SimilarKind, (a: Template, b: Template) => number> = {
  colors: colorSimilarity,
  layout: layoutSimilarity,
  style: styleSimilarity,
  overall: overallSimilarity,
};

export function similarityScore(kind: SimilarKind, a: Template, b: Template) {
  return SCORERS[kind](a, b);
}

/** Top-n most similar candidates (target excluded). Ties broken by overall score, then id for stability. */
export function findSimilar(target: Template, candidates: Template[], kind: SimilarKind, n = 6, exclude?: Set<string>): SimilarHit[] {
  return candidates
    .filter((c) => c.templateId !== target.templateId && !exclude?.has(c.templateId))
    .map((c) => ({ c, s: SCORERS[kind](target, c), o: kind === "overall" ? 0 : overallSimilarity(target, c) }))
    .sort((x, y) => y.s - x.s || y.o - x.o || x.c.templateId.localeCompare(y.c.templateId))
    .slice(0, n)
    .map(({ c, s }) => ({ template: c, score: s, reason: reasonFor(kind, target, c) }));
}

/** Fixed priority used to keep a design from appearing in more than one similar row. */
const SIMILAR_PRIORITY: SimilarKind[] = ["overall", "colors", "layout", "style"];

/**
 * The four similar groups, deduped so a design shows in only its strongest row
 * (resolved in `SIMILAR_PRIORITY` order).
 */
export function findAllSimilar(target: Template, candidates: Template[], n = 6): Record<SimilarKind, SimilarHit[]> {
  const used = new Set<string>();
  const out = {} as Record<SimilarKind, SimilarHit[]>;
  for (const kind of SIMILAR_PRIORITY) {
    out[kind] = findSimilar(target, candidates, kind, n, used);
    for (const h of out[kind]) used.add(h.template.templateId);
  }
  return out;
}

/** Full flat ranking by overall similarity (target excluded), most similar first. */
export function rankByOverall(target: Template, candidates: Template[]): { template: Template; score: number }[] {
  return candidates
    .filter((c) => c.templateId !== target.templateId)
    .map((c) => ({ template: c, score: overallSimilarity(target, c) }))
    .sort((a, b) => b.score - a.score || a.template.templateId.localeCompare(b.template.templateId));
}

/** How well an uploaded image's look (bucketed) matches a template's structural metadata. */
export function imageLookSimilarity(features: ImageFeatures, t: Template): number {
  const b = lookBuckets(features);
  const eq = (a: string, x: string | null | undefined) => (x && a === x ? 1 : 0);
  const typeScore =
    b.imageType === t.imagery.type ? 1 : b.imageType === "none" || t.imagery.type === "none" ? 0.25 : 0.35;
  return (
    0.4 * typeScore +
    0.25 * eq(b.whitespace, t.layout.whitespace) +
    0.2 * eq(b.textDensity, t.layout.textDensity) +
    0.15 * eq(b.balance, t.layout.balance)
  );
}

/** Rank templates by a blend of palette similarity and look (layout/imagery) similarity. */
export function rankByImage(
  palette: RoleColor[],
  features: ImageFeatures,
  candidates: Template[],
): { template: Template; score: number }[] {
  return candidates
    .map((t) => ({ template: t, score: 0.6 * paletteSimilarity(palette, t.colors) + 0.4 * imageLookSimilarity(features, t) }))
    .sort((a, b) => b.score - a.score || a.template.templateId.localeCompare(b.template.templateId));
}

/** Rank templates by palette similarity to an arbitrary palette (kept for tests/back-compat). */
export function rankByPalette(palette: RoleColor[], candidates: Template[]): { template: Template; score: number }[] {
  return candidates
    .map((t) => ({ template: t, score: paletteSimilarity(palette, t.colors) }))
    .sort((a, b) => b.score - a.score || a.template.templateId.localeCompare(b.template.templateId));
}
