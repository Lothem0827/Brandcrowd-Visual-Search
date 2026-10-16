/**
 * Builds the MiniSearch index off the main thread (it takes ~0.9 s on a fast desktop and
 * several seconds on a phone) and answers text searches. The dataset is fetched by URL,
 * which the page has already downloaded, so it is served from the HTTP cache.
 */
import { buildSearchIndex, type SearchIndex } from "./search";
import type { Template } from "./schema";
import { mergeDetails, type DetailsMap } from "./data-split";
import type { SearchRequest, SearchResponse } from "./search-client";

const ctx = self as unknown as Worker;
let ready: Promise<SearchIndex> | null = null;
// Second layer behind the client cache: repeated queries (e.g. across tabs/failovers) don't
// re-run MiniSearch. Bounded so a long session can't grow without limit.
const results = new Map<string, [string, number][]>();
const RESULT_CACHE_MAX = 64;

ctx.onmessage = async (e: MessageEvent<SearchRequest>) => {
  const msg = e.data;
  if (msg.type === "init") {
    const get = <T>(url: string) =>
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<T>;
      });
    ready = Promise.all([get<Template[]>(msg.url), msg.detailsUrl ? get<DetailsMap>(msg.detailsUrl) : null]).then(
      ([list, details]) => {
        if (details) mergeDetails(list, details);
        return buildSearchIndex(msg.category ? list.filter((t) => t.category === msg.category) : list);
      },
    );
    ready.then(
      () => ctx.postMessage({ type: "ready" } satisfies SearchResponse),
      (err) => ctx.postMessage({ type: "error", message: String(err) } satisfies SearchResponse),
    );
    return;
  }
  if (msg.type === "search") {
    if (!ready) return;
    try {
      const index = await ready;
      const key = msg.text.trim();
      let entries = results.get(key);
      if (!entries) {
        entries = [...index.search(msg.text)];
        if (results.size >= RESULT_CACHE_MAX) {
          const oldest = results.keys().next().value;
          if (oldest !== undefined) results.delete(oldest);
        }
        results.set(key, entries);
      }
      ctx.postMessage({ type: "result", id: msg.id, entries } satisfies SearchResponse);
    } catch {
      /* the init error has already been reported */
    }
  }
};
