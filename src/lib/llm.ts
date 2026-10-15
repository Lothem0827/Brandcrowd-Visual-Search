import type { FacetKey, FacetSelection } from "./facets";
import type { ParsedQuery, VocabTerm } from "./query";

/**
 * LLM query interpreter.
 *
 * The deterministic parser in `query.ts` only understands literal vocabulary
 * words. This layer asks an LLM to translate the *leftover*, vague part of a
 * query ("make it pop", "cozy coffee shop vibes") into the same facet
 * vocabulary the rest of the app already uses, plus a few extra search
 * keywords. Everything here is pure so it can run on the server route and be
 * unit tested without a network.
 */

/** Facets the model is allowed to emit, in priority order (budget is spent top-down). */
export const AI_FACET_KEYS = [
  "industry",
  "topic",
  "contentType",
  "aesthetic",
  "mood",
  "colorScheme",
  "texture",
  "colorName",
  "fontStyle",
  "structure",
  "imageType",
  "placement",
  "illustrationStyle",
  "frameShape",
  "effects",
] as const;

export type AiFacetKey = (typeof AI_FACET_KEYS)[number];

export interface AiInterpretation {
  /** facet values chosen by the model, validated against the real vocabulary */
  facets: FacetSelection;
  /** extra keywords to fuzzy-search, "" when nothing helps */
  text: string;
  /** one short sentence explaining the reading of the query */
  reason: string;
}

/** Allowed values per facet, as sent to the model and used to validate its reply. */
export type AiVocab = Partial<Record<AiFacetKey, string[]>>;

export type InterpretResponse =
  | { status: "ok"; result: AiInterpretation; model: string }
  | { status: "empty" }
  | { status: "disabled" }
  | { status: "error"; message: string };

const MAX_VALUES_PER_FACET = 3;
const MAX_VALUES_TOTAL = 6;
const MAX_VOCAB_VALUES = 40;
const MAX_TEXT = 80;
const MAX_REASON = 160;

const AI_FACET_SET = new Set<string>(AI_FACET_KEYS);

export const isAiFacetKey = (k: string): k is AiFacetKey => AI_FACET_SET.has(k);

/** Stable cache key for one query in one category. */
export const interpretationKey = (category: string, query: string) =>
  `${category}::${query.trim().toLowerCase().replace(/\s+/g, " ")}`;

/**
 * The values the model may pick from: only what actually exists in the current
 * dataset (so every chip it returns matches at least one template), most
 * common first, capped so the prompt stays small.
 */
export function buildAiVocab(vocab: VocabTerm[]): AiVocab {
  const out: AiVocab = {};
  for (const key of AI_FACET_KEYS) {
    const seen = new Set<string>();
    const values: string[] = [];
    for (const term of vocab
      .filter((t) => t.facet === key && t.count > 0)
      .sort((a, b) => b.count - a.count)) {
      if (seen.has(term.value)) continue;
      seen.add(term.value);
      values.push(term.value);
      if (values.length >= MAX_VOCAB_VALUES) break;
    }
    if (values.length) out[key] = values;
  }
  return out;
}

/** System + user messages for the chat completion call. */
export function buildInterpretPrompt(query: string, category: string, allowed: AiVocab) {
  const lines = AI_FACET_KEYS.filter((k) => allowed[k]?.length).map(
    (k) => `${k}: ${allowed[k]!.join(" | ")}`,
  );
  const system = [
    "You translate vague or emotional design-search phrases into structured filters for a visual template search engine.",
    "Pick values ONLY from the allowed lists below. Never invent a value. Omit any facet you are unsure about.",
    'Also return "text": 0-6 concrete keywords or synonyms to fuzzy-search, or "" if the leftover words already work as keywords.',
    '"reason" is one short sentence (max 15 words) describing your reading of the query.',
    'Reply with JSON only: {"facets":{"<facet>":["<value>"]},"text":"...","reason":"..."}',
    "",
    "Allowed facets and values:",
    ...lines,
  ].join("\n");
  const user = `Category: ${category}\nQuery: ${query}`;
  return { system, user };
}

/**
 * Coerce whatever the model returned into a valid interpretation, dropping
 * facets and values that are not in `allowed`. Returns null when nothing
 * usable survived.
 */
export function sanitizeInterpretation(raw: unknown, allowed: AiVocab): AiInterpretation | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const rawFacets = (
    obj.facets && typeof obj.facets === "object" ? obj.facets : {}
  ) as Record<string, unknown>;

  const facets: FacetSelection = {};
  let total = 0;
  for (const key of AI_FACET_KEYS) {
    const room = MAX_VALUES_TOTAL - total;
    if (room <= 0) break;
    const allowedValues = allowed[key];
    if (!allowedValues?.length) continue;
    const lookup = new Map(allowedValues.map((v) => [v.toLowerCase(), v]));
    const rawValue = rawFacets[key];
    const candidates = Array.isArray(rawValue) ? rawValue : [rawValue];
    const picked = candidates
      .filter((v): v is string => typeof v === "string")
      .map((v) => lookup.get(v.trim().toLowerCase()))
      .filter((v): v is string => !!v);
    const take = Array.from(new Set(picked)).slice(0, Math.min(MAX_VALUES_PER_FACET, room));
    if (!take.length) continue;
    facets[key as FacetKey] = take;
    total += take.length;
  }

  const text =
    typeof obj.text === "string" ? obj.text.trim().replace(/\s+/g, " ").slice(0, MAX_TEXT) : "";
  const reason =
    typeof obj.reason === "string" ? obj.reason.trim().replace(/\s+/g, " ").slice(0, MAX_REASON) : "";

  if (!Object.keys(facets).length && !text) return null;
  return { facets, text, reason };
}

/**
 * Only spend an LLM call when the deterministic parser left real words over —
 * i.e. the query contains something the vocabulary could not explain.
 */
export function shouldInterpret(query: string, parsed: ParsedQuery): boolean {
  const q = query.trim();
  if (q.length < 4) return false;
  const leftover = parsed.text.trim();
  if (leftover.length < 3) return false;
  return leftover.split(/\s+/).some((w) => w.length >= 3);
}
