import { titleCase } from "./facets";

/** How many titles a moodboard shows. */
export const MOODBOARD_TITLE_COUNT = 6;

const NEAR_COPY = 0.82;

export type MoodboardTitleSource = "model" | "mixed" | "catalogue";

export type MoodboardTitlesResponse =
  | { status: "ok"; titles: string[]; source: MoodboardTitleSource; label: string }
  | { status: "empty" }
  | { status: "error"; message: string };

/** System + user messages for the title completion call. */
export function buildMoodboardTitlePrompt(subject: string, examples: string[]) {
  const system = [
    "You write titles for a design-template catalogue.",
    "You receive a subject and the most common existing titles in that subject.",
    "Write exactly 6 new titles that follow the same style: short, concrete, and about the subject.",
    "Do not copy an example, and do not lightly reword one.",
    "Each title is 2 to 5 words.",
    'Reply with JSON only: {"titles":["...","...","...","...","...","..."]}',
  ].join("\n");
  const list = examples.length ? examples.map((title) => `- ${title}`).join("\n") : "(none)";
  const user = `Subject: ${subject}\nCommon titles:\n${list}`;
  return { system, user };
}

function normTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(value: string): string[] {
  const clean = ` ${value} `;
  const out: string[] = [];
  for (let i = 0; i + 1 < clean.length; i++) out.push(clean.slice(i, i + 2));
  return out;
}

/** max(token Jaccard, character-bigram Dice), both 0..1. */
function titleSimilarity(a: string, b: string): number {
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  let shared = 0;
  for (const word of ta) if (tb.has(word)) shared++;
  const union = ta.size + tb.size - shared;
  const jaccard = union ? shared / union : 0;

  const ga = bigrams(a);
  const gb = bigrams(b);
  const counts = new Map<string, number>();
  for (const gram of ga) counts.set(gram, (counts.get(gram) ?? 0) + 1);
  let hits = 0;
  for (const gram of gb) {
    const left = counts.get(gram) ?? 0;
    if (left > 0) {
      hits++;
      counts.set(gram, left - 1);
    }
  }
  const dice = ga.length + gb.length ? (2 * hits) / (ga.length + gb.length) : 0;
  return Math.max(jaccard, dice);
}

function tooClose(candidate: string, others: string[]): boolean {
  return others.some((other) => other === candidate || titleSimilarity(candidate, other) >= NEAR_COPY);
}

/**
 * Coerce a model reply into usable titles. Drops empties, duplicates, and
 * near-copies of the catalogue examples. Title-cases what remains.
 */
export function sanitizeMoodboardTitles(raw: unknown, examples: string[]): string[] {
  if (!raw || typeof raw !== "object") return [];
  const value = (raw as Record<string, unknown>).titles;
  const candidates = Array.isArray(value) ? value : [];
  const blocked = examples.map(normTitle).filter(Boolean);
  const accepted: string[] = [];
  const norms: string[] = [];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const text = titleCase(candidate.trim().replace(/\s+/g, " ")).slice(0, 80);
    const normed = normTitle(text);
    const words = normed.split(" ").filter(Boolean);
    if (words.length < 2 || words.length > 6) continue;
    if (tooClose(normed, blocked) || tooClose(normed, norms)) continue;
    accepted.push(text);
    norms.push(normed);
    if (accepted.length >= MOODBOARD_TITLE_COUNT) break;
  }
  return accepted;
}

/**
 * Pad a short model list with deterministic titles. `catalogue` means nothing
 * usable came back from the model.
 */
export function fillMoodboardTitles(
  primary: string[],
  fallback: string[],
): { titles: string[]; source: MoodboardTitleSource } {
  const titles = primary.slice(0, MOODBOARD_TITLE_COUNT);
  const norms = titles.map(normTitle);
  for (const candidate of fallback) {
    if (titles.length >= MOODBOARD_TITLE_COUNT) break;
    const text = candidate.trim();
    const normed = normTitle(text);
    if (!normed || tooClose(normed, norms)) continue;
    titles.push(text);
    norms.push(normed);
  }
  const source: MoodboardTitleSource =
    primary.length === 0 ? "catalogue" : titles.length > primary.length ? "mixed" : "model";
  return { titles, source };
}
