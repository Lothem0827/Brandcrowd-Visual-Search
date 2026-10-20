import type { AssistantApiResponse } from "./assistant";

/**
 * Browser side of the assistant. Only title and vague-design turns reach this.
 * Repeated questions reuse the in-memory answer.
 */
const cache = new Map<string, AssistantApiResponse>();

const cacheKey = (intent: string, keyword: string, vague: string) =>
  `${intent}::${keyword.trim().toLowerCase().replace(/\s+/g, " ")}::${vague.trim().toLowerCase().replace(/\s+/g, " ")}`;

export function cachedAssistant(intent: "title" | "designs", keyword: string, vague = "") {
  return cache.get(cacheKey(intent, keyword, vague));
}

export async function requestAssistant(
  body: { intent: "title" | "designs"; keyword: string; category: string; vague?: string },
  signal: AbortSignal,
): Promise<AssistantApiResponse> {
  const key = cacheKey(body.intent, body.keyword, body.vague ?? "");
  const hit = cache.get(key);
  if (hit) return hit;
  const res = await fetch("/api/assistant", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = (await res.json()) as AssistantApiResponse;
  if (res.ok && data.status === "ok") cache.set(key, data);
  if (!res.ok && data.status !== "error") {
    return { status: "error", message: "The assistant couldn't answer that." };
  }
  return data;
}
