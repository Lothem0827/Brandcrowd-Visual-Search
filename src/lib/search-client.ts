import { buildSearchIndex, type SearchIndex } from "./search";
import type { Template } from "./schema";

export type SearchRequest =
  | { type: "init"; url: string; detailsUrl?: string; category?: string }
  | { type: "search"; id: number; text: string };
export type SearchResponse =
  | { type: "ready" }
  | { type: "error"; message: string }
  | { type: "result"; id: number; entries: [string, number][] };

export interface SearchClient {
  /** id -> score for a free-text query (AND first, then OR). */
  search(text: string): Promise<Map<string, number>>;
  dispose(): void;
}

/** Main-thread index, built lazily on first use. Used in tests and when workers are unavailable. */
export function createLocalSearchClient(getTemplates: () => Template[] | Promise<Template[]>): SearchClient {
  let index: Promise<SearchIndex> | null = null;
  // Recent queries are re-served without re-running MiniSearch (backspacing, re-typing, the AI
  // keyword pass all repeat the same strings). Bounded so a long session can't grow forever.
  const cache = new Map<string, Promise<Map<string, number>>>();
  const CACHE_MAX = 64;
  const remember = (key: string, value: Promise<Map<string, number>>) => {
    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, value);
    value.catch(() => cache.delete(key));
    return value;
  };
  return {
    search(text) {
      const key = text.trim();
      const hit = cache.get(key);
      if (hit) return hit;
      index ??= Promise.resolve(getTemplates()).then(buildSearchIndex);
      return remember(
        key,
        Promise.resolve(index).then((idx) => idx.search(text)),
      );
    },
    dispose() {
      index = null;
      cache.clear();
    },
  };
}

/**
 * Runs the text index in a Web Worker so building it never blocks the page. Falls back to
 * a lazily built main-thread index if the worker can't start or fails to load the data.
 */
export function createSearchClient(opts: {
  dataUrl: string;
  detailsUrl?: string;
  category?: string;
  /** used by the main-thread fallback; should resolve once details are merged */
  getTemplates: () => Template[] | Promise<Template[]>;
}): SearchClient {
  let fallback: SearchClient | null = null;
  const getFallback = () => (fallback ??= createLocalSearchClient(opts.getTemplates));
  let worker: Worker | null = null;
  try {
    worker = new Worker(new URL("./search.worker.ts", import.meta.url), { type: "module" });
  } catch {
    worker = null;
  }
  if (!worker) return getFallback();

  let nextId = 1;
  const pending = new Map<number, { text: string; resolve: (m: Map<string, number>) => void; reject: (e: unknown) => void }>();
  const failOver = () => {
    worker?.terminate();
    worker = null;
    const local = getFallback();
    for (const [id, p] of pending) {
      pending.delete(id);
      local.search(p.text).then(p.resolve, p.reject);
    }
  };
  worker.onmessage = (e: MessageEvent<SearchResponse>) => {
    const msg = e.data;
    if (msg.type === "error") failOver();
    else if (msg.type === "result") {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      p.resolve(new Map(msg.entries));
    }
  };
  worker.onerror = () => failOver();
  const abs = (u: string) => new URL(u, location.href).href;
  worker.postMessage({
    type: "init",
    url: abs(opts.dataUrl),
    detailsUrl: opts.detailsUrl ? abs(opts.detailsUrl) : undefined,
    category: opts.category,
  } satisfies SearchRequest);

  // Avoids a worker round-trip for a query already answered this session (backspacing, retyping,
  // the typed-words fallback next to the AI keywords). Promises are cached so duplicate in-flight
  // queries also share one round-trip.
  const cache = new Map<string, Promise<Map<string, number>>>();
  const CACHE_MAX = 64;
  const remember = (key: string, value: Promise<Map<string, number>>) => {
    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, value);
    value.catch(() => cache.delete(key));
    return value;
  };

  return {
    search(text) {
      const key = text.trim();
      const hit = cache.get(key);
      if (hit) return hit;
      if (!worker) return getFallback().search(text);
      const id = nextId++;
      return remember(
        key,
        new Promise((resolve, reject) => {
          pending.set(id, { text, resolve, reject });
          worker!.postMessage({ type: "search", id, text } satisfies SearchRequest);
        }),
      );
    },
    dispose() {
      worker?.terminate();
      worker = null;
      pending.clear();
      cache.clear();
      fallback?.dispose();
    },
  };
}
