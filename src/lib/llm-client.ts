import { interpretationKey, type AiInterpretation, type InterpretResponse } from "./llm";

/**
 * Browser side of the LLM query interpreter. Keeps a small in-memory cache so
 * typing back and forth over the same phrasing never re-calls the model.
 */
const cache = new Map<string, AiInterpretation>();

export const cachedInterpretation = (category: string, query: string) =>
  cache.get(interpretationKey(category, query));

export async function requestInterpretation(
  query: string,
  category: string,
  signal: AbortSignal,
): Promise<InterpretResponse> {
  const res = await fetch("/api/interpret", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, category }),
    signal,
  });
  const data = (await res.json()) as InterpretResponse;
  if (res.ok && data.status === "ok") {
    cache.set(interpretationKey(category, query), data.result);
  }
  return data;
}
