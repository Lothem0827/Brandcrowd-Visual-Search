import type { Template } from "./schema";
import { VOCAB } from "./vocab";
import { paletteMatchesColors, type ColorMatchMode, normalizeHex } from "./color";

export type FacetKey =
  | "industry"
  | "topic"
  | "contentType"
  | "aesthetic"
  | "mood"
  | "colorScheme"
  | "texture"
  | "colorName"
  | "fontStyle"
  | "case"
  | "effects"
  | "structure"
  | "alignment"
  | "balance"
  | "whitespace"
  | "textDensity"
  | "imageType"
  | "placement"
  | "frameShape"
  | "illustrationStyle"
  | "elements"
  | "contains"
  | "tag";

export interface FacetDef {
  key: FacetKey;
  label: string;
  /** values from the controlled vocab that should always be listed */
  vocab?: readonly string[];
  get: (t: Template) => string[];
  /** human label for a value */
  display?: (v: string) => string;
  /** parse words from the search box into this facet */
  parse?: boolean;
}

const one = (v: string | null | undefined) => (v ? [v] : []);

export const CONTAINS_VALUES = ["cta", "offer", "website", "phone", "email", "address", "social", "date", "price"] as const;
const CONTAINS_LABEL: Record<string, string> = {
  cta: "Call to action",
  offer: "Price or offer",
  website: "Website",
  phone: "Phone",
  email: "Email",
  address: "Address",
  social: "Social handle",
  date: "Date",
  price: "Price",
};

const IMAGE_TYPE_LABEL: Record<string, string> = { photo: "Photo", illustration: "Illustration", none: "No image" };
const PLACEMENT_LABEL: Record<string, string> = {
  frame: "Framed",
  background: "Background",
  cutout: "Cutout",
  "full-bleed": "Full-bleed",
  collage: "Collage",
};

export const STRUCTURE_LABEL: Record<string, string> = {
  "centered stack": "Centered stack",
  "centered text block": "Centered text",
  split: "Split",
  "text top image bottom": "Text over image",
  "image top text bottom": "Image over text",
  "full-bleed photo": "Full-bleed photo",
  "frame/border": "Frame / border",
  grid: "Grid",
  collage: "Collage",
};

export const cap = (s: string) => (s === "y2k" ? "Y2K" : s.charAt(0).toUpperCase() + s.slice(1));

/** Tokens that stay uppercase even when the dataset stores them in lower case. */
const ACRONYMS = new Set(["y2k", "diy", "seo", "ui", "ux"]);

/** Words that stay lower-case inside a title unless they lead or end it. */
const TITLE_MINOR = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "for",
  "from",
  "in",
  "into",
  "nor",
  "of",
  "on",
  "onto",
  "or",
  "over",
  "per",
  "the",
  "to",
  "up",
  "via",
  "with",
  "vs",
]);

/**
 * Title Case for crumb and tree-node labels. Display only — the raw label keeps driving state
 * and facet values, so searches and filters stay identical to the data.
 * e.g. "full-bleed photo" -> "Full-Bleed Photo", "y2k poster" -> "Y2K Poster",
 * "Back to School" -> "Back to School" (the trailing "School" is a title word, "to" is minor).
 */
export function titleCase(s: string): string {
  const words = s.split(/\s+/);
  return words
    .map((w, i) => {
      if (!/[A-Za-z]/.test(w)) return w; // numbers, "&", "·"
      const lower = w.toLowerCase();
      // Acronyms and tokens the data already shrank from shouting keep their caps.
      if (ACRONYMS.has(lower) || w === w.toUpperCase()) return w.toUpperCase();
      if (i > 0 && i < words.length - 1 && TITLE_MINOR.has(lower)) return lower;
      // Each hyphenated part is its own word: "full-bleed" -> "Full-Bleed".
      return lower
        .split("-")
        .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : p))
        .join("-");
    })
    .join(" ");
}

/**
 * Sentence case for chip labels: lower-case everything and capitalise the first letter, while
 * keeping tokens that are already all-caps (or known acronyms) uppercase. Display only — the raw
 * value must keep driving state, so searches and facet values stay identical to the data.
 * e.g. "Construction Services" -> "Construction services", "Y2K" -> "Y2K", "y2k poster" -> "Y2K poster".
 */
export function sentenceCase(s: string): string {
  const lower = s.toLowerCase();
  const out = lower.charAt(0).toUpperCase() + lower.slice(1);
  // A whole all-caps label is shouting, not an acronym: only known acronyms survive it.
  const wholeCaps = s === s.toUpperCase();
  const caps = new Set(
    s
      .split(/\s+/)
      .filter(
        (w) =>
          w.length > 1 &&
          /[A-Za-z]/.test(w) &&
          (ACRONYMS.has(w.toLowerCase()) || (!wholeCaps && w === w.toUpperCase())),
      )
      .map((w) => w.toUpperCase()),
  );
  if (!caps.size) return out;
  return out.replace(/\S+/g, (w) =>
    caps.has(w.toUpperCase()) ? w.toUpperCase() : w,
  );
}

export const FACETS: FacetDef[] = [
  { key: "industry", label: "Industry", get: (t) => [t.industry], parse: true },
  { key: "topic", label: "Topic", get: (t) => [t.topic], parse: true },
  { key: "aesthetic", label: "Style", vocab: VOCAB.aesthetic, get: (t) => t.style.aesthetic, display: cap, parse: true },
  { key: "contentType", label: "Content type", vocab: VOCAB.contentType, get: (t) => [t.content.type], display: cap, parse: true },
  { key: "mood", label: "Mood", vocab: VOCAB.mood, get: (t) => t.style.mood, display: cap, parse: true },
  { key: "colorScheme", label: "Color scheme", vocab: VOCAB.colorScheme, get: (t) => t.style.colorScheme, display: cap, parse: true },
  { key: "texture", label: "Texture", vocab: VOCAB.texture, get: (t) => one(t.style.texture), display: cap, parse: true },
  { key: "colorName", label: "Color", get: (t) => Array.from(new Set(t.colors.map((c) => c.name.toLowerCase()).filter(Boolean))), display: cap, parse: true },
  { key: "fontStyle", label: "Font", vocab: VOCAB.fontStyle, get: (t) => t.typography.fontStyles, display: cap, parse: true },
  { key: "case", label: "Case", vocab: VOCAB.case, get: (t) => one(t.typography.case), display: cap },
  { key: "effects", label: "Text effect", vocab: VOCAB.effects, get: (t) => t.typography.effects, display: cap, parse: true },
  { key: "structure", label: "Layout", vocab: VOCAB.structure, get: (t) => [t.layout.structure], display: (v) => STRUCTURE_LABEL[v] ?? cap(v), parse: true },
  { key: "alignment", label: "Alignment", vocab: VOCAB.alignment, get: (t) => [t.layout.alignment], display: cap },
  { key: "balance", label: "Balance", vocab: VOCAB.balance, get: (t) => one(t.layout.balance), display: cap },
  { key: "whitespace", label: "Whitespace", vocab: VOCAB.whitespace, get: (t) => one(t.layout.whitespace), display: cap },
  { key: "textDensity", label: "Text amount", vocab: VOCAB.textDensity, get: (t) => one(t.layout.textDensity), display: cap },
  { key: "imageType", label: "Image", vocab: VOCAB.imageType, get: (t) => [t.imagery.type], display: (v) => IMAGE_TYPE_LABEL[v] ?? cap(v), parse: true },
  { key: "placement", label: "Placement", vocab: VOCAB.placement, get: (t) => one(t.imagery.placement), display: (v) => PLACEMENT_LABEL[v] ?? cap(v), parse: true },
  { key: "frameShape", label: "Frame shape", vocab: VOCAB.frameShape, get: (t) => one(t.imagery.frameShape), display: cap },
  { key: "illustrationStyle", label: "Illustration style", vocab: VOCAB.illustrationStyle, get: (t) => one(t.imagery.illustrationStyle), display: cap },
  { key: "elements", label: "Element", get: (t) => t.elements.map((e) => e.toLowerCase()), display: cap },
  {
    key: "contains",
    label: "Contains",
    vocab: CONTAINS_VALUES,
    get: (t) => {
      const out: string[] = [];
      if (t.content.cta) out.push("cta");
      if (t.content.offer) out.push("offer");
      for (const p of t.content.placeholders) out.push(p === "social handle" ? "social" : p);
      return Array.from(new Set(out));
    },
    display: (v) => CONTAINS_LABEL[v] ?? cap(v),
  },
  // Tags are parseable too: a free word that matches a tag is usually a broader,
  // more useful interpretation than a narrow topic of the same name (see query.ts).
  { key: "tag", label: "Tag", get: (t) => t.tags.map((x) => x.toLowerCase()), display: (v) => v, parse: true },
];

export const FACET_MAP = Object.fromEntries(FACETS.map((f) => [f.key, f])) as Record<FacetKey, FacetDef>;

export function displayValue(key: FacetKey, v: string) {
  const f = FACET_MAP[key];
  return f.display ? f.display(v) : v;
}

export type FacetSelection = Partial<Record<FacetKey, string[]>>;

export interface ColorFilter {
  /** one or more picked hexes; a template matches if ANY of them matches (OR) */
  colors: string[];
  mode: ColorMatchMode;
}

export interface FilterState {
  facets: FacetSelection;
  color: ColorFilter | null;
}

export const EMPTY_FILTERS: FilterState = { facets: {}, color: null };

/** OKLab distance below which a palette colour counts as matching the colour filter. */
export const COLOR_MATCH_THRESHOLD = 0.13;

export function mergeSelections(a: FacetSelection, b: FacetSelection): FacetSelection {
  const out: FacetSelection = { ...a };
  for (const [k, vs] of Object.entries(b) as [FacetKey, string[]][]) {
    out[k] = Array.from(new Set([...(out[k] ?? []), ...vs]));
  }
  return out;
}

/** Remove the values in `b` from the facet selection of `f` (inverse of mergeSelections). */
export function removeSelections(f: FilterState, b: FacetSelection): FilterState {
  const facets: FacetSelection = { ...f.facets };
  for (const [k, vs] of Object.entries(b) as [FacetKey, string[]][]) {
    const next = (facets[k] ?? []).filter((v) => !vs.includes(v));
    if (next.length) facets[k] = next;
    else delete facets[k];
  }
  return { ...f, facets };
}

/**
 * Narrow a facet selection by *replacing* the values for each facet in `next`
 * (unlike `mergeSelections`, which unions). Other facets are left untouched.
 */
export function replaceSelections(current: FacetSelection, next: FacetSelection): FacetSelection {
  const out: FacetSelection = { ...current };
  for (const [k, vs] of Object.entries(next) as [FacetKey, string[]][]) {
    if (vs.length) out[k] = [...vs];
    else delete out[k];
  }
  return out;
}

/**
 * Undo one drill step: restore the values a step replaced (`step.prev`), and
 * remove the values it newly introduced. `color` is left untouched.
 */
export function restoreSelections(
  f: FilterState,
  step: { facets: FacetSelection; prev?: FacetSelection },
): FilterState {
  const facets: FacetSelection = { ...f.facets };
  const prev = step.prev ?? {};
  for (const [k, vs] of Object.entries(step.facets) as [FacetKey, string[]][]) {
    if (k in prev) {
      const restored = prev[k] ?? [];
      if (restored.length) facets[k] = restored;
      else delete facets[k];
    } else {
      const next = (facets[k] ?? []).filter((v) => !vs.includes(v));
      if (next.length) facets[k] = next;
      else delete facets[k];
    }
  }
  return { ...f, facets };
}

/** AND across facets, OR within a facet. `except` skips one facet (for option counts). */
export function matchesFilters(t: Template, f: FilterState, except?: FacetKey | "color"): boolean {
  for (const [k, vs] of Object.entries(f.facets) as [FacetKey, string[]][]) {
    if (!vs || !vs.length || k === except) continue;
    const have = FACET_MAP[k].get(t);
    if (!vs.some((v) => have.includes(v))) return false;
  }
  if (f.color && except !== "color") {
    const hexes = f.color.colors.map((h) => normalizeHex(h)).filter((h): h is string => !!h);
    if (hexes.length && !paletteMatchesColors(hexes, t.colors, f.color.mode, COLOR_MATCH_THRESHOLD)) return false;
  }
  return true;
}

export function applyFilters(list: Template[], f: FilterState): Template[] {
  return list.filter((t) => matchesFilters(t, f));
}

/**
 * Per-facet option lists are expensive (a full pass over the dataset calling `matchesFilters`
 * for each of ~20 facets, ~180k iterations on the 9k-row dataset once details finish merging)
 * and deterministic in `(all, key, f, limit)`. Caching by the caller's memoized `all` array and
 * `FilterState` object makes repeat renders free; entries are collected with their keys, so a
 * superseded filter state is never retained.
 */
type FacetOption = { value: string; label: string; count: number; total: number };
const facetOptionsCache = new WeakMap<Template[], WeakMap<FilterState, Map<string, FacetOption[]>>>();

/** Option values for a facet: vocab ∪ values in data, with counts under the other active filters. */
export function facetOptions(
  all: Template[],
  key: FacetKey,
  f: FilterState,
  opts: { limit?: number } = {},
): FacetOption[] {
  let byFilter = facetOptionsCache.get(all);
  if (!byFilter) {
    byFilter = new WeakMap();
    facetOptionsCache.set(all, byFilter);
  }
  let byKey = byFilter.get(f);
  if (!byKey) {
    byKey = new Map();
    byFilter.set(f, byKey);
  }
  const cacheKey = `${key}|${opts.limit ?? ""}`;
  const cached = byKey.get(cacheKey);
  if (cached) return cached;

  const def = FACET_MAP[key];
  const counts = new Map<string, number>();
  const totals = new Map<string, number>();
  for (const t of all) {
    const vals = def.get(t);
    const ok = matchesFilters(t, f, key);
    for (const v of vals) {
      totals.set(v, (totals.get(v) ?? 0) + 1);
      if (ok) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
  }
  const values = new Set<string>([...(def.vocab ?? []), ...totals.keys()]);
  let list = Array.from(values).map((value) => ({
    value,
    label: displayValue(key, value),
    count: counts.get(value) ?? 0,
    total: totals.get(value) ?? 0,
  }));
  if (!def.vocab) list.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  if (opts.limit) {
    const selected = new Set(f.facets[key] ?? []);
    list = list.filter((o, i) => i < opts.limit! || selected.has(o.value));
  }
  byKey.set(cacheKey, list);
  return list;
}

export function activeFilterCount(f: FilterState, keys?: FacetKey[]): number {
  let n = 0;
  for (const [k, vs] of Object.entries(f.facets) as [FacetKey, string[]][]) {
    if (keys && !keys.includes(k)) continue;
    n += vs?.length ?? 0;
  }
  return n;
}
