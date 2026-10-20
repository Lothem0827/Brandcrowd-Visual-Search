import type { Template } from "./schema";
import { deltaE, hexToHsv, hsvToHex, nearestColorName } from "./color";
import { titleCase } from "./facets";

/**
 * Data-driven creative briefs.
 *
 * Give it an industry (or any search phrase) and it reads the matching slice of the
 * dataset to produce three things a designer would otherwise research by hand:
 *
 *  - a four-colour palette, anchored on the most common colour in that industry and
 *    harmonised (saturated main / analogous secondary / complementary accent / ink);
 *  - a title assembled from the industry's most popular title patterns, then checked
 *    against every existing title so it is genuinely new;
 *  - the six most common tags for that industry.
 *
 * Everything is deterministic and pure, so it runs in the browser (the dataset is
 * already loaded) and can be unit tested without a network.
 */

export type BriefColorRole = "main" | "secondary" | "accent" | "ink";

/** Main, secondary, accent, ink. */
export const PALETTE_SIZE = 4;

export interface BriefColor {
  hex: string;
  name: string;
  role: BriefColorRole;
}

export interface BriefMatch {
  /** how the query found its templates */
  kind: "industry" | "tag" | "topic" | "text";
  /** canonical label shown in the UI (e.g. "Construction") */
  label: string;
  /** number of templates the brief was built from */
  templates: number;
}

/** One palette + title pairing. Several are returned when the user asks for options. */
export interface BriefOption {
  /** exactly four colours, in main -> secondary -> accent -> ink order */
  palette: BriefColor[];
  /** the dominant colour this option is built from, before harmonising */
  anchor: { hex: string; name: string; share: number };
  title: string;
  /**
   * True when the industry ran out of distinct hue families and this palette is a
   * seeded variation of an existing colour story rather than new data.
   */
  variation?: boolean;
}

export interface DesignBrief {
  query: string;
  match: BriefMatch;
  /** ranked alternatives, best first; 1..MAX_BRIEF_OPTIONS */
  options: BriefOption[];
  /** alias of `options[0].palette`, kept for single-option callers */
  palette: BriefColor[];
  /** alias of `options[0].anchor` */
  anchor: BriefOption["anchor"];
  /** alias of `options[0].title` */
  title: string;
  /** every generated title; extras power the "Another" button when count is 1 */
  titles: string[];
  /** up to six common tags, most frequent first; shared by every option */
  tags: string[];
}

/** How many palette + title alternatives the dialog may request. */
export const MAX_BRIEF_OPTIONS = 3;

const TAGS_LIMIT = 6;
const TITLES_LIMIT = 3;
const TITLE_REJECT_SIMILARITY = 0.82;
const HUE_BUCKET = 30;

/** A hue family must own at least this share of the coloured pixels to anchor a palette. */
const MIN_FAMILY_SHARE = 0.06;
/** Two options are only worth showing if their mains differ by at least this much ΔE. */
const MIN_MAIN_DISTANCE = 0.1;

const ROLE_WEIGHT: Record<string, number> = { background: 0.35, primary: 0.5, accent: 0.4 };
const DEFAULT_ROLE_WEIGHT = 0.3;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Same normalisation as query.ts: lower case, accents/punctuation folded away. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9&'/\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const tokensOf = (s: string, dropNoise = false) =>
  norm(s)
    .split(" ")
    .filter((w) => w && (!dropNoise || !TITLE_NOISE.has(w)));

// ---------------------------------------------------------------------------
// Matching templates
// ---------------------------------------------------------------------------

interface WeightedTemplate {
  template: Template;
  weight: number;
}

interface Resolved {
  match: BriefMatch;
  templates: WeightedTemplate[];
}

/** Score an industry label against the query; 0 means no usable overlap. */
function industryScore(label: string, q: string, qTokens: Set<string>): number {
  const n = norm(label);
  if (!n) return 0;
  if (n === q) return 1;
  if (q.startsWith(`${n} `) || q.endsWith(` ${n}`) || q.includes(` ${n} `)) return 0.95;
  // Either half of a paired label is a valid shorthand: "Food & Drink" -> "food".
  const segments = n.split(/\s*&\s*/).filter(Boolean);
  if (segments.length > 1) {
    for (const segment of segments) {
      const segmentTokens = segment.split(" ");
      if (segmentTokens.every((word) => qTokens.has(word))) return 0.85;
    }
  }
  const tokens = n.split(" ").filter((t) => t !== "&");
  const hits = tokens.filter((t) => qTokens.has(t)).length;
  if (!hits) return 0;
  // Every word of the industry appears in the query, e.g. "home construction".
  if (hits === tokens.length) return 0.9;
  return (hits / tokens.length) * 0.8;
}

function scoreTemplate(t: Template, q: string, qTokens: Set<string>): number {
  let score = 0;
  const name = norm(t.name);
  const topic = norm(t.topic);
  const industry = norm(t.industry);
  const tags = t.tags.map(norm);

  if (name === q) score += 5;
  if (topic === q) score += 5;
  if (tags.includes(q)) score += 7;
  if (industry === q) score += 8;
  else if (industry.includes(q) || q.includes(industry)) score += 2;

  const nameTokens = new Set(name.split(" "));
  for (const w of qTokens) {
    if (nameTokens.has(w)) score += 1.5;
    if (tags.some((tag) => tag.split(" ").includes(w))) score += 1;
    if (topic.split(" ").includes(w)) score += 1.25;
    if (industry.split(" ").includes(w)) score += 2;
    if (norm(t.content.type) === w) score += 0.75;
  }
  return score;
}

function bestIndustry(labels: Iterable<string>, q: string, qTokens: Set<string>): string | null {
  let best: { label: string; score: number } | null = null;
  for (const label of labels) {
    const score = industryScore(label, q, qTokens);
    if (!best || score > best.score) best = { label, score };
  }
  return best && best.score >= 0.5 ? best.label : null;
}

/** The industry a query resolves to (the first step of `resolve`), or null. */
export function matchIndustry(templates: Template[], rawQuery: string): string | null {
  const q = norm(rawQuery);
  if (!q) return null;
  return bestIndustry(new Set(templates.map((t) => t.industry)), q, new Set(q.split(" ")));
}

/** Resolve a free-text industry/query into a weighted slice of the dataset. */
function resolve(templates: Template[], rawQuery: string): Resolved | null {
  const q = norm(rawQuery);
  if (!q) return null;
  const qTokens = new Set(q.split(" "));

  // 1) An industry match is the strongest signal ("Construction", "construction company").
  const industries = new Map<string, Template[]>();
  for (const t of templates) {
    const list = industries.get(t.industry);
    if (list) list.push(t);
    else industries.set(t.industry, [t]);
  }
  const industry = bestIndustry(industries.keys(), q, qTokens);
  if (industry) {
    const list = industries.get(industry) ?? [];
    return {
      match: { kind: "industry", label: industry, templates: list.length },
      templates: list.map((template) => ({ template, weight: 1 })),
    };
  }

  // 2) Otherwise rank records by tag, topic, name, industry and content-type overlap.
  const scored = templates
    .map((template) => ({ template, score: scoreTemplate(template, q, qTokens) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 500);
  if (!scored.length) return null;

  // The strongest evidence decides the label shown above the brief.
  const qHas = (get: (t: Template) => string[]) =>
    scored.some(({ template }) => get(template).some((v) => norm(v) === q));
  const kind: BriefMatch["kind"] = qHas((t) => t.tags)
    ? "tag"
    : qHas((t) => [t.topic])
      ? "topic"
      : "text";
  const label =
    kind === "tag"
      ? (scored.map((s) => s.template.tags.find((tag) => norm(tag) === q)).find(Boolean) ?? rawQuery.trim())
      : kind === "topic"
        ? (scored.map((s) => s.template.topic).find((topic) => norm(topic) === q) ?? rawQuery.trim())
        : rawQuery.trim();

  return {
    match: { kind, label, templates: scored.length },
    templates: scored.map(({ template, score }) => ({
      template,
      // Confidence in [0.4, 2]: exact matches count roughly twice as much as a loose one.
      weight: Math.max(0.4, Math.min(2, score / 2)),
    })),
  };
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

interface ColorSample {
  hex: string;
  weight: number;
  role: string;
}

interface HueFamily {
  /** representative hue in degrees (circular weighted mean) */
  hue: number;
  /** weighted saturation / value of the real colours in this family */
  s: number;
  v: number;
  /** total weight, used to rank families */
  weight: number;
  count: number;
}

/**
 * Group colours into 30-degree hue families.
 *
 * Exact shades are nearly unique in this dataset (thousands of one-off hexes), so
 * counting individual hexes produces noise. Grouping by hue recovers the colour
 * story designers actually see: "construction is mostly warm orange with a strong
 * teal/blue complement". Near-neutral whites, blacks and greys are ignored here;
 * they are palettes' backgrounds, not their brand colour.
 */
function hueFamilies(samples: ColorSample[]): { families: HueFamily[]; total: number } {
  const buckets = new Map<
    number,
    { weight: number; s: number; v: number; sin: number; cos: number; count: number }
  >();
  for (const sample of samples) {
    const hsv = hexToHsv(sample.hex);
    if (hsv.s < 0.15 || hsv.v < 0.12) continue;
    // Saturated, brighter colours carry more of the brand identity than muddy shadows.
    const weight = sample.weight * (0.25 + hsv.s * hsv.v);
    const bucket = Math.floor(hsv.h / HUE_BUCKET) * HUE_BUCKET;
    const item = buckets.get(bucket) ?? { weight: 0, s: 0, v: 0, sin: 0, cos: 0, count: 0 };
    item.weight += weight;
    item.s += hsv.s * weight;
    item.v += hsv.v * weight;
    item.sin += Math.sin((hsv.h * Math.PI) / 180) * weight;
    item.cos += Math.cos((hsv.h * Math.PI) / 180) * weight;
    item.count += 1;
    buckets.set(bucket, item);
  }
  const families = [...buckets.values()]
    .filter((b) => b.weight > 0)
    .map((b) => ({
      hue: ((Math.atan2(b.sin, b.cos) * 180) / Math.PI + 360) % 360,
      s: b.s / b.weight,
      v: b.v / b.weight,
      weight: b.weight,
      count: b.count,
    }))
    .sort((a, b) => b.weight - a.weight);
  return { families, total: families.reduce((sum, f) => sum + f.weight, 0) };
}

const hueDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

interface HsvColor {
  h: number;
  s: number;
  v: number;
}

/** Make a colour sit in a usable band for a template palette. */
function tune(color: HsvColor, sRange: [number, number], vRange: [number, number]): HsvColor {
  return {
    h: color.h,
    s: clamp(color.s, sRange[0], sRange[1]),
    v: clamp(color.v, vRange[0], vRange[1]),
  };
}

/** Nudge value until the colour is perceptibly different from the colours already picked. */
function separated(color: HsvColor, taken: string[], minDistance = 0.16): string {
  let v = color.v;
  for (let i = 0; i < 8; i++) {
    const hex = hsvToHex(color.h, color.s, v);
    if (taken.every((other) => deltaE(hex, other) >= minDistance)) return hex;
    v = v > 0.5 ? Math.max(0.16, v - 0.1) : Math.min(0.94, v + 0.1);
  }
  return hsvToHex(color.h, color.s, v);
}

// Saturation floors are deliberately high: a brief is a starting palette for a brand,
// and a muted swatch is useless as an accent on a template.
const MAIN_S: [number, number] = [0.62, 0.94];
const MAIN_V: [number, number] = [0.34, 0.78];
const SECONDARY_OFFSET = 34;
const ACCENT_TARGET = 180;
const ACCENT_TOLERANCE = 135;
const MIN_COMPLEMENT_SHARE = 0.12;
const ACCENT_S: [number, number] = [0.72, 0.96];
const ACCENT_V: [number, number] = [0.42, 0.9];

/** Colours already handed out, so variants never repeat a main or an accent. */
interface UsedColors {
  mains: string[];
  accents: string[];
}

/**
 * Seeded variation knobs.
 *
 * A seed of 0 is today's canonical answer. Larger seeds nudge the analogous offset,
 * pick a different (still complementary) data hue and start the title ranking further
 * down, so "Add more" can append fresh cards deterministically.
 */
function secondaryOffsetFor(seed: number): number {
  if (seed <= 0) return SECONDARY_OFFSET;
  // 27..41°, i.e. ±7° around the canonical 34°, in 3.5° steps cycling every 5 seeds.
  return SECONDARY_OFFSET + (((seed % 5) - 2) * 3.5);
}

/**
 * The data's hue closest to a true complement of `dominant`.
 *
 * Searching by "most complementary" rather than "first hue far enough away" matters:
 * the old `find()` could settle on a 140° near-analogue and call it a complement.
 * Weak families are rejected so a stray cluster cannot hijack the accent.
 */
function findComplement(
  dominant: HueFamily,
  families: HueFamily[],
  used: UsedColors,
  seed = 0,
): HueFamily | undefined {
  const usedAccentHues = used.accents.map((hex) => hexToHsv(hex).h);
  const candidates = families
    .filter(
      (family) =>
        hueDistance(family.hue, dominant.hue) >= ACCENT_TOLERANCE &&
        family.weight >= dominant.weight * MIN_COMPLEMENT_SHARE &&
        // Keep the second and third cards visually distinct from earlier accents.
        usedAccentHues.every((hue) => hueDistance(family.hue, hue) > 25),
    )
    .sort(
      (a, b) =>
        Math.abs(hueDistance(a.hue, dominant.hue) - ACCENT_TARGET) -
          Math.abs(hueDistance(b.hue, dominant.hue) - ACCENT_TARGET) || b.weight - a.weight,
    );
  if (!candidates.length) return undefined;
  return candidates[seed > 0 ? seed % candidates.length : 0];
}

/**
 * Build one main/secondary/accent/ink set around a dominant hue family.
 *
 * Main keeps the industry's own intensity and then pushes it up. The secondary is a
 * saturated analogous hue (not a tint), the accent is the closest available complement
 * — a real secondary hue family from the data when one is strong enough, otherwise a
 * synthesized 180° rotation — and the ink is the same hue taken almost to black so
 * copy on the palette reads as part of the brand. `anchor` stays the *raw* data colour
 * so the summary line keeps describing the dataset rather than the tuned palette.
 */
function buildPaletteFor(
  dominant: HueFamily,
  families: HueFamily[],
  total: number,
  used: UsedColors,
  seed = 0,
): BriefOption {
  const anchorHex = hsvToHex(dominant.hue, dominant.s, dominant.v);
  const mainHsv = tune(
    { h: dominant.hue, s: 0.55 + dominant.s * 0.45, v: dominant.v },
    MAIN_S,
    MAIN_V,
  );
  const mainHex = hsvToHex(mainHsv.h, mainHsv.s, mainHsv.v);
  const taken = [mainHex];

  const secondaryHsv = tune(
    {
      h: mainHsv.h + secondaryOffsetFor(seed),
      s: mainHsv.s * 0.82,
      v: mainHsv.v + 0.16,
    },
    [0.52, 0.86],
    [0.44, 0.9],
  );
  const secondaryHex = separated(secondaryHsv, taken);
  taken.push(secondaryHex);

  const complement = findComplement(dominant, families, used, seed);
  const accentHsv = tune(
    {
      h: complement ? complement.hue : (dominant.hue + ACCENT_TARGET) % 360,
      s: Math.max(mainHsv.s, complement?.s ?? 0),
      v: complement ? complement.v : mainHsv.v < 0.5 ? 0.88 : 0.7,
    },
    ACCENT_S,
    ACCENT_V,
  );
  const accentHex = separated(accentHsv, taken);
  taken.push(accentHex);

  // Ink: the same hue family, taken almost to black. Copy on the palette then reads as
  // part of the brand instead of a generic grey.
  const inkHsv = tune({ h: mainHsv.h, s: dominant.s * 0.35, v: 0.2 }, [0.08, 0.3], [0.12, 0.24]);
  const inkHex = separated(inkHsv, taken, 0.1);

  return {
    palette: [
      { hex: mainHex, name: nearestColorName(mainHex), role: "main" },
      { hex: secondaryHex, name: nearestColorName(secondaryHex), role: "secondary" },
      { hex: accentHex, name: nearestColorName(accentHex), role: "accent" },
      { hex: inkHex, name: nearestColorName(inkHex), role: "ink" },
    ],
    anchor: {
      hex: anchorHex,
      name: nearestColorName(anchorHex),
      share: dominant.weight / total,
    },
    title: "",
  };
}

/** Build parameters shared by a batch of options. */
interface BatchOptions {
  seed: number;
  minShare: number;
}

/**
 * Ranked palette options for one slice.
 *
 * Families are already 30° bins ordered by weight, so option 2 is the industry's
 * second-strongest colour story. A family is only accepted when its main is
 * perceptually distinct from every earlier main. When the data runs out, later
 * batches fall back to a seeded hue rotation of the strongest family, flagged as a
 * `variation` so the UI never implies it found a new colour story.
 */
function buildPalettes(
  families: HueFamily[],
  total: number,
  count: number,
  batch: BatchOptions = { seed: 0, minShare: MIN_FAMILY_SHARE },
): BriefOption[] {
  const used: UsedColors = { mains: [], accents: [] };
  const out: BriefOption[] = [];
  for (const family of families) {
    if (out.length >= count) break;
    if (family.weight < total * batch.minShare) continue;
    const built = buildPaletteFor(family, families, total, used, batch.seed);
    const mainHex = built.palette[0].hex;
    if (!used.mains.every((hex) => deltaE(hex, mainHex) >= MIN_MAIN_DISTANCE)) continue;
    used.mains.push(mainHex);
    used.accents.push(built.palette[2].hex);
    out.push(built);
  }

  // Seeded variation: rotate the strongest family's hue far enough to read as a new
  // option, keeping the same data anchor. Clearly flagged as derived, never as data.
  const anchorFamily = families.find((f) => f.weight >= total * batch.minShare) ?? families[0];
  for (let i = 0; out.length < count && anchorFamily && i < count + families.length; i++) {
    const shift = (24 + batch.seed * 11 + i * 17) % 360;
    const rotated: HueFamily = { ...anchorFamily, hue: (anchorFamily.hue + shift) % 360 };
    const built = buildPaletteFor(rotated, families, total, used, batch.seed + i + 1);
    const mainHex = built.palette[0].hex;
    if (!used.mains.every((hex) => deltaE(hex, mainHex) >= MIN_MAIN_DISTANCE)) continue;
    used.mains.push(mainHex);
    used.accents.push(built.palette[2].hex);
    out.push({ ...built, variation: true });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Titles
// ---------------------------------------------------------------------------

const TITLE_NOISE = new Set([
  "the",
  "a",
  "an",
  "and",
  "for",
  "of",
  "in",
  "on",
  "at",
  "by",
  "with",
  "from",
  "your",
  "our",
  "you",
  "we",
  "to",
  "is",
  "are",
  "be",
  "new",
  "instagram",
  "post",
  "template",
  "templates",
  "design",
  "graphic",
  "generic",
  "general",
  "module",
]);

/** Words that read naturally before the industry noun. */
const MODIFIER_WORDS = new Set([
  "affordable",
  "bold",
  "certified",
  "classic",
  "clean",
  "commercial",
  "complete",
  "contemporary",
  "corporate",
  "creative",
  "custom",
  "dynamic",
  "elegant",
  "essential",
  "expert",
  "fast",
  "fresh",
  "friendly",
  "industrial",
  "innovative",
  "local",
  "luxury",
  "minimal",
  "minimalist",
  "modern",
  "natural",
  "perfect",
  "playful",
  "premium",
  "professional",
  "quality",
  "reliable",
  "residential",
  "rustic",
  "smart",
  "stylish",
  "sustainable",
  "trusted",
  "ultimate",
  "vibrant",
  "warm",
]);

/** Words that read naturally after the industry noun. */
const TAIL_WORDS = new Set([
  "services",
  "service",
  "solutions",
  "solution",
  "experts",
  "expert",
  "company",
  "contractors",
  "contractor",
  "specialists",
  "specialist",
  "team",
  "works",
  "work",
]);

const CONTENT_WORDS: Record<string, string> = {
  service: "Services",
  announcement: "Announcement",
  hiring: "Hiring",
  tips: "Tips",
  sale: "Sale",
  promo: "Promo",
  testimonial: "Testimonial",
  quote: "Quote",
  event: "Event",
  greeting: "Greeting",
  product: "Product",
  offer: "Offer",
};

/**
 * The noun a title should be built around. Multi-topic industry labels get their
 * leading topic ("Food & Drink" -> "Food") so titles read like real template names
 * instead of category headings.
 */
function subjectForTitle(label: string): string {
  const primary = label.split(/\s*&\s*/)[0]?.trim() || label.trim();
  return titleCase(primary);
}

interface TitleCorpus {
  tokens: Map<string, number>;
  modifiers: Map<string, number>;
  tails: Map<string, number>;
  nouns: Map<string, number>;
  phrases: Map<string, number>;
  contentTypes: Map<string, number>;
  titles: string[];
}

const add = (map: Map<string, number>, key: string, weight: number) =>
  map.set(key, (map.get(key) ?? 0) + weight);

function topEntries(map: Map<string, number>, limit: number): string[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key]) => key);
}

function buildTitleCorpus(rows: WeightedTemplate[]): TitleCorpus {
  const corpus: TitleCorpus = {
    tokens: new Map(),
    modifiers: new Map(),
    tails: new Map(),
    nouns: new Map(),
    phrases: new Map(),
    contentTypes: new Map(),
    titles: [],
  };
  for (const { template, weight } of rows) {
    const words = tokensOf(template.name, true);
    if (!words.length) continue;
    corpus.titles.push(words.join(" "));
    const display = tokensOf(template.displayTitle, true);
    if (display.length) corpus.titles.push(display.join(" "));

    words.forEach((word, i) => {
      add(corpus.tokens, word, weight);
      if (MODIFIER_WORDS.has(word)) add(corpus.modifiers, word, weight);
      else if (TAIL_WORDS.has(word)) add(corpus.tails, word, weight);
      else add(corpus.nouns, word, weight);
      if (i + 1 < words.length) add(corpus.phrases, `${word} ${words[i + 1]}`, weight);
      if (i + 2 < words.length) add(corpus.phrases, `${word} ${words[i + 1]} ${words[i + 2]}`, weight);
    });
    add(corpus.contentTypes, template.content.type, weight);
  }
  return corpus;
}

function bigrams(s: string): string[] {
  const clean = ` ${s} `;
  const out: string[] = [];
  for (let i = 0; i + 1 < clean.length; i++) out.push(clean.slice(i, i + 2));
  return out;
}

/** max(token Jaccard, character-bigram Dice), both 0..1. */
function titleSimilarity(a: string, b: string): number {
  const ta = new Set(a.split(" "));
  const tb = new Set(b.split(" "));
  let shared = 0;
  for (const word of ta) if (tb.has(word)) shared++;
  const union = ta.size + tb.size - shared;
  const jaccard = union ? shared / union : 0;

  const ga = bigrams(a);
  const gb = bigrams(b);
  const counts = new Map<string, number>();
  for (const g of ga) counts.set(g, (counts.get(g) ?? 0) + 1);
  let hits = 0;
  for (const g of gb) {
    const left = counts.get(g) ?? 0;
    if (left > 0) {
      hits++;
      counts.set(g, left - 1);
    }
  }
  const dice = ga.length + gb.length ? (2 * hits) / (ga.length + gb.length) : 0;
  return Math.max(jaccard, dice);
}

function isUnique(candidate: string, existing: string[]): boolean {
  for (const title of existing) {
    if (title === candidate) return false;
    if (titleSimilarity(candidate, title) >= TITLE_REJECT_SIMILARITY) return false;
  }
  return true;
}

function generateTitles(
  subject: string,
  corpus: TitleCorpus,
  limit = TITLES_LIMIT,
  offset = 0,
): string[] {
  const subjectWords = tokensOf(subject, true);
  const subjectNorm = subjectWords.join(" ");
  const subjectSet = new Set(subjectWords);
  if (!subjectWords.length) return [];

  const modifiers = topEntries(corpus.modifiers, 8).filter((w) => !subjectSet.has(w));
  const tails = topEntries(corpus.tails, 5).filter((w) => !subjectSet.has(w));
  const contentTypes = topEntries(corpus.contentTypes, 6)
    .map((type) => CONTENT_WORDS[type])
    .filter((word): word is string => !!word);
  // Two-word phrases that build on the subject, e.g. "home construction".
  const subjectPhrases = topEntries(corpus.phrases, 80)
    .filter((phrase) => {
      const words = phrase.split(" ");
      return (
        words.length === 2 &&
        subjectWords.every((word) => words.includes(word)) &&
        phrase !== subjectNorm &&
        !words.some((word) => MODIFIER_WORDS.has(word))
      );
    })
    .slice(0, 10);

  const candidateSet = new Set<string>();
  const addCandidate = (words: (string | undefined)[]) => {
    const phrase = words.filter((w): w is string => !!w).join(" ").trim();
    if (!phrase) return;
    const normed = tokensOf(phrase, true);
    if (normed.length < 2 || normed.length > 5) return;
    if (new Set(normed).size !== normed.length) return;
    // Every title must still be about the requested industry/query.
    if (!subjectWords.every((word) => normed.includes(word))) return;
    candidateSet.add(normed.join(" "));
  };

  // The same shapes that dominate existing titles: modifier + subject + tail.
  for (const modifier of modifiers.slice(0, 4)) {
    for (const tail of tails.slice(0, 3)) addCandidate([modifier, subjectNorm, tail]);
  }
  for (const tail of tails.slice(0, 3)) addCandidate([subjectNorm, tail]);
  for (const modifier of modifiers.slice(0, 4)) addCandidate([modifier, subjectNorm]);
  for (const content of contentTypes.slice(0, 3)) {
    addCandidate([subjectNorm, content]);
    addCandidate([modifiers[0], subjectNorm, content]);
  }
  for (const phrase of subjectPhrases) {
    for (const modifier of modifiers.slice(0, 3)) addCandidate([modifier, phrase]);
  }

  const scored = [...candidateSet]
    .filter((candidate) => isUnique(candidate, corpus.titles))
    .map((candidate) => {
      const words = candidate.split(" ");
      const popularity = words.reduce((sum, word) => sum + Math.log1p(corpus.tokens.get(word) ?? 0), 0);
      const phrase = corpus.phrases.get(candidate) ?? corpus.phrases.get(words.slice(0, 2).join(" ")) ?? 0;
      const bonus = Math.log1p(phrase) * 0.8;
      // Novelty matters, but not enough to turn the title into nonsense.
      const novelty = 1 - Math.max(0, ...corpus.titles.map((title) => titleSimilarity(candidate, title)));
      return { candidate: titleCase(candidate), score: popularity + bonus + novelty * 1.5 };
    })
    .sort((a, b) => b.score - a.score || a.candidate.localeCompare(b.candidate));

  const out: string[] = [];
  for (const { candidate } of scored) {
    if (out.some((other) => titleSimilarity(norm(other), norm(candidate)) >= 0.9)) continue;
    out.push(candidate);
    if (out.length >= offset + limit) break;
  }

  // Extremely defensive fallback: every natural candidate collided with a real title.
  if (!out.length) {
    const modifier = modifiers[0] ?? "Fresh";
    const fallback = titleCase(`${modifier} ${subjectNorm} Concept`);
    out.push(fallback);
  }
  // Later batches start further down the ranking so "Add more" brings new titles.
  const sliced = out.slice(offset, offset + Math.max(limit, 1));
  // A seed past the end of the ranking still needs a usable title.
  return sliced.length ? sliced : out.slice(0, Math.max(limit, 1));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Seeded batch controls. Omit for the canonical, data-only answer. */
export interface BriefOptions {
  /** deterministic variation index used by "Add more" batches */
  seed?: number;
  /** override the 6% hue-family floor, e.g. 0.02 when asking for more options */
  minShare?: number;
}

/**
 * Build a creative brief for `query` from the supplied templates.
 *
 * `count` asks for 1..MAX_BRIEF_OPTIONS palette + title alternatives. It clamps
 * rather than throws, and returns fewer options when the industry has too few
 * distinct hue families to make them visibly different.
 *
 * `options.seed` produces a different but equally deterministic batch for "Add more";
 * `options.minShare` lowers the family floor so later batches can surface weaker
 * colour stories. Both default to today's canonical behaviour.
 *
 * Returns null when the query matches nothing (the UI shows a "try another industry" hint).
 */
export function generateBrief(
  templates: Template[],
  query: string,
  count = 1,
  options: BriefOptions = {},
): DesignBrief | null {
  const text = query.trim();
  if (!text || !templates.length) return null;
  const resolved = resolve(templates, text);
  if (!resolved || !resolved.templates.length) return null;

  const samples: ColorSample[] = [];
  for (const { template, weight } of resolved.templates) {
    for (const color of template.colors) {
      samples.push({
        hex: color.hex,
        weight: weight * (ROLE_WEIGHT[color.role] ?? DEFAULT_ROLE_WEIGHT),
        role: color.role,
      });
    }
  }
  if (!samples.length) return null;
  // Hue families are computed once and shared by every option: the extra variants
  // cost a few colour tweaks, not another pass over the slice.
  const { families, total } = hueFamilies(samples);
  if (!families.length || total <= 0) return null;

  const wanted = clamp(Math.round(count), 1, MAX_BRIEF_OPTIONS);
  const seed = Math.max(0, Math.round(options.seed ?? 0));
  const minShare = clamp(options.minShare ?? MIN_FAMILY_SHARE, 0.001, 1);
  const palettes = buildPalettes(families, total, wanted, { seed, minShare });
  if (!palettes.length) return null;

  const tagWeights = new Map<string, number>();
  for (const { template, weight } of resolved.templates) {
    for (const tag of template.tags) {
      const key = tag.trim().toLowerCase();
      if (key) add(tagWeights, key, weight);
    }
  }
  const tags = topEntries(tagWeights, TAGS_LIMIT);

  const corpus = buildTitleCorpus(resolved.templates);
  const subject = subjectForTitle(resolved.match.label);
  // Generate a couple of spares: they feed "Another" when only one card is shown.
  const titles = generateTitles(subject, corpus, Math.max(wanted, TITLES_LIMIT), seed * wanted);

  const pairs = palettes
    .slice(0, Math.min(palettes.length, titles.length))
    .map((option, index) => ({ ...option, title: titles[index] ?? subject }));
  if (!pairs.length) return null;

  return {
    query: text,
    match: resolved.match,
    options: pairs,
    palette: pairs[0].palette,
    anchor: pairs[0].anchor,
    title: pairs[0].title,
    titles,
    tags,
  };
}

/** How many popular colours the moodboard shows. */
export const POPULAR_COLOR_LIMIT = 6;
/** Real titles sent to the model as style examples. */
export const COMMON_TITLE_LIMIT = 12;
/** Titles the moodboard asks for, from the model or the deterministic fallback. */
export const MOODBOARD_TITLE_COUNT = 6;

export interface PopularColor {
  hex: string;
  name: string;
  /** share of the coloured weight in this slice, 0..1 */
  share: number;
}

/** Catalogue slice behind one moodboard: tags, popular colours, and title material. */
export interface MoodboardSource {
  match: BriefMatch;
  tags: string[];
  colors: PopularColor[];
  /** most common real titles in the slice, most frequent first */
  commonTitles: string[];
  /** deterministic stand-ins when the model is missing or short */
  fallbackTitles: string[];
}

function commonRealTitles(rows: WeightedTemplate[], limit: number): string[] {
  const counts = new Map<string, { text: string; weight: number }>();
  for (const { template, weight } of rows) {
    const text = template.displayTitle.trim();
    const key = norm(text);
    if (!key) continue;
    const prev = counts.get(key);
    if (prev) prev.weight += weight;
    else counts.set(key, { text, weight });
  }
  return [...counts.values()]
    .sort((a, b) => b.weight - a.weight || a.text.localeCompare(b.text))
    .slice(0, limit)
    .map((item) => item.text);
}

function popularFromFamilies(families: HueFamily[], total: number, limit: number): PopularColor[] {
  return families.slice(0, limit).map((family) => {
    const hex = hsvToHex(family.hue, family.s, family.v);
    return {
      hex,
      name: nearestColorName(hex),
      share: total > 0 ? family.weight / total : 0,
    };
  });
}

/**
 * Resolve a moodboard query into the catalogue facts the page and the title
 * route share. Returns null when nothing matches.
 *
 * Colours are the strongest hue families, not raw hex counts: individual shades
 * in this dataset almost never repeat.
 */
export function moodboardSource(templates: Template[], query: string): MoodboardSource | null {
  const text = query.trim();
  if (!text || !templates.length) return null;
  const resolved = resolve(templates, text);
  if (!resolved || !resolved.templates.length) return null;

  const samples: ColorSample[] = [];
  for (const { template, weight } of resolved.templates) {
    for (const color of template.colors) {
      samples.push({
        hex: color.hex,
        weight: weight * (ROLE_WEIGHT[color.role] ?? DEFAULT_ROLE_WEIGHT),
        role: color.role,
      });
    }
  }
  const { families, total } = samples.length ? hueFamilies(samples) : { families: [], total: 0 };

  const tagWeights = new Map<string, number>();
  for (const { template, weight } of resolved.templates) {
    for (const tag of template.tags) {
      const key = tag.trim().toLowerCase();
      if (key) add(tagWeights, key, weight);
    }
  }

  const corpus = buildTitleCorpus(resolved.templates);
  const subject = subjectForTitle(resolved.match.label);

  return {
    match: resolved.match,
    tags: topEntries(tagWeights, TAGS_LIMIT),
    colors: total > 0 ? popularFromFamilies(families, total, POPULAR_COLOR_LIMIT) : [],
    commonTitles: commonRealTitles(resolved.templates, COMMON_TITLE_LIMIT),
    fallbackTitles: generateTitles(subject, corpus, MOODBOARD_TITLE_COUNT),
  };
}
