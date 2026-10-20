import { moodboardSource } from "./brief";
import { NAMED_SWATCHES } from "./color";
import {
  displayValue,
  FACET_MAP,
  FACETS,
  mergeSelections,
  type FacetKey,
  type FacetSelection,
} from "./facets";
import { sanitizeInterpretation, shouldInterpret, type AiVocab } from "./llm";
import { chipsToSelection, isUnsearchableQuery, parseQuery, type VocabTerm } from "./query";
import type { Template } from "./schema";
import { MAX_QUERY_LENGTH } from "./url-state";

/**
 * Local gate for the explore assistant.
 *
 * Unknown questions are answered here and never become a model request.
 * Palette and tag answers are ranked from the catalogue. A model call is
 * planned only for a title, or for design wording the vocabulary cannot parse.
 */

export const ASSISTANT_HELP =
  "I can help with a title, a palette, tags, or designs. Try “designs for coffee”.";
export const ASSISTANT_NEED_KEYWORD = "Which subject should I use?";
export const ASSISTANT_NEED_DESIGN = "Designs for what?";
export const ASSISTANT_NOTHING = "Nothing in the catalogue matched.";
export const ASSISTANT_NO_CHANGE = "I couldn’t match that change to a filter.";

const KEYWORD_MAX = 80;

export type AssistantIntent = "title" | "palette" | "tags" | "designs";

export type GateResult =
  | { kind: "reject"; reply: string }
  | { kind: "need-keyword"; intent: AssistantIntent; reply: string }
  | { kind: "palette"; keyword: string }
  | { kind: "tags"; keyword: string }
  | { kind: "title"; keyword: string }
  | { kind: "designs"; keyword: string }
  | { kind: "refine"; keyword: string; modifier: string };

export interface PaletteSwatch {
  name: string;
  hex: string;
  count: number;
}

export interface TagHit {
  value: string;
  count: number;
}

export type AssistantStep =
  | { type: "say"; text: string; /** set when the next message should be read as this intent's subject */ awaiting?: AssistantIntent }
  | { type: "palette"; keyword: string; reply: string; swatches: PaletteSwatch[] }
  | { type: "tags"; keyword: string; reply: string; tags: TagHit[] }
  | {
      type: "designs-local";
      keyword: string;
      reply: string;
      facets: FacetSelection;
      query: string;
    }
  | { type: "refine-local"; keyword: string; reply: string; facets: FacetSelection }
  | {
      type: "fetch";
      intent: "title" | "designs";
      keyword: string;
      vague?: string;
      facets: FacetSelection;
      /** replace the Explore filters, or revise the ones already applied */
      mode: "replace" | "revise";
    };

export type AssistantApiResponse =
  | { status: "ok"; intent: "title"; reply: string; titles: string[]; keyword: string }
  | { status: "ok"; intent: "designs"; reply: string; facets: FacetSelection; text: string; keyword: string }
  | { status: "empty"; reply: string }
  | { status: "error"; message: string };

const INTENT_PATTERNS: { kind: AssistantIntent; re: RegExp }[] = [
  { kind: "title", re: /\b(?:titles?|headlines?)\b/i },
  { kind: "palette", re: /\b(?:palettes?|colou?rs?)\b/i },
  { kind: "tags", re: /\b(?:hash\s?tags?|tags?)\b/i },
  { kind: "designs", re: /\b(?:designs?|templates?)\b/i },
];

const INTENT_WORD: Record<AssistantIntent, RegExp> = {
  title: /\b(?:titles?|headlines?)\b/gi,
  palette: /\b(?:palettes?|colou?rs?|color schemes?|colour schemes?)\b/gi,
  tags: /\b(?:hash\s?tags?|tags?)\b/gi,
  designs: /\b(?:designs?|templates?|posts?)\b/gi,
};

const LEADING =
  /^(?:please\s+)?(?:can you\s+)?(?:i (?:want|need)\s+)?(?:generate|write|suggest|give me|give|make|need|show me|show|find me|find|search for|search|browse|get|see|look for|look|what(?:'s| is| are)?|which|popular|best|good|common|typical|some|the|a|an|my|me)\s+/i;

const REFINE_SHAPE =
  /^(?:more|less|warmer|cooler|bolder|softer|darker|lighter)\b|^(?:make|turn)\s+(?:it|them)\b|^(?:add|try)\s+\S/i;

const COMPARATIVE: Record<string, string> = {
  warmer: "warm",
  cooler: "cool",
  bolder: "bold",
};

const SWATCH_HEX = new Map(NAMED_SWATCHES.map((swatch) => [swatch.name, swatch.hex]));

function tidyKeyword(value: string): string {
  return value
    .replace(/[?.!,"“”]+$/g, "")
    .replace(/\b(?:please|thanks|thank you)\b/gi, " ")
    .replace(/^(?:a|an|the|some|my)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, KEYWORD_MAX);
}

function stripIntent(value: string, intent: AssistantIntent): string {
  return tidyKeyword(value.replace(INTENT_WORD[intent], " "));
}

function extractKeyword(message: string, intent: AssistantIntent): string {
  const directed = /\b(?:for|about|of)\s+(.+)$/i.exec(message);
  if (directed) return stripIntent(directed[1], intent);
  let text = message.trim();
  let prev = "";
  while (text && text !== prev) {
    prev = text;
    text = text.replace(LEADING, "");
  }
  return stripIntent(text, intent);
}

/** The words the user offered after being asked which subject to use. */
function subjectKeyword(value: string): string {
  return tidyKeyword(value.replace(/^(?:for|about)\s+/i, ""));
}

/**
 * Classify one message. `priorKeyword` is the design subject already on screen.
 * `pendingIntent` is set after "Which subject should I use?", so the next line
 * ("a gym membership") is that subject rather than a new question.
 */
export function gateMessage(
  message: string,
  priorKeyword: string | null,
  pendingIntent: AssistantIntent | null = null,
): GateResult {
  const text = message.trim().replace(/\s+/g, " ");
  if (!text || text.length > MAX_QUERY_LENGTH || isUnsearchableQuery(text)) {
    return { kind: "reject", reply: ASSISTANT_HELP };
  }

  let found: { kind: AssistantIntent; index: number } | null = null;
  for (const pattern of INTENT_PATTERNS) {
    const match = pattern.re.exec(text);
    if (!match) continue;
    if (!found || match.index < found.index) found = { kind: pattern.kind, index: match.index };
  }

  if (!found) {
    if (pendingIntent) {
      const keyword = subjectKeyword(text);
      if (!keyword || isUnsearchableQuery(keyword)) {
        return { kind: "need-keyword", intent: pendingIntent, reply: ASSISTANT_NEED_KEYWORD };
      }
      return { kind: pendingIntent, keyword };
    }
    if (REFINE_SHAPE.test(text)) {
      if (!priorKeyword) return { kind: "reject", reply: ASSISTANT_NEED_DESIGN };
      return { kind: "refine", keyword: priorKeyword, modifier: text };
    }
    return { kind: "reject", reply: ASSISTANT_HELP };
  }

  const keyword = extractKeyword(text, found.kind);
  if (!keyword || isUnsearchableQuery(keyword)) {
    return { kind: "need-keyword", intent: found.kind, reply: ASSISTANT_NEED_KEYWORD };
  }
  return { kind: found.kind, keyword };
}

/** Fold "more playful" / "warmer" into words the vocabulary can parse. */
export function refineQuery(modifier: string): string {
  const stripped = modifier
    .trim()
    .replace(/^(?:please\s+)?(?:make|turn)\s+(?:it|them)\s+/i, "")
    .replace(/^(?:more|less|add|try)\s+/i, "")
    .trim();
  return stripped
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => COMPARATIVE[word.toLowerCase()] ?? word)
    .join(" ");
}

export function refinePlan(
  modifier: string,
  vocab: VocabTerm[],
): { facets: FacetSelection; vague: string } {
  const folded = refineQuery(modifier);
  const basis = folded.length >= 4 ? folded : modifier.trim();
  const parsed = parseQuery(basis, vocab);
  const facetSource = folded.length >= 4 ? parseQuery(folded, vocab) : parsed;
  return {
    facets: chipsToSelection(facetSource.chips),
    vague: shouldInterpret(basis, parsed) ? parsed.text : "",
  };
}

function hasFacet(template: Template, facet: FacetKey, value: string): boolean {
  const want = value.toLowerCase();
  return FACET_MAP[facet].get(template).some((item) => item.toLowerCase() === want);
}

/** Templates whose industry, topic, tags, title, or parsed chips match the keyword. */
export function matchTemplates(templates: Template[], keyword: string, vocab: VocabTerm[]): Template[] {
  const parsed = parseQuery(keyword, vocab);
  const tokens = (parsed.text || keyword)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3);
  return templates.filter((template) => {
    const chipHit =
      parsed.chips.length > 0 && parsed.chips.every((chip) => hasFacet(template, chip.facet, chip.value));
    if (parsed.chips.length && !parsed.text) return chipHit;
    const hay = [template.industry, template.topic, template.displayTitle, template.name, ...template.tags]
      .join(" ")
      .toLowerCase();
    const textHit = tokens.some((token) => hay.includes(token));
    if (!parsed.chips.length) return textHit;
    return chipHit || textHit;
  });
}

export function rankPalette(templates: Template[]): PaletteSwatch[] {
  const counts = new Map<string, number>();
  for (const template of templates) {
    const seen = new Set<string>();
    for (const color of template.colors) {
      const name = color.name.toLowerCase();
      if (!name || !SWATCH_HEX.has(name) || seen.has(name)) continue;
      seen.add(name);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([name, count]) => ({ name, hex: SWATCH_HEX.get(name)!, count }));
}

export function rankTags(templates: Template[]): TagHit[] {
  const counts = new Map<string, number>();
  for (const template of templates) {
    const seen = new Set<string>();
    for (const tag of template.tags) {
      const value = tag.trim().toLowerCase();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([value, count]) => ({ value, count }));
}

export function facetLabels(facets: FacetSelection): string[] {
  const labels: string[] = [];
  for (const facet of FACETS) {
    for (const value of facets[facet.key] ?? []) labels.push(displayValue(facet.key, value));
  }
  return labels;
}

export function designsReply(facets: FacetSelection, keyword: string): string {
  const labels = facetLabels(facets).slice(0, 4);
  if (!labels.length) return `Showing designs for ${keyword}.`;
  return `Showing ${labels.join(", ")} designs.`;
}

/** Keywords safe to put in the search box without asking the model a second time. */
export function queryAfterModel(text: string, vocab: VocabTerm[]): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const parsed = parseQuery(trimmed, vocab);
  if (shouldInterpret(trimmed, parsed)) return "";
  return trimmed;
}

export function refineReply(facets: FacetSelection): string {
  const labels = facetLabels(facets).slice(0, 4);
  if (!labels.length) return ASSISTANT_NO_CHANGE;
  return `Updated the search: ${labels.join(", ")}.`;
}

/** Drop model facets that are not in the allowed vocabulary, then keep local chips. */
export function designFacetsFromModel(
  raw: unknown,
  allowed: AiVocab,
  local: FacetSelection,
): { facets: FacetSelection; text: string } {
  const clean = sanitizeInterpretation(raw, allowed);
  return {
    facets: mergeSelections(local, clean?.facets ?? {}),
    text: clean?.text ?? "",
  };
}

/**
 * Decide what one message does. A `fetch` step is the only shape that may call
 * the model; every other step is answered from the catalogue or a fixed reply.
 */
export function planAssistant(
  message: string,
  priorKeyword: string | null,
  templates: Template[],
  vocab: VocabTerm[],
  pendingIntent: AssistantIntent | null = null,
): AssistantStep {
  const gate = gateMessage(message, priorKeyword, pendingIntent);
  if (gate.kind === "reject") return { type: "say", text: gate.reply };
  if (gate.kind === "need-keyword") return { type: "say", text: gate.reply, awaiting: gate.intent };

  if (gate.kind === "palette" || gate.kind === "tags") {
    const rows = matchTemplates(templates, gate.keyword, vocab);
    if (!rows.length) return { type: "say", text: ASSISTANT_NOTHING };
    if (gate.kind === "palette") {
      const swatches = rankPalette(rows);
      if (!swatches.length) return { type: "say", text: ASSISTANT_NOTHING };
      const names = swatches.map((swatch) => swatch.name).join(", ");
      return {
        type: "palette",
        keyword: gate.keyword,
        reply: `Popular colours for ${gate.keyword}: ${names}.`,
        swatches,
      };
    }
    const tags = rankTags(rows);
    if (!tags.length) return { type: "say", text: ASSISTANT_NOTHING };
    return {
      type: "tags",
      keyword: gate.keyword,
      reply: `Common tags for ${gate.keyword}: ${tags.map((tag) => tag.value).join(", ")}.`,
      tags,
    };
  }

  if (gate.kind === "title") {
    // Titles copy the catalogue's voice. No slice means no model call, even when
    // the keyword is a filter chip — chips are not titles.
    if (!moodboardSource(templates, gate.keyword)) return { type: "say", text: ASSISTANT_NOTHING };
    return {
      type: "fetch",
      intent: "title",
      keyword: gate.keyword,
      facets: {},
      mode: "replace",
    };
  }

  if (gate.kind === "refine") {
    const plan = refinePlan(gate.modifier, vocab);
    if (plan.vague) {
      return {
        type: "fetch",
        intent: "designs",
        keyword: gate.keyword,
        vague: plan.vague,
        facets: plan.facets,
        mode: "revise",
      };
    }
    if (!Object.keys(plan.facets).length) return { type: "say", text: ASSISTANT_NO_CHANGE };
    return {
      type: "refine-local",
      keyword: gate.keyword,
      reply: refineReply(plan.facets),
      facets: plan.facets,
    };
  }

  const parsed = parseQuery(gate.keyword, vocab);
  const facets = chipsToSelection(parsed.chips);
  const hit = matchTemplates(templates, gate.keyword, vocab).length > 0 || parsed.chips.length > 0;
  const vague = shouldInterpret(gate.keyword, parsed) ? parsed.text : "";
  if (!hit) return { type: "say", text: ASSISTANT_NOTHING };
  if (vague) {
    return {
      type: "fetch",
      intent: "designs",
      keyword: gate.keyword,
      vague,
      facets,
      mode: "replace",
    };
  }
  return {
    type: "designs-local",
    keyword: gate.keyword,
    reply: designsReply(facets, gate.keyword),
    facets,
    query: parsed.text,
  };
}
