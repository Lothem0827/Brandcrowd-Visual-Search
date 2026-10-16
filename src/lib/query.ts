import type { Template } from "./schema";
import { FACETS, FACET_MAP, displayValue, type FacetKey, type FacetSelection } from "./facets";

export interface VocabTerm {
  facet: FacetKey;
  value: string;
  label: string;
  /** lower-case phrases that map to this term */
  phrases: string[];
  count: number;
}

export interface ParsedChip {
  facet: FacetKey;
  value: string;
  /** the words in the query that produced this chip */
  matched: string;
}

export interface ParsedQuery {
  chips: ParsedChip[];
  /** words not consumed by vocab (and not stop words) for fuzzy text search */
  text: string;
  /** cleaned query used as tree root label */
  label: string;
}

export const STOP_WORDS = new Set([
  "design", "designs", "template", "templates", "post", "posts", "instagram", "ig", "with", "and",
  "a", "an", "the", "for", "of", "in", "on", "style", "styled", "looking", "look", "like", "that", "some", "me",
]);

/** extra phrases -> facet value */
const SYNONYMS: [FacetKey, string, string[]][] = [
  ["aesthetic", "minimalist", ["minimal", "minimalism", "clean", "simple"]],
  ["aesthetic", "luxury", ["luxurious", "premium"]],
  ["aesthetic", "playful", ["fun", "quirky"]],
  ["aesthetic", "y2k", ["y2k"]],
  ["aesthetic", "vintage", ["old school", "classic"]],
  ["aesthetic", "brutalist", ["brutalism"]],
  ["aesthetic", "bold", ["strong", "loud"]],
  ["fontStyle", "sans serif", ["sans", "sans-serif", "sanserif"]],
  ["fontStyle", "script", ["handwritten", "cursive", "calligraphy"]],
  ["fontStyle", "condensed", ["narrow"]],
  ["imageType", "none", ["no image", "no images", "text only", "typography only", "without image"]],
  ["imageType", "photo", ["photo", "photos", "photography", "photographic", "picture"]],
  ["imageType", "illustration", ["illustrated", "illustrations", "drawing", "drawn"]],
  ["placement", "frame", ["framed", "frame", "framed photo", "photo frame", "image frame"]],
  ["placement", "background", ["photo background", "image background", "background photo", "background image"]],
  ["placement", "cutout", ["cut out", "cut-out", "cutouts"]],
  ["placement", "full-bleed", ["full bleed", "fullbleed"]],
  ["structure", "split", ["split layout", "split screen"]],
  ["structure", "centered stack", ["centered", "centred"]],
  ["structure", "frame/border", ["border", "bordered"]],
  ["contentType", "sale", ["discount", "sales"]],
  ["contentType", "promo", ["promotion", "promotional", "ad"]],
  ["contentType", "hiring", ["we're hiring", "job", "recruitment", "vacancy"]],
  ["contentType", "testimonial", ["review", "feedback", "testimonials"]],
  ["contentType", "tips", ["list", "checklist"]],
  ["contentType", "quote", ["quotes", "quotation"]],
  ["contentType", "announcement", ["notice", "coming soon"]],
  ["colorScheme", "high contrast", ["contrast", "contrasty"]],
  ["colorScheme", "neon", ["vibrant", "bright"]],
  ["colorScheme", "monochrome", ["black and white", "mono"]],
  ["colorName", "gray", ["grey"]],
  ["effects", "outline", ["outlined"]],
  ["effects", "curved", ["curved text"]],
];

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9&'/\- ]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Parts of a query the search can't use: it matches English keywords (a-z, 0-9), so emoji,
 * CJK and other scripts are dropped by `norm`. Returned so the UI can say so instead of
 * silently ignoring them.
 */
export function ignoredQueryText(query: string): string {
  return query
    .split(/\s+/)
    .filter((w) => w && !norm(w))
    .join(" ");
}

/** True when the query is non-empty but contains nothing the search can use. */
export function isUnsearchableQuery(query: string): boolean {
  return query.trim() !== "" && norm(query) === "";
}

/** Build the vocabulary used for chip detection and autocomplete from the dataset. */
export function buildVocab(templates: Template[]): VocabTerm[] {
  const terms = new Map<string, VocabTerm>();
  for (const f of FACETS) {
    if (!f.parse) continue;
    const counts = new Map<string, number>();
    for (const t of templates) for (const v of f.get(t)) counts.set(v, (counts.get(v) ?? 0) + 1);
    const values = new Set<string>([...(f.vocab ?? []), ...counts.keys()]);
    for (const v of values) {
      const id = `${f.key}:${v}`;
      // "none" image type and "other" content type should not be detected from free words
      const skip = v === "none" || v === "other" || (f.key === "placement" && v === "background");
      const phrases = skip ? [] : [norm(v)];
      if (v.includes("&")) phrases.push(norm(v.replace(/&/g, "and")), norm(v.replace(/\s*&\s*/g, " ")));
      if (f.key === "structure" && v === "full-bleed photo") phrases.push("full bleed photo");
      terms.set(id, { facet: f.key, value: v, label: displayValue(f.key, v), phrases, count: counts.get(v) ?? 0 });
    }
  }
  for (const [facet, value, phr] of SYNONYMS) {
    const t = terms.get(`${facet}:${value}`);
    if (t) t.phrases.push(...phr.map(norm));
  }
  // Topics equal to their industry name would double-match; keep the industry.
  return Array.from(terms.values());
}

/**
 * phrase -> term. When several facets share a phrase, the broadest interpretation
 * wins (highest count); ties fall back to facet priority order. This stops a narrow
 * `topic` value (the dataset has ~6.5k of them, mostly near-unique labels) from
 * hijacking a word that is really a common tag — e.g. "gaming" is a 2-template
 * topic but a 102-template tag, so it resolves to the tag.
 */
function phraseIndex(vocab: VocabTerm[]): Map<string, VocabTerm> {
  const idx = new Map<string, VocabTerm>();
  const order = FACETS.map((f) => f.key);
  const rank = (t: VocabTerm) => order.indexOf(t.facet);
  for (const t of vocab) {
    if (t.count === 0 && (t.facet === "industry" || t.facet === "topic")) continue;
    for (const p of t.phrases) {
      if (!p) continue;
      const cur = idx.get(p);
      if (!cur || t.count > cur.count || (t.count === cur.count && rank(t) < rank(cur))) idx.set(p, t);
    }
  }
  return idx;
}

const indexCache = new WeakMap<VocabTerm[], Map<string, VocabTerm>>();

/**
 * Split a free-text query into facet chips (longest phrase match first) and the
 * remaining words used for fuzzy search.
 * e.g. "construction bold design" -> Industry: Construction, Style: Bold, text "".
 */
export function parseQuery(query: string, vocab: VocabTerm[]): ParsedQuery {
  let idx = indexCache.get(vocab);
  if (!idx) {
    idx = phraseIndex(vocab);
    indexCache.set(vocab, idx);
  }
  const words = norm(query).split(" ").filter(Boolean);
  const chips: ParsedChip[] = [];
  const rest: string[] = [];
  const labelWords: string[] = [];
  let i = 0;
  while (i < words.length) {
    let matched = false;
    for (let n = Math.min(4, words.length - i); n >= 1; n--) {
      const phrase = words.slice(i, i + n).join(" ");
      let term = idx.get(phrase);
      if (!term && n === 1 && phrase.length > 3 && phrase.endsWith("s")) term = idx.get(phrase.slice(0, -1));
      if (term) {
        if (!chips.some((c) => c.facet === term!.facet && c.value === term!.value)) {
          chips.push({ facet: term.facet, value: term.value, matched: phrase });
        }
        labelWords.push(...words.slice(i, i + n));
        i += n;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const w = words[i];
    if (!STOP_WORDS.has(w)) {
      rest.push(w);
      labelWords.push(w);
    }
    i++;
  }
  return { chips, text: rest.join(" "), label: labelWords.join(" ") };
}

export function chipsToSelection(chips: ParsedChip[]): FacetSelection {
  const sel: FacetSelection = {};
  for (const c of chips) sel[c.facet] = Array.from(new Set([...(sel[c.facet] ?? []), c.value]));
  return sel;
}

/** Remove the words that produced `chip` from the query string. */
export function removeChipFromQuery(query: string, chip: ParsedChip): string {
  const words = norm(query).split(" ").filter(Boolean);
  const target = chip.matched.split(" ");
  for (let i = 0; i + target.length <= words.length; i++) {
    const slice = words.slice(i, i + target.length);
    const eq = slice.every((w, j) => w === target[j] || (w.endsWith("s") && w.slice(0, -1) === target[j]));
    if (eq) {
      words.splice(i, target.length);
      return words.join(" ");
    }
  }
  return query;
}

export interface Suggestion {
  kind: "term" | "tag";
  facet: FacetKey;
  value: string;
  label: string;
  count: number;
}

const suggestCache = new WeakMap<VocabTerm[], Map<string, Suggestion[]>>();

/**
 * Autocomplete for the last (partial) word(s) of the query. Results are memoized per vocab
 * (which changes only when the dataset does), so the full-term scan runs at most once per
 * distinct prefix instead of on every keystroke render.
 */
export function suggest(query: string, vocab: VocabTerm[], tagCounts: Map<string, number>, limit = 8): Suggestion[] {
  let byQuery = suggestCache.get(vocab);
  if (!byQuery) {
    byQuery = new Map();
    suggestCache.set(vocab, byQuery);
  }
  const key = `${limit}\u0000${norm(query)}`;
  const cached = byQuery.get(key);
  if (cached) return cached;
  const result = computeSuggest(query, vocab, tagCounts, limit);
  // Bound the cache: every keystroke is a new prefix, and only recent ones are ever reused.
  if (byQuery.size >= 256) byQuery.clear();
  byQuery.set(key, result);
  return result;
}

function computeSuggest(query: string, vocab: VocabTerm[], tagCounts: Map<string, number>, limit = 8): Suggestion[] {
  const q = norm(query);
  if (!q) return [];
  const words = q.split(" ");
  const cands: Suggestion[] = [];
  const seen = new Set<string>();
  // try last 1..2 words as the prefix
  for (const n of [2, 1]) {
    if (words.length < n) continue;
    const prefix = words.slice(-n).join(" ");
    if (prefix.length < 2) continue;
    for (const t of vocab) {
      if (t.count === 0) continue;
      const hit = t.phrases.find((p) => p.startsWith(prefix) || (prefix.length >= 3 && p.includes(` ${prefix}`)));
      if (!hit) continue;
      const id = `${t.facet}:${t.value}`;
      if (seen.has(id)) continue;
      seen.add(id);
      cands.push({ kind: "term", facet: t.facet, value: t.value, label: t.label, count: t.count });
    }
    for (const [tag, count] of tagCounts) {
      if (!tag.startsWith(prefix)) continue;
      const id = `tag:${tag}`;
      if (seen.has(id) || seen.has(`industry:${tag}`)) continue;
      seen.add(id);
      cands.push({ kind: "tag", facet: "tag", value: tag, label: tag, count });
    }
  }
  const prio = (s: Suggestion) => (s.kind === "term" ? 0 : 1);
  return cands.sort((a, b) => prio(a) - prio(b) || b.count - a.count).slice(0, limit);
}

export interface AppliedFacet {
  facet: FacetKey;
  value: string;
}

/**
 * "Related" chips for an active search: the same vocabulary suggestions the autocomplete shows
 * for the query, minus anything already applied as a facet (so searching "construction" doesn't
 * re-suggest Industry: Construction). Each chip is a term/tag label the user can pick to run.
 */
export function relatedChips(
  query: string,
  vocab: VocabTerm[],
  tagCounts: Map<string, number>,
  applied: AppliedFacet[],
  limit = 12,
): Suggestion[] {
  if (!norm(query)) return [];
  const done = new Set(applied.map((a) => `${a.facet}:${a.value}`.toLowerCase()));
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  for (const s of suggest(query, vocab, tagCounts, limit + applied.length + 4)) {
    const id = `${s.facet}:${s.value}`.toLowerCase();
    if (done.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

export interface LabelHighlight {
  before: string;
  match: string;
  after: string;
}

/**
 * Split a suggestion label around the part that matched the typed prefix, so the dropdown can
 * bold it ("constr**uction**"). Mirrors `suggest`'s trailing 1-2 word prefixes; single-character
 * prefixes are ignored and a label with no match returns an empty `match`.
 */
export function highlightLabel(label: string, query: string): LabelHighlight {
  const words = norm(query).split(" ").filter(Boolean);
  const lower = label.toLowerCase();
  for (const n of [2, 1]) {
    if (words.length < n) continue;
    const prefix = words.slice(-n).join(" ");
    if (prefix.length < 2) continue;
    const at = lower.indexOf(prefix);
    if (at !== -1) {
      return {
        before: label.slice(0, at),
        match: label.slice(at, at + prefix.length),
        after: label.slice(at + prefix.length),
      };
    }
  }
  return { before: label, match: "", after: "" };
}

/** Replace the trailing partial word(s) in the query with a completed phrase. */
export function completeQuery(query: string, completion: string): string {
  const words = norm(query).split(" ").filter(Boolean);
  const c = norm(completion);
  // drop trailing words that are a prefix of the completion
  for (let n = Math.min(2, words.length); n >= 1; n--) {
    const tail = words.slice(-n).join(" ");
    if (c.startsWith(tail) || c.includes(` ${tail}`)) {
      return [...words.slice(0, -n), c].join(" ") + " ";
    }
  }
  return [...words, c].join(" ") + " ";
}

export const facetLabel = (k: FacetKey) => FACET_MAP[k].label;
